const express = require("express");
const router = express.Router();
const {
  getUserProfile,
  updateProfile,
} = require("../controllers/userController");
const { protect } = require("../middleware/authMiddleware");

// Standard user routes
router.get("/me", protect, getUserProfile);
router.patch("/profile", protect, updateProfile);

module.exports = router;
