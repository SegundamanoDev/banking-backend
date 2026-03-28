const express = require("express");
const router = express.Router();
const {
  getAllUsers,
  updateUserStatus,
  getAllTransactions,
  getSystemStats,
  adminDeposit,
  getPendingWires,
  approveInternationalWire,
  getPendingLoans,
  approveLoan,
  rejectLoan,
} = require("../controllers/adminController");
const { protect, admin } = require("../middleware/authMiddleware");

router.use(protect);
router.use(admin);

router.get("/users", getAllUsers);
router.patch("/users/:id/status", updateUserStatus);

router.post("/deposit", adminDeposit);

router.get("/wires/pending", getPendingWires);
router.patch(
  "/transactions/:transactionId/approve-wire",
  approveInternationalWire,
);

router.get("/loans/pending", getPendingLoans);
router.patch("/loans/:loanId/approve", approveLoan);
router.patch("/loans/:loanId/reject", rejectLoan);

router.get("/transactions", getAllTransactions);
router.get("/stats", getSystemStats);

module.exports = router;
