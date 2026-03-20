const express = require("express");
const router = express.Router();
const {
  transferMoney,
  getTransactionHistory,
  getStatement,
} = require("../controllers/transactionController");
const { protect } = require("../middleware/authMiddleware");

// All transaction routes are protected
router.get("/statement", protect, getStatement);
router.post("/transfer", protect, transferMoney);
router.get("/history", protect, getTransactionHistory);

module.exports = router;
