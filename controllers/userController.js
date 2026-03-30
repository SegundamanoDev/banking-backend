const User = require("../models/User");
const Account = require("../models/Account");

exports.getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      "-password -securityPin",
    );
    const account = await Account.findOne({ user: req.user._id });

    if (!user || !account)
      return res.status(404).json({ message: "Profile not found" });

    res.status(200).json({
      user,
      account: {
        accountNumber: account.accountNumber,
        balance: account.balance,
        isPinSet: account.isPinSet,
        isActive: account.isActive,
        lastPinChange: account.lastPinChange,
        status: account.status || "active",
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

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
