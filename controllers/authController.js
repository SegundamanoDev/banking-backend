const User = require("../models/User");
const Account = require("../models/Account");
const sendEmail = require("../utils/sendEmail");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

// Helper to generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "30d" });
};

// @desc    Register new user & create institutional account
// @route   POST /api/auth/register
exports.registerUser = async (req, res) => {
  const { firstName, lastName, email, password, securityPin } = req.body;

  if (!firstName || !lastName || !email || !password || !securityPin) {
    return res
      .status(400)
      .json({ message: "All security fields are required." });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userExists = await User.findOne({ email }).session(session);
    if (userExists) {
      throw new Error(
        "This email is already linked to an institutional profile.",
      );
    }

    // Generate unique 8-digit Login ID
    const customerId = "UC-" + Math.floor(10000000 + Math.random() * 90000000);

    // 1. Create User Profile
    const newUserArray = await User.create(
      [
        {
          firstName,
          lastName,
          email,
          password,
          customerId,
          securityPin, // Saved to User model
        },
      ],
      { session },
    );

    const newUser = newUserArray[0];

    // 2. Create Linked Bank Account
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
          transactionPin: securityPin, // Syncs PIN to Account model for transfers
        },
      ],
      { session },
    );

    await session.commitTransaction();
    session.endSession();

    // 3. Post-Registration: Send Welcome Email
    setImmediate(async () => {
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
        console.error("Non-fatal email error:", emailErr.message);
      }
    });

    res.status(201).json({
      firstName: newUser.firstName,
      customerId: newUser.customerId,
      token: generateToken(newUser._id),
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(400).json({ message: error.message || "Registration failed" });
  }
};

// @desc    Authenticate user & get token
// @route   POST /api/auth/login
exports.loginUser = async (req, res) => {
  const { customerId, password } = req.body;

  try {
    const user = await User.findOne({ customerId });

    if (user && (await user.comparePassword(password))) {
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
      res.status(401).json({ message: "Invalid Digital ID or Password" });
    }
  } catch (error) {
    res.status(500).json({ message: "Server error during authentication" });
  }
};
