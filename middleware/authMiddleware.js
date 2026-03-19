const jwt = require("jsonwebtoken");
const User = require("../models/User");

const protect = async (req, res, next) => {
  let token;

  // 1. Check if the token exists in the headers
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      // Get token from header (Format: "Bearer <token>")
      token = req.headers.authorization.split(" ")[1];

      // 2. Decode the token and verify it
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // 3. Attach the user to the request object (excluding the password)
      // This allows every protected route to know exactly who is making the request
      req.user = await User.findById(decoded.id).select("-password");

      // 4. Check if the user still exists or is blocked
      if (!req.user) {
        return res.status(401).json({ message: "User no longer exists" });
      }

      if (req.user.status === "blocked") {
        return res
          .status(403)
          .json({ message: "This account has been suspended" });
      }

      next(); // Move to the next function (the controller)
    } catch (error) {
      console.error("JWT Verification Error:", error);
      res.status(401).json({ message: "Not authorized, token failed" });
    }
  }

  if (!token) {
    res.status(401).json({ message: "Not authorized, no token provided" });
  }
};

// 5. Admin Middleware
const admin = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    next();
  } else {
    res
      .status(403)
      .json({ message: "Access denied: Admin privileges required" });
  }
};

module.exports = { protect, admin };
