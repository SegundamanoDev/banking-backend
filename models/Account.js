const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const accountSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    accountNumber: { type: String, unique: true, required: true },
    balance: { type: Number, default: 0, min: 0 },

    /* --- SECURITY & PIN --- */
    transactionPin: { type: String },
    isPinSet: { type: Boolean, default: false },
    lastPinChange: { type: Date },
    failedPinAttempts: { type: Number, default: 0 }, // Total lifetime fails
    consecutiveFailedAttempts: { type: Number, default: 0 }, // Reset on success, triggers freeze at 3
    resetPinToken: String,
    resetPinExpires: Date,

    /* --- ACCOUNT STATUS & RESTRICTIONS --- */
    status: {
      type: String,
      enum: ["active", "frozen", "suspended", "restricted"],
      default: "active",
    },
    freezeReason: {
      type: String,
      enum: [
        "suspicious_activity",
        "failed_pin_attempts",
        "administrative_hold",
        "verification_required",
        "none",
      ],
      default: "none",
    },
    frozenAt: { type: Date },
    restrictions: {
      canTransfer: { type: Boolean, default: true },
      canRequestLoan: { type: Boolean, default: true },
      canChangeSecurity: { type: Boolean, default: true },
    },

    /* --- LOAN MANAGEMENT --- */
    activeLoan: {
      loanId: { type: mongoose.Schema.Types.ObjectId, ref: "Loan" },
      principal: Number,
      interestRate: Number,
      remainingBalance: Number,
      nextPaymentDate: Date,
      status: {
        type: String,
        enum: ["none", "pending", "active"],
        default: "none",
      },
    },
    isActive: { type: Boolean, default: true }, // General visibility flag
  },
  { timestamps: true },
);

accountSchema.pre("save", async function () {
  if (!this.isModified("transactionPin")) return;

  // 2. Hash the pin
  const salt = await bcrypt.genSalt(10);
  this.transactionPin = await bcrypt.hash(this.transactionPin, salt);
  this.isPinSet = true;
});

accountSchema.methods.compareTransactionPin = async function (enteredPin) {
  if (!this.transactionPin) return false;
  return await bcrypt.compare(enteredPin, this.transactionPin);
};

module.exports = mongoose.model("Account", accountSchema);
