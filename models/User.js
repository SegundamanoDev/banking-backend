const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    // REQUIRED: Field for login
    customerId: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    // REQUIRED: Field for transactions
    securityPin: { type: String, required: true },
    avatar: { type: String, default: "" },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    status: {
      type: String,
      enum: ["pending", "active", "blocked"],
      default: "active",
    },
    isTwoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: { type: String },
    idType: { type: String },
    idNumber: { type: String },
  },
  { timestamps: true },
);

// MODERN ASYNC MIDDLEWARE (No 'next' parameter)
userSchema.pre("save", async function () {
  // Hash Password
  if (this.isModified("password")) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }

  // Hash Security PIN
  if (this.isModified("securityPin")) {
    const salt = await bcrypt.genSalt(10);
    this.securityPin = await bcrypt.hash(this.securityPin, salt);
  }
});

userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Method to compare PIN for transactions
userSchema.methods.comparePin = async function (enteredPin) {
  return await bcrypt.compare(enteredPin, this.securityPin);
};

module.exports = mongoose.model("User", userSchema);
