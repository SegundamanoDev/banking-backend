const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const accountSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    accountNumber: {
      type: String,
      unique: true,
      required: true,
    },
    accountType: {
      type: String,
      enum: ["savings", "checking", "corporate", "treasury"],
      default: "savings",
    },
    balance: {
      type: Number,
      default: 0,
      min: [0, "Balance cannot be negative"],
    },
    currency: {
      type: String,
      uppercase: true,
      default: "USD",
    },
    transactionPin: {
      type: String,
      required: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

// Middleware to hash PIN before saving
accountSchema.pre("save", async function () {
  if (!this.isModified("transactionPin") || !this.transactionPin) return;

  try {
    const salt = await bcrypt.genSalt(10);
    this.transactionPin = await bcrypt.hash(this.transactionPin, salt);
  } catch (error) {
    throw new Error("Encryption failed");
  }
});

// Helper to verify PIN
accountSchema.methods.compareTransactionPin = async function (enteredPin) {
  if (!this.transactionPin) {
    throw new Error(
      "Transaction PIN not initialized. Please set one in settings.",
    );
  }
  return await bcrypt.compare(enteredPin, this.transactionPin);
};

module.exports = mongoose.model("Account", accountSchema);
