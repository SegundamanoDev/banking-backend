const express = require("express");
const router = express.Router();
const { registerUser, loginUser } = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

// @route   POST /api/auth/register
// @desc    Public route to create a new user and account
router.post("/register", registerUser);

// @route   POST /api/auth/login
// @desc    Public route to login and get token
router.post("/login", loginUser);

// @route   GET /api/auth/me
// @desc    Private route to get current logged-in user details
// Note: We use the 'protect' middleware here!
router.get("/me", protect, (req, res) => {
  res.status(200).json(req.user);
});

module.exports = router;
