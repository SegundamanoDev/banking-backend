const mongoose = require("mongoose");
const loanSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    loanType: {
      type: String,
      enum: ["personal", "business", "mortgage"],
      required: true,
    },
    amount: { type: Number, required: true },
    interestRate: { type: Number, default: 5.5 }, // Percentage
    durationMonths: { type: Number, required: true },
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
