const express = require("express");
const router = express.Router();
const {
  setTransactionPin,
  verifyPin,
  requestPinReset,
  resetPinWithToken,
} = require("../controllers/securityController");
const { protect } = require("../middleware/authMiddleware");

router.post("/set-pin", protect, setTransactionPin);
router.post("/verify-pin", protect, verifyPin);
router.post("/request-pin-reset", protect, requestPinReset);
router.post("/verify-pin-reset", protect, resetPinWithToken);

module.exports = router;
