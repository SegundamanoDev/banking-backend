const User = require("../models/User");
const Account = require("../models/Account");
const sendEmail = require("../utils/sendEmail");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

// Helper to generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "30d" });
};

exports.registerUser = async (req, res) => {
  const { firstName, lastName, email, password } = req.body;

  // 1. Precise Validation
  if (!firstName || !lastName || !email || !password) {
    return res.status(400).json({
      success: false,
      message: "All identification fields are required for KYC compliance.",
    });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 2. Check for existing profile within the session
    const userExists = await User.findOne({ email }).session(session);
    if (userExists) {
      throw new Error(
        "This email is already linked to an institutional profile.",
      );
    }

    // 3. Generate unique identifiers
    const customerId = "UC-" + Math.floor(10000000 + Math.random() * 90000000);
    const accountNumber = Math.floor(
      1000000000 + Math.random() * 9000000000,
    ).toString();

    const newUserArray = await User.create(
      [{ firstName, lastName, email, password, customerId }],
      { session },
    );
    const newUser = newUserArray[0];

    await Account.create(
      [
        {
          user: newUser._id,
          accountNumber,
          balance: 0,
          isPinSet: false,
          isActive: true,
        },
      ],
      { session },
    );

    await session.commitTransaction();
    session.endSession();

    setImmediate(async () => {
      try {
        const welcomeTemplate = `
          <div style="font-family: 'Helvetica', sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;">
            <div style="background-color: #0f172a; padding: 30px; text-align: center;">
              <h1 style="color: #10b981; margin: 0; font-style: italic; letter-spacing: 2px;">UNITED CAPITAL</h1>
            </div>
            <div style="padding: 40px; color: #1e293b; line-height: 1.6;">
              <h2 style="color: #0f172a;">Welcome to the Private Vault, ${firstName}.</h2>
              <p>Your institutional account has been successfully provisioned. To access your dashboard, use the Digital ID provided below:</p>
              <div style="background-color: #f8fafc; padding: 20px; border-radius: 12px; text-align: center; border: 1px border-dashed #cbd5e1; margin: 25px 0;">
                <span style="font-size: 10px; color: #64748b; font-weight: bold; text-transform: uppercase; tracking: 1px;">Institutional Login ID</span>
                <h1 style="color: #0f172a; margin: 5px 0; letter-spacing: 3px;">${customerId}</h1>
              </div>
              <p style="font-size: 12px; color: #64748b;"><b>Security Note:</b> Upon your first login, you will be required to initialize your 4-digit Transaction PIN in the Security Vault.</p>
            </div>
            <div style="background-color: #f1f5f9; padding: 20px; text-align: center; font-size: 10px; color: #94a3b8;">
              &copy; 2026 United Capital Private Wealth Management. All rights reserved.
            </div>
          </div>
        `;

        await sendEmail({
          email: newUser.email,
          subject: "Institutional Access Granted - Action Required",
          html: welcomeTemplate,
        });
      } catch (emailErr) {
        console.error("Non-critical Email Failure:", emailErr.message);
      }
    });

    res.status(201).json({
      success: true,
      user: {
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        customerId: newUser.customerId,
      },
      token: generateToken(newUser._id),
      isPinSet: false,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    res.status(400).json({
      success: false,
      message: error.message || "Registration protocol failed.",
    });
  }
};
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
