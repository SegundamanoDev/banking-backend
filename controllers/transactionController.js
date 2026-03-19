const Account = require("../models/Account");
const Notification = require("../models/Notification");
const Transaction = require("../models/Transaction");
const PDFDocument = require("pdfkit");
exports.transferMoney = async (req, res) => {
  // 1. Added 'pin' to the request body
  const { recipientAccountNumber, amount, description, pin } = req.body;
  const senderUserId = req.user._id;

  if (amount <= 0)
    return res.status(400).json({ message: "Amount must be greater than 0" });
  if (!pin)
    return res
      .status(400)
      .json({ message: "Security PIN is required to authorize transfer" });

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 2. Fetch sender account & include user to check PIN
    const senderAccount = await Account.findOne({ user: senderUserId }).session(
      session,
    );
    if (!senderAccount) throw new Error("Sender account not found");

    // 3. VALIDATE TRANSACTION PIN
    // We check the PIN stored on the account (or User, depending on your preference)
    const isPinValid = await senderAccount.compareTransactionPin(pin);
    if (!isPinValid) {
      throw new Error("Invalid Security PIN. Transfer denied.");
    }

    const receiverAccount = await Account.findOne({
      accountNumber: recipientAccountNumber,
    }).session(session);

    if (!receiverAccount) throw new Error("Recipient account not found");
    if (senderAccount.accountNumber === recipientAccountNumber) {
      throw new Error(
        "Internal transfers to the same account are not permitted",
      );
    }
    if (senderAccount.balance < amount)
      throw new Error("Insufficient available balance");

    // 4. Atomic Balance Update
    senderAccount.balance -= Number(amount);
    await senderAccount.save({ session });

    receiverAccount.balance += Number(amount);
    await receiverAccount.save({ session });

    const transactionId = `UC-TXN-${Math.random().toString(36).toUpperCase().substring(2, 10)}`;

    // Create records
    const [transaction] = await Transaction.create(
      [
        {
          transactionId,
          sender: senderUserId,
          receiver: receiverAccount.user,
          amount,
          type: "transfer",
          status: "completed",
          description: description || "Institutional Transfer",
          reference: `REF-${Date.now()}`,
        },
      ],
      { session },
    );

    await Notification.create(
      [
        {
          user: senderUserId,
          title: "Debit Notification",
          message: `Debit: $${amount} to ACC: ${recipientAccountNumber}. Ref: ${transactionId}`,
          type: "debit",
        },
        {
          user: receiverAccount.user,
          title: "Credit Notification",
          message: `Credit: $${amount} from ACC: ${senderAccount.accountNumber}. Ref: ${transactionId}`,
          type: "credit",
        },
      ],
      { session },
    );

    await session.commitTransaction();
    session.endSession();

    // 5. Institutional Email Templates (United Capital Branding)
    try {
      const receiverUser = await User.findById(receiverAccount.user);

      const emailHeader = `<div style="background-color: #0f172a; padding: 20px; text-align: center;"><h1 style="color: #10b981; font-style: italic; margin: 0;">UNITED CAPITAL</h1></div>`;

      // Trigger Emails
      sendEmail({
        email: req.user.email,
        subject: "Debit Advice - United Capital",
        html: `${emailHeader}<div style="padding: 20px; border: 1px solid #eee;">
                <h3>Debit Alert</h3>
                <p>An amount of <strong>$${amount}</strong> has been debited from your account.</p>
                <p><strong>Recipient:</strong> ${recipientAccountNumber}</p>
                <p><strong>Ref:</strong> ${transactionId}</p>
                <p><strong>Balance:</strong> $${senderAccount.balance.toLocaleString()}</p>
              </div>`,
      });

      sendEmail({
        email: receiverUser.email,
        subject: "Credit Advice - United Capital",
        html: `${emailHeader}<div style="padding: 20px; border: 1px solid #eee;">
                <h3>Credit Alert</h3>
                <p>Your account has been credited with <strong>$${amount}</strong>.</p>
                <p><strong>From:</strong> ${req.user.firstName} ${req.user.lastName}</p>
                <p><strong>Balance:</strong> $${receiverAccount.balance.toLocaleString()}</p>
              </div>`,
      });
    } catch (err) {
      console.error("Email Advice failed:", err);
    }

    res.status(200).json({
      message: "Transfer successful",
      transactionId: transaction.transactionId,
      newBalance: senderAccount.balance,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get Account Statement (JSON for now, can be formatted as PDF)
// @route   GET /api/transactions/statement
exports.getAccountStatement = async (req, res) => {
  try {
    const transactions = await Transaction.find({
      $or: [{ sender: req.user._id }, { receiver: req.user._id }],
    }).sort({ createdAt: -1 });

    const account = await Account.findOne({ user: req.user._id });

    res.status(200).json({
      generatedAt: new Date(),
      accountInfo: {
        name: `${req.user.firstName} ${req.user.lastName}`,
        accountNumber: account.accountNumber,
        currentBalance: account.balance,
      },
      transactions,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
// @desc    Get all transactions for the logged-in user
// @route   GET /api/transactions/history
exports.getTransactionHistory = async (req, res) => {
  try {
    const userId = req.user._id;

    // Find transactions where user is sender OR receiver
    // We populate 'sender' and 'receiver' to get their names and avatars if needed
    const transactions = await Transaction.find({
      $or: [{ sender: userId }, { receiver: userId }],
    })
      .populate("sender", "firstName lastName avatar")
      .populate("receiver", "firstName lastName avatar")
      .sort({ createdAt: -1 }); // Latest transactions first

    res.status(200).json(transactions);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch transaction history",
      error: error.message,
    });
  }
};
exports.getStatement = async (req, res) => {
  try {
    // req.user.id comes from your protect middleware
    const transactions = await Transaction.find({
      $or: [{ sender: req.user._id }, { receiver: req.user._id }],
    }).sort({ createdAt: -1 });

    const doc = new PDFDocument({ margin: 50 });

    // Set headers for PDF download
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=statement.pdf");

    // Pipe the PDF directly to the response stream
    doc.pipe(res);

    // Header: Brand Identity
    doc
      .fillColor("#0f172a")
      .fontSize(20)
      .text("UNITED CAPITAL", { align: "right" });
    doc
      .fontSize(10)
      .fillColor("#64748b")
      .text("Institutional Ledger Statement", { align: "right" });
    doc.moveDown();

    // Table Header
    doc.rect(50, 150, 500, 20).fill("#f8fafc");
    doc.fillColor("#0f172a").fontSize(10).text("Date", 60, 155);
    doc.text("Description", 150, 155);
    doc.text("Amount", 450, 155);

    // List Transactions
    let y = 180;
    transactions.forEach((tx) => {
      doc
        .fillColor("#1e293b")
        .text(new Date(tx.createdAt).toLocaleDateString(), 60, y);
      doc.text(tx.description || "Transfer", 150, y);
      doc.text(`$${tx.amount.toLocaleString()}`, 450, y);
      y += 25;

      // Handle page overflow if necessary
      if (y > 700) {
        doc.addPage();
        y = 50;
      }
    });

    doc.end();
  } catch (error) {
    res.status(500).json({ message: "Error generating PDF" });
  }
};
