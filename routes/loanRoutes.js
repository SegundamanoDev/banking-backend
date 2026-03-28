const express = require("express");
const router = express.Router();
const { applyForLoan } = require("../controllers/loanController");
const { protect } = require("../middleware/authMiddleware");

router.post("/apply", protect, applyForLoan);

module.exports = router;
