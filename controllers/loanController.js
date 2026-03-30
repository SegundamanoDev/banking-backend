const Loan = require("../models/Loan");
const Account = require("../models/Account");
const Notification = require("../models/Notification");
const mongoose = require("mongoose");

exports.applyForLoan = async (req, res) => {
  const { amount, loanType, durationMonths, pin, purpose } = req.body;
  const userId = req.user._id;

  // 1. Basic Input Validation
  if (!amount || amount <= 0 || !durationMonths) {
    return res
      .status(400)
      .json({ message: "Invalid loan parameters specified." });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 2. Identify & Secure Account
    const userAccount = await Account.findOne({ user: userId }).session(
      session,
    );
    if (!userAccount) throw new Error("Account profile not identified.");

    // 3. HARD SECURITY CHECK: Lock Status
    // Prevents frozen/suspended users from accessing credit
    if (!userAccount.isActive) {
      throw new Error(
        "ACCESS_RESTRICTED: This account is currently under administrative hold. Credit facilities are suspended.",
      );
    }

    // 4. PIN INITIALIZATION CHECK
    // Ensures the user has actually set up a PIN before trying to use one
    if (!userAccount.isPinSet) {
      throw new Error(
        "SECURITY_ERROR: Transaction PIN not initialized. Please visit the Security Vault to establish your credentials.",
      );
    }

    // 5. PIN VERIFICATION (Final Gate)
    const isPinValid = await userAccount.compareTransactionPin(pin);
    if (!isPinValid) {
      throw new Error(
        "VERIFICATION_FAILED: Security checksum failed. Unauthorized Request PIN.",
      );
    }

    // 6. ENFORCE POLICY: No Duplicate Active Facilities
    const existingLoan = await Loan.findOne({
      user: userId,
      status: { $in: ["pending", "active"] },
    }).session(session);

    if (existingLoan) {
      throw new Error(
        "Policy Violation: You already have an active or pending credit facility.",
      );
    }

    // 7. INSTITUTIONAL CALCULATIONS (5.5% Fixed APR)
    const principal = Number(amount);
    const interestRate = 5.5;
    const totalToRepay = principal * (1 + interestRate / 100);
    const monthlyPayment = totalToRepay / durationMonths;
    const loanRef = `LN-${Math.random().toString(36).toUpperCase().substring(2, 9)}`;

    // 8. CREATE LOAN RECORD
    const [loan] = await Loan.create(
      [
        {
          user: userId,
          loanReference: loanRef,
          amount: principal,
          loanType,
          durationMonths,
          interestRate,
          monthlyPayment: monthlyPayment.toFixed(2),
          totalToRepay: totalToRepay.toFixed(2),
          remainingBalance: totalToRepay.toFixed(2),
          purpose,
          status: "pending",
        },
      ],
      { session },
    );

    // 9. DISPATCH SYSTEM NOTIFICATION
    await Notification.create(
      [
        {
          user: userId,
          title: "Loan Application Received",
          message: `Your request for a $${principal.toLocaleString()} ${loanType} is under institutional review. Ref: ${loanRef}.`,
          type: "system",
        },
      ],
      { session },
    );

    // Commit changes
    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      success: true,
      message:
        "Application submitted. Underwriting will complete within 24-48 hours.",
      applicationDetails: {
        reference: loanRef,
        status: "In-Review",
        monthlyObligation: monthlyPayment.toFixed(2),
        totalDebt: totalToRepay.toFixed(2),
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    // Mapping specific security errors to 403 Forbidden if necessary
    const isSecurityError =
      error.message.includes("ACCESS_RESTRICTED") ||
      error.message.includes("SECURITY_ERROR");

    res.status(isSecurityError ? 403 : 400).json({
      status: "Application Declined",
      message: error.message || "An error occurred during underwriting.",
    });
  }
};
