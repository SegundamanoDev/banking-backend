const express = require("express");
const router = express.Router();
const { setup2FA, verify2FA } = require("../controllers/twoFactorController");
const { protect } = require("../middleware/authMiddleware");

router.get("/setup", protect, setup2FA);
router.post("/verify", protect, verify2FA);

module.exports = router;
