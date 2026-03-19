const { authenticator } = require("otplib");
const QRCode = require("qrcode");
const User = require("../models/User");

// @desc    Step 1: Generate 2FA Secret & QR Code
exports.setup2FA = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    // 1. Generate a unique secret for the user
    const secret = authenticator.generateSecret();

    // 2. Create an OTP Auth URL (standard format for Authenticator apps)
    const otpauth = authenticator.keyuri(user.email, "GeminiBank", secret);

    // 3. Convert that URL into a QR Code Image (Data URL)
    const qrCodeImage = await QRCode.toDataURL(otpauth);

    // 4. Temporarily save secret (not enabled yet!)
    user.twoFactorSecret = secret;
    await user.save();

    res.json({ qrCodeImage, secret });
  } catch (error) {
    res.status(500).json({ message: "2FA setup failed" });
  }
};

// @desc    Step 2: Verify & Enable 2FA
exports.verify2FA = async (req, res) => {
  const { token } = req.body; // The 6-digit code from user's phone

  try {
    const user = await User.findById(req.user._id);

    // Verify the token against the saved secret
    const isValid = authenticator.check(token, user.twoFactorSecret);

    if (isValid) {
      user.isTwoFactorEnabled = true;
      await user.save();
      res.json({ message: "2FA Enabled Successfully" });
    } else {
      res.status(400).json({ message: "Invalid code. Try again." });
    }
  } catch (error) {
    res.status(500).json({ message: "Verification failed" });
  }
};
