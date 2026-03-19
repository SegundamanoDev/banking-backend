const express = require("express");
const router = express.Router();
const {
  getAllUsers,
  updateUserStatus,
  getAllTransactions,
  getSystemStats,
  adminDeposit,
} = require("../controllers/adminController");
const { protect, admin } = require("../middleware/authMiddleware");

// Apply double protection to all routes in this file
router.use(protect);
router.use(admin);

router.get("/users", getAllUsers);
router.post("/deposit", adminDeposit);
router.patch("/users/:id/status", updateUserStatus);
router.get("/transactions", getAllTransactions);
router.get("/stats", getSystemStats);

module.exports = router;
