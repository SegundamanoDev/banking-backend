const User = require("../models/User");
const Account = require("../models/Account");

// @desc    Get user profile and account details
// @route   GET /api/users/me
exports.getUserProfile = async (req, res) => {
  try {
    // req.user is already available from the 'protect' middleware
    const user = await User.findById(req.user._id).select("-password");

    // Find the account associated with this user
    const account = await Account.findOne({ user: req.user._id });

    if (!user || !account) {
      return res
        .status(404)
        .json({ message: "User or Account information not found" });
    }

    res.status(200).json({
      user,
      account: {
        accountNumber: account.accountNumber,
        balance: account.balance,
        accountType: account.accountType,
        currency: account.currency,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update profile (Avatar or Name)
// @route   PATCH /api/users/profile
exports.updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (user) {
      user.firstName = req.body.firstName || user.firstName;
      user.lastName = req.body.lastName || user.lastName;
      user.avatar = req.body.avatar || user.avatar;

      const updatedUser = await user.save();
      res.json({
        _id: updatedUser._id,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        email: updatedUser.email,
        avatar: updatedUser.avatar,
      });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
