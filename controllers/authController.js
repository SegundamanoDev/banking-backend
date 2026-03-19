const User = require("../models/User");
const Account = require("../models/Account");
const sendEmail = require("../utils/sendEmail");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "30d" });
};

exports.registerUser = async (req, res) => {
  const { firstName, lastName, email, password, securityPin } = req.body;

  // 1. Initial Validation
  if (!firstName || !lastName || !email || !password || !securityPin) {
    return res
      .status(400)
      .json({ message: "All security fields are required." });
  }

  // Start a Mongoose Session for the Transaction
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 2. Check if identity already exists
    const userExists = await User.findOne({ email }).session(session);
    if (userExists) {
      res.status(400);
      throw new Error(
        "This email is already linked to an institutional profile.",
      );
    }

    // 3. Generate UNIQUE 8-Digit Customer ID (The Login ID)
    const customerId = "UC-" + Math.floor(10000000 + Math.random() * 90000000);

    const newUserArray = await User.create(
      [
        {
          firstName,
          lastName,
          email,
          password,
          customerId,
          securityPin,
        },
      ],
      { session },
    );

    const newUser = newUserArray[0];

    const accountNumber = Math.floor(
      1000000000 + Math.random() * 9000000000,
    ).toString();

    await Account.create(
      [
        {
          user: newUser._id,
          accountNumber,
          balance: 0,
          accountType: "savings",
        },
      ],
      { session },
    );

    await session.commitTransaction();
    session.endSession();

    try {
      const emailTemplate = `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #f1f5f9; border-radius: 20px; overflow: hidden;">
          <div style="background-color: #0f172a; padding: 40px; text-align: center;">
            <h1 style="color: #10b981; margin: 0; font-style: italic;">UNITED CAPITAL</h1>
          </div>
          <div style="padding: 40px; color: #1e293b;">
            <p>Dear ${firstName},</p>
            <p>Your institutional profile is ready. Use the Digital ID below to access the vault.</p>
            <div style="background-color: #f8fafc; padding: 20px; border-radius: 12px; text-align: center; border: 1px solid #e2e8f0;">
              <small style="color: #64748b; text-transform: uppercase;">Digital ID (Login)</small>
              <h2 style="color: #0f172a; margin: 10px 0;">${customerId}</h2>
            </div>
          </div>
        </div>
      `;

      await sendEmail({
        email: newUser.email,
        subject: "Institutional Access Granted",
        html: emailTemplate,
      });
    } catch (emailErr) {
      console.error("Email service non-fatal error:", emailErr.message);
      // We don't return 500 here because the account WAS created successfully.
    }

    // 9. Send Success Response to Frontend
    res.status(201).json({
      firstName: newUser.firstName,
      customerId: newUser.customerId,
      token: generateToken(newUser._id),
    });
  } catch (error) {
    // Rollback DB changes if anything fails
    await session.abortTransaction();
    session.endSession();

    console.error("CRITICAL REGISTRATION ERROR:", error.message);
    res.status(error.statusCode || 500).json({
      message: error.message || "Institutional Provisioning Failed.",
    });
  }
};

exports.loginUser = async (req, res) => {
  const { customerId, password } = req.body;

  try {
    // Find user by their Digital ID
    const user = await User.findOne({ customerId });

    if (user && (await user.comparePassword(password))) {
      // Handle 2FA if enabled (logic for future expansion)
      if (user.isTwoFactorEnabled) {
        return res.status(200).json({
          twoFactorRequired: true,
          userId: user._id,
        });
      }

      res.status(200).json({
        user: {
          _id: user._id,
          firstName: user.firstName,
          customerId: user.customerId,
          email: user.email,
          role: user.role,
        },
        token: generateToken(user._id),
      });
    } else {
      res
        .status(401)
        .json({ message: "Invalid Digital ID or Access Password." });
    }
  } catch (error) {
    console.error("LOGIN ERROR:", error.message);
    res.status(500).json({ message: "Authentication service unavailable." });
  }
};
