const mongoose = require("mongoose");
const Account = require("../models/Account");
const Transaction = require("../models/Transaction");
const Notification = require("../models/Notification");
const User = require("../models/User");

exports.transferMoney = async (req, res) => {
  const {
    category,
    recipientAccountNumber,
    amount,
    description,
    pin,
    swiftCode,
    bankName,
    recipientName,
  } = req.body;

  const senderUserId = req.user._id;

  // 1. Pre-Transaction Validation
  const transferAmount = Number(amount);
  if (!transferAmount || transferAmount <= 0) {
    return res
      .status(400)
      .json({ message: "Invalid transaction amount specified." });
  }
  if (!pin) {
    return res.status(400).json({
      message: "Security authorization (PIN) is required to proceed.",
    });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 2. Identify & Secure Source Account
    const senderAccount = await Account.findOne({ user: senderUserId }).session(
      session,
    );
    if (!senderAccount)
      throw new Error("Source account could not be identified.");

    // 3. HARD SECURITY CHECK: Account Lock Status
    if (!senderAccount.isActive) {
      throw new Error(
        "Instruction Declined: This account is under a security lock due to multiple failed PIN attempts. Contact Treasury Support.",
      );
    }

    // 4. CRYPTOGRAPHIC PIN VERIFICATION
    const isPinValid = await senderAccount.compareTransactionPin(pin);
    if (!isPinValid) {
      throw new Error(
        "Security checksum mismatch. Unauthorized Transaction PIN.",
      );
    }

    // 5. LIQUIDITY CHECK
    if (senderAccount.balance < transferAmount) {
      throw new Error(
        "Liquidity Error: Insufficient funds to clear this settlement.",
      );
    }

    let receiverUserId = null;
    let transactionStatus = "completed";
    let finalRecipientName = recipientName;
    let finalBankName = bankName;

    if (category === "local") {
      const receiverAccount = await Account.findOne({
        accountNumber: recipientAccountNumber,
      }).session(session);

      if (!receiverAccount) {
        throw new Error(
          "Beneficiary Validation Failed: Account number not recognized within our internal ledger.",
        );
      }

      if (receiverAccount.accountNumber === senderAccount.accountNumber) {
        throw new Error(
          "Instruction Declined: Circular remittance (self-transfer) is not permitted via this route.",
        );
      }

      receiverAccount.balance += transferAmount;
      await receiverAccount.save({ session });

      receiverUserId = receiverAccount.user;
      finalBankName = "United Capital Bank";
    } else if (category === "international") {
      if (!swiftCode || !bankName) {
        throw new Error(
          "Compliance Error: SWIFT/BIC and Bank Name are mandatory for cross-border wire settlement.",
        );
      }
      transactionStatus = "pending";
    } else {
      throw new Error("Unsupported transaction category.");
    }

    senderAccount.balance -= transferAmount;
    await senderAccount.save({ session });

    const transactionId = `UC-TXN-${Math.random().toString(36).toUpperCase().substring(2, 10)}`;
    const [transaction] = await Transaction.create(
      [
        {
          transactionId,
          sender: senderUserId,
          receiver: receiverUserId,
          recipientAccountNumber,
          recipientName:
            finalRecipientName ||
            (category === "local"
              ? "UC INTERNAL CLIENT"
              : "EXTERNAL BENEFICIARY"),
          recipientBankName: finalBankName,
          swiftCode: swiftCode || "UCB-INT-CLR",
          amount: transferAmount,
          type: "transfer",
          category,
          status: transactionStatus,
          description:
            description || `Institutional ${category.toUpperCase()} Remittance`,
          reference: `REF-${Date.now()}`,
        },
      ],
      { session },
    );

    await Notification.create(
      [
        {
          user: senderUserId,
          title: "Debit Advice Notification",
          message: `Account debited $${transferAmount.toLocaleString()} for ${category} remittance to ${recipientAccountNumber}. Ref: ${transactionId}. Status: ${transactionStatus}.`,
          type: "debit",
        },
      ],
      { session },
    );

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message:
        category === "international"
          ? "Wire instruction received and queued for Treasury clearance."
          : "Transfer finalized. Beneficiary account credited successfully.",
      transactionId: transaction.transactionId,
      availableBalance: senderAccount.balance,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    return res.status(400).json({
      status: "Instruction Failed",
      message:
        error.message ||
        "An internal error occurred during the settlement process.",
    });
  }
};

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
