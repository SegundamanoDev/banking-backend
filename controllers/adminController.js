const User = require("../models/User");
const Account = require("../models/Account");
const Transaction = require("../models/Transaction");
const mongoose = require("mongoose");
// @desc    Get all users for management
// @route   GET /api/admin/users
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

// @desc    Approve or Block a user
// @route   PATCH /api/admin/users/:id/status
exports.updateUserStatus = async (req, res) => {
  const { status } = req.body; // 'active' or 'blocked'

  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.status = status;
    await user.save();

    res.status(200).json({ message: `User status updated to ${status}`, user });
  } catch (error) {
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

// @desc    Get System Stats (Total Balance, User Count, etc.)
// @route   GET /api/admin/stats
exports.getSystemStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({ role: "user" });
    const accounts = await Account.find({});
    const totalDeposits = accounts.reduce((acc, curr) => acc + curr.balance, 0);
    const totalTransactions = await Transaction.countDocuments({});

    res.status(200).json({
      totalUsers,
      totalDeposits,
      totalTransactions,
    });
  } catch (error) {
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
