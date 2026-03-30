const mongoose = require("mongoose");

const loanSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    loanReference: { type: String, unique: true, required: true },
    loanType: {
      type: String,
      enum: ["personal", "business", "mortgage"],
      required: true,
    },
    amount: { type: Number, required: true },
    interestRate: { type: Number, default: 5.5 },
    durationMonths: { type: Number, required: true },
    purpose: { type: String },
    status: {
      type: String,
      enum: ["pending", "approved", "active", "rejected", "paid"],
      default: "pending",
    },
    monthlyPayment: Number,
    totalToRepay: Number,
    remainingBalance: Number,
    startDate: Date,
    nextPaymentDate: Date,
  },
  { timestamps: true },
);

module.exports = mongoose.model("Loan", loanSchema);
