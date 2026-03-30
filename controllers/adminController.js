const Transaction = require("../models/Transaction");
const Account = require("../models/Account");
const Loan = require("../models/Loan");
const Notification = require("../models/Notification");
const mongoose = require("mongoose");
const User = require("../models/User");

exports.approveInternationalWire = async (req, res) => {
  const { transactionId } = req.params;
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const transaction = await Transaction.findOne({
      transactionId,
      status: "pending",
    }).session(session);
    if (!transaction)
      throw new Error("Transaction record not found or already processed.");

    // Update status to completed (Money was already deducted from sender in the transfer step)
    transaction.status = "completed";
    await transaction.save({ session });

    await Notification.create(
      [
        {
          user: transaction.sender,
          title: "SWIFT Settlement Completed",
          message: `International remittance Ref: ${transactionId} has been cleared by Treasury and dispatched to the beneficiary bank.`,
          type: "system",
        },
      ],
      { session },
    );

    await session.commitTransaction();
    res.status(200).json({
      success: true,
      message: "Wire instruction successfully settled and dispatched.",
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

// --- 2. APPROVE & DISBURSE LOAN ---
exports.approveLoan = async (req, res) => {
  const { loanId } = req.params;
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const loan = await Loan.findOne({ _id: loanId, status: "pending" }).session(
      session,
    );
    if (!loan)
      throw new Error("Loan application not found or already adjudicated.");

    const userAccount = await Account.findOne({ user: loan.user }).session(
      session,
    );
    if (!userAccount)
      throw new Error("Beneficiary account profile is missing.");

    // 1. Update Loan Status
    loan.status = "active";
    loan.startDate = Date.now();
    await loan.save({ session });

    // 2. Disburse Capital to User Account
    userAccount.balance += Number(loan.amount);
    await userAccount.save({ session });

    // 3. Create a Disbursement Transaction Record
    const txnId = `UC-LND-${Math.random().toString(36).toUpperCase().substring(2, 10)}`;
    await Transaction.create(
      [
        {
          transactionId: txnId,
          sender: req.user._id,
          receiver: loan.user,
          recipientAccountNumber: userAccount.accountNumber,
          amount: loan.amount,
          type: "loan_disbursement",
          category: "internal",
          status: "completed",
          description: `Disbursement of ${loan.loanType} facility: Ref ${loan.loanReference}`,
          reference: loan.loanReference,
        },
      ],
      { session },
    );

    await Notification.create(
      [
        {
          user: loan.user,
          title: "Capital Disbursement Notice",
          message: `Credit Facility Approved. $${loan.amount.toLocaleString()} has been credited to your account. Ref: ${loan.loanReference}`,
          type: "credit",
        },
      ],
      { session },
    );

    await session.commitTransaction();
    res.status(200).json({
      success: true,
      message:
        "Credit facility approved. Capital has been disbursed to the client's account.",
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    // 1. Fetch ALL users (no role filter)
    // We use .lean() to get a plain JS object we can easily modify
    const users = await User.find({})
      .select("-password -securityPin") // Security first
      .sort({ createdAt: -1 })
      .lean();

    // 2. Fetch ALL accounts
    const accounts = await Account.find({}).lean();

    // 3. Map the accounts to the users
    const completeData = users.map((user) => {
      // Find the account where the 'user' field matches this user's ID
      const userAccount = accounts.find(
        (acc) => acc.user.toString() === user._id.toString(),
      );

      return {
        ...user,
        // If an account exists, use its balance; otherwise, default to 0
        balance: userAccount ? userAccount.balance : 0,
        accountNumber: userAccount ? userAccount.accountNumber : "No Account",
        currency: userAccount ? userAccount.currency : "USD",
        accountType: userAccount ? userAccount.accountType : "N/A",
      };
    });

    // 4. Send the full array to the frontend
    res.status(200).json(completeData);
  } catch (error) {
    console.error("Fetch All Users Error:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Monitor ALL transactions in the system
// @route   GET /api/admin/transactions
exports.getAllTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find({})
      .populate("sender", "firstName lastName email")
      .populate("receiver", "firstName lastName email")
      .sort({ createdAt: -1 });

    res.status(200).json(transactions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Enhanced System Stats for Admin Command Center
// @route   GET /api/admin/stats
exports.getSystemStats = async (req, res) => {
  try {
    // 1. Basic Counts
    const totalUsers = await User.countDocuments({ role: "user" });
    const totalTransactions = await Transaction.countDocuments({});

    // 2. Total AUM (Assets Under Management)
    const accounts = await Account.find({});
    const totalDeposits = accounts.reduce((acc, curr) => acc + curr.balance, 0);

    // 3. Liquidity Trend (Data for the Line Chart)
    // This looks at the last 7 days of successful transactions
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const chartData = await Transaction.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo }, status: "completed" } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          amount: { $sum: "$amount" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // 4. Recent System Activity (For the Live Ticker)
    // Fetches the last 10 important events
    const recentActivity = await Transaction.find({})
      .populate("sender", "firstName lastName")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    const formattedActivity = recentActivity.map((tx) => ({
      type: tx.type.toUpperCase(),
      msg: `${tx.type === "deposit" ? "Inflow" : "Outflow"} of $${tx.amount.toLocaleString()} - Ref: ${tx.transactionId}`,
      time: new Date(tx.createdAt).toLocaleTimeString(),
      status: tx.status,
    }));

    res.status(200).json({
      totalUsers,
      totalDeposits,
      totalTransactions,
      chartData,
      recentActivity: formattedActivity,
    });
  } catch (error) {
    console.error("Stats Error:", error);
    res.status(500).json({ message: error.message });
  }
};

exports.adminDeposit = async (req, res) => {
  const { userId, amount, description, createdAt } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const account = await Account.findOne({ user: userId }).session(session);
    if (!account) throw new Error("Account not found");

    // Update Balance
    account.balance += Number(amount);
    await account.save({ session });

    // Create Transaction (This is what the Frontend sums up for 'Inflow')
    await Transaction.create(
      [
        {
          transactionId: `ADM-${Math.random().toString(36).toUpperCase().substring(2, 10)}`,
          sender: req.user._id, // Admin is the sender
          receiver: userId, // User is the receiver
          amount: Number(amount),
          type: "deposit",
          status: "completed",
          description: description || "Institutional Credit",
          createdAt: createdAt || new Date(),
        },
      ],
      { session },
    );

    await session.commitTransaction();
    res.status(200).json({ message: "Funds Injected & Ledger Synced" });
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

// adminController.js additions

// --- 1. GET PENDING LOANS FOR UNDERWRITING QUEUE ---
exports.getPendingLoans = async (req, res) => {
  try {
    const pendingLoans = await Loan.find({ status: "pending" })
      .populate("user", "firstName lastName email")
      .sort({ createdAt: -1 });

    res.status(200).json(pendingLoans);
  } catch (error) {
    res.status(500).json({ message: "Failed to access Underwriting Queue." });
  }
};

// --- 2. REJECT LOAN APPLICATION ---
exports.rejectLoan = async (req, res) => {
  const { loanId } = req.params;
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const loan = await Loan.findOne({ _id: loanId, status: "pending" }).session(
      session,
    );
    if (!loan)
      throw new Error("Loan application not found or already processed.");

    // Update status to rejected
    loan.status = "rejected";
    await loan.save({ session });

    // Notify User
    await Notification.create(
      [
        {
          user: loan.user,
          title: "Credit Application Declined",
          message: `Your request for a ${loan.loanType} facility has been declined by our underwriting team at this time.`,
          type: "system",
        },
      ],
      { session },
    );

    await session.commitTransaction();
    res.status(200).json({ success: true, message: "Credit facility denied." });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

exports.approveLoan = async (req, res) => {
  const { loanId } = req.params;
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Fetch Loan with Session
    const loan = await Loan.findOne({ _id: loanId, status: "pending" }).session(
      session,
    );
    if (!loan)
      throw new Error("Loan application not found or already processed.");

    const userAccount = await Account.findOne({ user: loan.user }).session(
      session,
    );
    if (!userAccount)
      throw new Error("Beneficiary account profile is missing.");

    if (!userAccount.isActive) {
      throw new Error(
        "Disbursement Blocked: The recipient account is currently frozen/inactive.",
      );
    }
    // A. Update Loan record
    loan.status = "active";
    loan.startDate = new Date();
    await loan.save({ session });

    // B. Update Account Balance AND Link Facility
    userAccount.balance += Number(loan.amount);
    userAccount.activeLoan = {
      loanId: loan._id,
      principal: Number(loan.amount),
      remainingBalance: Number(loan.totalToRepay),
      interestRate: loan.interestRate,
      nextPaymentDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // T+30 Days
      status: "active",
    };

    // C. Save Account Changes
    await userAccount.save({ session });

    // D. Create Ledger Entry
    const txnId = `UC-LND-${Math.random().toString(36).toUpperCase().substring(2, 10)}`;
    await Transaction.create(
      [
        {
          transactionId: txnId,
          sender: req.user._id,
          receiver: loan.user,
          recipientAccountNumber: userAccount.accountNumber,
          amount: loan.amount,
          type: "loan_disbursement",
          status: "completed",
          description: `Disbursement: ${loan.loanType} - Ref: ${loan.loanReference}`,
          reference: loan.loanReference,
        },
      ],
      { session },
    );

    // E. Notification
    await Notification.create(
      [
        {
          user: loan.user,
          title: "Capital Disbursement Notice",
          message: `Credit Facility Approved. $${loan.amount.toLocaleString()} credited to ${userAccount.accountNumber}.`,
          type: "credit",
        },
      ],
      { session },
    );

    await session.commitTransaction();
    res.status(200).json({ success: true, message: "Funds disbursed." });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

exports.getPendingWires = async (req, res) => {
  try {
    const pendingWires = await Transaction.find({
      category: "international",
      status: "pending",
    })
      .populate("sender", "firstName lastName email")
      .sort({ createdAt: -1 });

    res.status(200).json(pendingWires);
  } catch (error) {
    console.error("Fetch Wires Error:", error);
    res.status(500).json({ message: "Failed to access Treasury Queue." });
  }
};

exports.updateUserStatus = async (req, res) => {
  const { status, freezeReason, restrictions } = req.body;
  const { id: userId } = req.params;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Update User Document (General Status)
    const user = await User.findByIdAndUpdate(
      userId,
      { status: status || "active" },
      { new: true, session },
    );
    if (!user) throw new Error("User profile not found");

    // 2. Update Account Document (Granular Control)
    const updateData = {
      status: status || "active",
      isActive: status === "active",
    };

    if (freezeReason) updateData.freezeReason = freezeReason;
    if (restrictions) updateData.restrictions = restrictions;
    if (status === "frozen") updateData.frozenAt = new Date();

    const account = await Account.findOneAndUpdate(
      { user: userId },
      { $set: updateData },
      { new: true, session },
    );

    // 3. Notify User of specific changes
    await Notification.create(
      [
        {
          user: userId,
          title:
            status === "active"
              ? "Security Clearance Updated"
              : "Account Restricted",
          message:
            status === "active"
              ? "Your account restrictions have been lifted."
              : `Administrative action taken: ${freezeReason || status}. Contact support.`,
          type: status === "active" ? "system" : "alert",
        },
      ],
      { session },
    );

    await session.commitTransaction();
    res.status(200).json({ success: true, account });
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({ message: error.message });
  } finally {
    session.endSession();
  }
};
