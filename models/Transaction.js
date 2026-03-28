const mongoose = require("mongoose");
const transactionSchema = new mongoose.Schema(
  {
    transactionId: { type: String, unique: true, required: true },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    receiver: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    recipientName: String,
    recipientAccountNumber: { type: String, required: true },
    recipientBankName: String,
    swiftCode: String,
    country: String,

    amount: { type: Number, required: true },
    type: {
      type: String,
      enum: [
        "transfer",
        "deposit",
        "withdrawal",
        "loan_disbursement",
        "loan_repayment",
      ],
      required: true,
    },
    category: {
      type: String,
      enum: ["local", "international", "internal"],
      default: "local",
    },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed", "declined"],
      default: "completed",
    },
    description: String,
    reference: String,
  },
  { timestamps: true },
);
module.exports = mongoose.model("Transaction", transactionSchema);
