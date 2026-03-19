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
    // We put this back so your transfer controller still works!
    transactionPin: {
      type: String,
      required: false, // Optional during registration, set later
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

/**
 * Account-level Middleware
 * Hashes the transactionPin if it's being set or updated on this account
 */
accountSchema.pre("save", async function () {
  // Only proceed if transactionPin is modified and exists
  if (!this.isModified("transactionPin") || !this.transactionPin) {
    return;
  }

  try {
    const salt = (await bcrypt.env) ? parseInt(process.env.SALT_ROUNDS) : 10;
    const generatedSalt = await bcrypt.genSalt(salt);
    this.transactionPin = await bcrypt.hash(this.transactionPin, generatedSalt);
    // No next() call
  } catch (error) {
    throw error; // Mongoose catches this promise rejection
  }
});

// Method to verify PIN during a transfer
accountSchema.methods.compareTransactionPin = async function (enteredPin) {
  return await bcrypt.compare(enteredPin, this.transactionPin);
};

module.exports = mongoose.model("Account", accountSchema);
