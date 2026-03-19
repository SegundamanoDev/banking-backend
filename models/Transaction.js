const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    transactionId: { type: String, unique: true, required: true }, // e.g., TXN-123456
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    amount: { type: Number, required: true },
    type: {
      type: String,
      enum: ["transfer", "deposit", "withdrawal", "bill_pay"],
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "reversed"],
      default: "completed",
    },

    description: { type: String },
    reference: { type: String }, // Internal bank reference
  },
  { timestamps: true },
);

module.exports = mongoose.model("Transaction", transactionSchema);
