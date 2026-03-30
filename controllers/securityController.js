const Account = require("../models/Account");
const Notification = require("../models/Notification");
const crypto = require("crypto");
const sendEmail = require("../utils/sendEmail");

exports.setTransactionPin = async (req, res) => {
  const { pin } = req.body;

  try {
    const account = await Account.findOne({ user: req.user._id });

    // 1. EXISTENCE CHECK
    if (!account) {
      return res.status(404).json({ message: "Account profile not found." });
    }

    // 2. HARD STATUS GUARD
    // Prevents security initialization if the account is frozen/inactive
    if (!account.isActive) {
      return res.status(403).json({
        message:
          "Institutional Hold: Security modifications are disabled while account is under review.",
      });
    }

    // 3. IDEMPOTENCY CHECK
    if (account.isPinSet) {
      return res.status(400).json({
        message: "PIN already established. Security vault is active.",
      });
    }

    if (!/^\d{4}$/.test(pin)) {
      return res.status(400).json({
        message: "Security protocol requires exactly 4 numeric digits.",
      });
    }

    account.transactionPin = pin;
    account.isPinSet = true;
    account.lastPinChange = Date.now();

    await account.save();

    // 6. AUDIT TRAIL / NOTIFICATION
    await Notification.create({
      user: req.user._id,
      title: "Security Vault Activated",
      message:
        "Your 4-digit transaction PIN has been successfully encrypted and stored.",
      type: "system",
    });

    res.status(200).json({
      success: true,
      message: "Security initialized.",
      isPinSet: true,
      lastPinChange: account.lastPinChange,
    });
  } catch (error) {
    console.error("PIN SET ERROR:", error);
    res.status(500).json({
      message: "Cryptographic failure during security initialization.",
    });
  }
};

exports.verifyPin = async (req, res) => {
  const { pin } = req.body;

  try {
    const account = await Account.findOne({ user: req.user._id });

    if (!account.isActive) {
      return res.status(403).json({
        message: "Account is locked due to security risks. Contact support.",
      });
    }

    const isMatch = await account.compareTransactionPin(pin);

    if (!isMatch) {
      account.failedPinAttempts += 1;

      // Lock account after 3 failed attempts
      if (account.failedPinAttempts >= 3) {
        account.isActive = false;
        await account.save();

        await Notification.create({
          user: req.user._id,
          title: "Account Locked",
          message:
            "Multiple failed PIN attempts detected. Your account has been suspended for your protection.",
          type: "alert",
        });

        return res
          .status(403)
          .json({ message: "Too many attempts. Account locked." });
      }

      await account.save();
      return res.status(401).json({
        message: `Invalid PIN. ${3 - account.failedPinAttempts} attempts remaining.`,
      });
    }

    // Success: Reset failed attempts
    account.failedPinAttempts = 0;
    await account.save();

    res.status(200).json({ success: true, message: "PIN verified." });
  } catch (error) {
    res.status(500).json({ message: "Verification failed." });
  }
};

exports.requestPinReset = async (req, res) => {
  try {
    const account = await Account.findOne({ user: req.user._id }).populate(
      "user",
    );

    if (!account.isActive) {
      return res.status(403).json({
        message:
          "Password/PIN recovery is suspended for restricted accounts. Contact institutional support.",
      });
    }
    // 1. Generate a 6-digit secure OTP
    const resetToken = Math.floor(100000 + Math.random() * 900000).toString();

    // 2. Save hashed token to DB (expires in 10 mins)
    account.resetPinToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");
    account.resetPinExpires = Date.now() + 10 * 60 * 1000;
    await account.save();

    // 3. Send Email
    const message = `
      <div style="font-family: sans-serif; border: 1px solid #e2e8f0; padding: 20px; border-radius: 10px;">
        <h2 style="color: #0f172a;">Security Reset Request</h2>
        <p>A request was made to reset your 4-digit Transaction PIN.</p>
        <div style="background: #f1f5f9; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px;">
          ${resetToken}
        </div>
        <p style="font-size: 12px; color: #64748b;">This code expires in 10 minutes. If you did not request this, please secure your account immediately.</p>
      </div>
    `;

    await sendEmail({
      email: account.user.email,
      subject: "Action Required: PIN Reset Authorization",
      html: message,
    });

    res.status(200).json({
      success: true,
      message: "Authorization code sent to registered email.",
    });
  } catch (error) {
    res.status(500).json({ message: "Email delivery failed." });
  }
};

exports.resetPinWithToken = async (req, res) => {
  const { otp, newPin } = req.body;

  try {
    const hashedToken = crypto.createHash("sha256").update(otp).digest("hex");

    const account = await Account.findOne({
      user: req.user._id,
      resetPinToken: hashedToken,
      resetPinExpires: { $gt: Date.now() },
    });

    if (!account)
      return res
        .status(400)
        .json({ message: "Invalid or expired authorization code." });
    account.transactionPin = newPin;
    account.isPinSet = true;
    account.resetPinToken = undefined;
    account.resetPinExpires = undefined;
    account.lastPinChange = Date.now();

    await account.save();

    res
      .status(200)
      .json({ success: true, message: "Security Vault updated successfully." });
  } catch (error) {
    res.status(500).json({ message: "Internal server error during reset." });
  }
};
