const express = require("express");
const dotenv = require("dotenv");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const connectDB = require("./config/db");

// Load env vars
dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();

// --- MIDDLEWARES ---
app.use(helmet()); // Security headers
app.use(cors()); // Allow frontend access
app.use(express.json()); // Body parser
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev")); // Logger
}

// Import Route Files
app.get("/", (req, res) => {
  res.send("Backend is running successfully!");
});
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/transactions", require("./routes/transactionRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));

// Global Error Handler (Sweet UI trick: always return JSON errors)
app.use((err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode).json({
    message: err.message,
    stack: process.env.NODE_ENV === "production" ? null : err.stack,
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
