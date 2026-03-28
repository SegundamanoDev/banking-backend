const Loan = require("../models/Loan");
const Account = require("../models/Account");
const Notification = require("../models/Notification");

exports.applyForLoan = async (req, res) => {
  const { amount, loanType, durationMonths, pin, purpose } = req.body;

  try {
    // 1. Verify Account & Security Clearance
    const userAccount = await Account.findOne({ user: req.user._id });
    if (!userAccount) {
      return res
        .status(404)
        .json({ message: "Account profile not identified." });
    }

    const isPinValid = await userAccount.compareTransactionPin(pin);
    if (!isPinValid) {
      return res
        .status(401)
        .json({ message: "Security checksum failed. Invalid PIN." });
    }

    // 2. Institutional Loan Calculations (5.5% Fixed APR)
    const interestRate = 5.5;
    const totalToRepay = Number(amount) * (1 + interestRate / 100);
    const monthlyPayment = totalToRepay / durationMonths;
    const loanRef = `LN-${Math.random().toString(36).toUpperCase().substring(2, 9)}`;

    // 3. Create Loan Record
    const loan = await Loan.create({
      user: req.user._id,
      loanReference: loanRef,
      amount,
      loanType,
      durationMonths,
      interestRate,
      monthlyPayment: monthlyPayment.toFixed(2),
      totalToRepay: totalToRepay.toFixed(2),
      remainingBalance: totalToRepay.toFixed(2),
      purpose,
      status: "pending",
    });

    await Notification.create({
      user: req.user._id,
      title: "Loan Application Received",
      message: `Your application for a ${loanType} facility of $${amount.toLocaleString()} is currently under institutional review. Ref: ${loanRef}`,
      type: "system",
    });

    res.status(201).json({
      success: true,
      message:
        "Application submitted successfully. Our credit department will review your eligibility within 24-48 hours.",
      applicationDetails: {
        reference: loanRef,
        status: "In-Review",
        monthlyObligation: monthlyPayment.toFixed(2),
      },
    });
  } catch (error) {
    res.status(500).json({
      message:
        "An internal error occurred while processing your credit request. Please contact treasury support.",
    });
  }
};
