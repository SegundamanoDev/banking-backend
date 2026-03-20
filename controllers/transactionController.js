const Notification = require("../models/Notification");
const Transaction = require("../models/Transaction");
const PDFDocument = require("pdfkit");
const mongoose = require("mongoose");
const Account = require("../models/Account");
const User = require("../models/User");
const sendEmail = require("../utils/sendEmail");

exports.transferMoney = async (req, res) => {
  const { recipientAccountNumber, amount, description, pin } = req.body;
  const senderUserId = req.user._id;

  if (!recipientAccountNumber || !amount || !pin) {
    return res
      .status(400)
      .json({ message: "Recipient, amount, and PIN are required" });
  }

  if (amount <= 0) {
    return res
      .status(400)
      .json({ message: "Amount must be greater than zero" });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const senderAccount = await Account.findOne({ user: senderUserId }).session(
      session,
    );
    if (!senderAccount) throw new Error("Sender account not found");

    const isPinValid = await senderAccount.compareTransactionPin(pin);
    if (!isPinValid) throw new Error("Invalid Security PIN");

    if (senderAccount.balance < amount) throw new Error("Insufficient funds");

    const receiverAccount = await Account.findOne({
      accountNumber: recipientAccountNumber,
    }).session(session);
    if (!receiverAccount) throw new Error("Recipient account not found");

    if (senderAccount.accountNumber === recipientAccountNumber) {
      throw new Error("Cannot transfer to the same account");
    }

    senderAccount.balance -= Number(amount);
    receiverAccount.balance += Number(amount);

    await senderAccount.save({ session });
    await receiverAccount.save({ session });

    const transactionId = `UC-TXN-${Math.random().toString(36).toUpperCase().substring(2, 10)}`;

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
      { session, ordered: true },
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
      { session, ordered: true },
    );

    await session.commitTransaction();
    session.endSession();

    // Background process: Email Advice
    setImmediate(async () => {
      try {
        const receiverUser = await User.findById(receiverAccount.user);

        // COMMON STYLES
        const styles = `
          font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
          max-width: 600px;
          margin: 0 auto;
          background-color: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          overflow: hidden;
        `;

        const header = `
          <div style="background-color: #0f172a; padding: 30px; text-align: center;">
            <h1 style="color: #10b981; font-style: italic; margin: 0; font-size: 24px; letter-spacing: 2px;">UNITED CAPITAL</h1>
            <p style="color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; margin-top: 5px;">Institutional Private Wealth</p>
          </div>
        `;

        const footer = `
          <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
            <p style="font-size: 12px; color: #94a3b8; margin: 0;">This is an automated security notification. Please do not reply.</p>
            <p style="font-size: 10px; color: #cbd5e1; margin-top: 10px; text-transform: uppercase;">© 2026 United Capital Private Wealth Management.</p>
          </div>
        `;

        // 1. DEBIT ADVICE (For the Sender)
        await sendEmail({
          email: req.user.email,
          subject: "Debit Advice [Action Required]",
          html: `
            <div style="${styles}">
              ${header}
              <div style="padding: 40px 30px;">
                <h2 style="font-size: 20px; font-weight: 800; color: #0f172a; margin-bottom: 20px; border-bottom: 2px solid #f1f5f9; padding-bottom: 10px;">Debit Advice</h2>
                <p style="color: #475569; font-size: 14px; line-height: 1.6;">Dear ${req.user.firstName},</p>
                <p style="color: #475569; font-size: 14px; line-height: 1.6;">Your account has been debited for the following transaction:</p>
                
                <table style="width: 100%; margin-top: 20px; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 10px 0; color: #94a3b8; font-size: 12px; text-transform: uppercase;">Amount</td>
                    <td style="padding: 10px 0; text-align: right; font-weight: bold; color: #ef4444;">$${Number(amount).toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; color: #94a3b8; font-size: 12px; text-transform: uppercase;">Recipient</td>
                    <td style="padding: 10px 0; text-align: right; font-weight: bold; color: #0f172a;">${recipientAccountNumber}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; color: #94a3b8; font-size: 12px; text-transform: uppercase;">Ref Number</td>
                    <td style="padding: 10px 0; text-align: right; font-family: monospace; color: #475569;">${transactionId}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; color: #94a3b8; font-size: 12px; text-transform: uppercase; border-top: 1px solid #f1f5f9;">New Balance</td>
                    <td style="padding: 10px 0; text-align: right; font-weight: 800; color: #0f172a; border-top: 1px solid #f1f5f9;">$${senderAccount.balance.toLocaleString()}</td>
                  </tr>
                </table>
              </div>
              ${footer}
            </div>
          `,
        });

        // 2. CREDIT ADVICE (For the Receiver)
        if (receiverUser?.email) {
          await sendEmail({
            email: receiverUser.email,
            subject: "Credit Advice [Inbound Capital]",
            html: `
              <div style="${styles}">
                ${header}
                <div style="padding: 40px 30px;">
                  <h2 style="font-size: 20px; font-weight: 800; color: #0f172a; margin-bottom: 20px; border-bottom: 2px solid #f1f5f9; padding-bottom: 10px;">Credit Advice</h2>
                  <p style="color: #475569; font-size: 14px; line-height: 1.6;">Dear ${receiverUser.firstName},</p>
                  <p style="color: #475569; font-size: 14px; line-height: 1.6;">Your account was credited via an institutional wire transfer:</p>
                  
                  <table style="width: 100%; margin-top: 20px; border-collapse: collapse;">
                    <tr>
                      <td style="padding: 10px 0; color: #94a3b8; font-size: 12px; text-transform: uppercase;">Amount Received</td>
                      <td style="padding: 10px 0; text-align: right; font-weight: bold; color: #10b981;">+$${Number(amount).toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td style="padding: 10px 0; color: #94a3b8; font-size: 12px; text-transform: uppercase;">Originator</td>
                      <td style="padding: 10px 0; text-align: right; font-weight: bold; color: #0f172a;">${req.user.firstName} ${req.user.lastName}</td>
                    </tr>
                    <tr>
                      <td style="padding: 10px 0; color: #94a3b8; font-size: 12px; text-transform: uppercase; border-top: 1px solid #f1f5f9;">New Balance</td>
                      <td style="padding: 10px 0; text-align: right; font-weight: 800; color: #0f172a; border-top: 1px solid #f1f5f9;">$${receiverAccount.balance.toLocaleString()}</td>
                    </tr>
                  </table>
                </div>
                ${footer}
              </div>
            `,
          });
        }
      } catch (err) {
        console.error("Post-transaction email error:", err.message);
      }
    });

    return res.status(200).json({
      message: "Transfer successful",
      transactionId: transaction.transactionId,
      newBalance: senderAccount.balance,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return res.status(400).json({ message: error.message });
  }
};

// @desc    Get all transactions for the logged-in user
// @route   GET /api/transactions/history
exports.getTransactionHistory = async (req, res) => {
  try {
    const userId = req.user._id;

    const transactions = await Transaction.find({
      $or: [{ sender: userId }, { receiver: userId }],
    })
      .populate("sender", "firstName lastName avatar")
      .populate("receiver", "firstName lastName avatar")
      .sort({ createdAt: -1 });

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
    const userId = req.user._id;

    // 1. Fetch User and Account details for the header
    const userAccount = await Account.findOne({ user: userId });
    if (!userAccount)
      return res.status(404).json({ message: "Account not found" });

    // 2. Fetch transactions (Oldest First for balance calculation)
    const transactions = await Transaction.find({
      $or: [{ sender: userId }, { receiver: userId }],
    }).sort({ createdAt: 1 });

    const doc = new PDFDocument({ margin: 50, size: "A4" });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=UC-Statement-${Date.now()}.pdf`,
    );
    doc.pipe(res);

    // --- HEADER: BRANDING ---
    doc.rect(0, 0, 600, 120).fill("#0f172a"); // Dark Navy Header
    doc
      .fillColor("#10b981")
      .fontSize(22)
      .font("Helvetica-BoldOblique")
      .text("UNITED CAPITAL", 50, 40);
    doc
      .fillColor("#64748b")
      .fontSize(8)
      .font("Helvetica-Bold")
      .text("INSTITUTIONAL PRIVATE WEALTH MANAGEMENT", 50, 65);

    // Header Right: Account Info
    doc
      .fillColor("#ffffff")
      .fontSize(9)
      .font("Helvetica")
      .text("Statement Date:", 400, 40, { align: "right" });
    doc.font("Helvetica-Bold").text(
      new Date().toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
      400,
      52,
      { align: "right" },
    );
    doc
      .font("Helvetica")
      .text(`Account: ${userAccount.accountNumber}`, 400, 64, {
        align: "right",
      });

    doc.moveDown(5);

    // --- CUSTOMER DETAILS ---
    doc
      .fillColor("#0f172a")
      .fontSize(12)
      .font("Helvetica-Bold")
      .text(`${req.user.firstName} ${req.user.lastName}`, 50, 140);
    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor("#64748b")
      .text("Registered Private Client", 50, 155);

    // --- SUMMARY BOX ---
    doc.rect(350, 140, 200, 60).stroke("#e2e8f0");
    doc.fillColor("#64748b").fontSize(8).text("CURRENT BALANCE", 360, 150);
    doc
      .fillColor("#0f172a")
      .fontSize(18)
      .font("Helvetica-Bold")
      .text(`$${userAccount.balance.toLocaleString()}.00`, 360, 165);

    doc.moveDown(4);

    // --- LEDGER TABLE HEADER ---
    const tableTop = 230;
    doc.rect(50, tableTop, 500, 25).fill("#f8fafc");
    doc.fillColor("#64748b").fontSize(8).font("Helvetica-Bold");
    doc.text("DATE", 60, tableTop + 10);
    doc.text("TRANSACTION DETAILS", 130, tableTop + 10);
    doc.text("AMOUNT", 380, tableTop + 10);
    doc.text("BALANCE", 470, tableTop + 10);

    let y = tableTop + 35;

    let runningBalance = 0;

    const listData = transactions
      .map((tx) => {
        const isIncome = tx.receiver.toString() === userId.toString();
        const change = isIncome ? tx.amount : -tx.amount;
        runningBalance += change;
        return { ...tx._doc, runningBalance, isIncome };
      })
      .reverse();

    listData.forEach((tx) => {
      // Row Background for readability
      if (y > 750) {
        doc.addPage();
        y = 50;
      }

      doc.fillColor("#1e293b").fontSize(8).font("Helvetica");

      // Date
      doc.text(new Date(tx.createdAt).toLocaleDateString(), 60, y);

      // Description & ID
      doc.font("Helvetica-Bold").text(tx.description || "Transfer", 130, y);
      doc
        .font("Helvetica")
        .fontSize(7)
        .fillColor("#94a3b8")
        .text(`ID: ${tx.transactionId}`, 130, y + 10);

      // Amount (Green for credit, Black for debit)
      const amtColor = tx.isIncome ? "#10b981" : "#0f172a";
      const prefix = tx.isIncome ? "+" : "-";
      doc
        .fillColor(amtColor)
        .fontSize(8)
        .font("Helvetica-Bold")
        .text(`${prefix}$${tx.amount.toLocaleString()}`, 380, y);

      // Running Balance
      doc
        .fillColor("#0f172a")
        .text(`$${tx.runningBalance.toLocaleString()}`, 470, y);

      // Border line
      doc
        .moveTo(50, y + 22)
        .lineTo(550, y + 22)
        .strokeColor("#f1f5f9")
        .stroke();

      y += 35;
    });

    // --- FOOTER ---
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      doc
        .fontSize(7)
        .fillColor("#cbd5e1")
        .text(
          "United Capital is a licensed financial institution. This document is a computer-generated statement and requires no signature.",
          50,
          800,
          { align: "center", width: 500 },
        );
    }

    doc.end();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error generating Ledger PDF" });
  }
};
