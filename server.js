const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
require("dotenv").config({ path: "./config.env" });

// Import routes
const userRoutes = require("./routes/userRoutes");
const messageRoutes = require("./routes/messageRoutes");
const mediaRoutes = require("./routes/mediaRoutes");
const { router: authRoutes } = require("./routes/authRoutes");

// Import socket handler
const ChatSocketHandler = require("./sockets/chatSockets");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Serve static files
app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api", userRoutes);
app.use("/api", messageRoutes);
app.use("/api", mediaRoutes);

// Initialize socket handler
const chatSocketHandler = new ChatSocketHandler(io);

// MongoDB Connection
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("✅ Connected to MongoDB Atlas successfully");
  })
  .catch((error) => {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  });

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Connect Together Chat Server is running",
    timestamp: new Date().toISOString(),
    mongodb:
      mongoose.connection.readyState === 1 ? "Connected" : "Disconnected",
  });
});

// Serve the main application
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({
    success: false,
    message: "Internal server error",
    error:
      process.env.NODE_ENV === "development"
        ? err.message
        : "Something went wrong",
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`🚀 Connect Together Chat Server running on port ${PORT}`);
  console.log(`📱 Frontend available at: http://localhost:${PORT}`);
  console.log(`🔌 Socket.IO server ready for real-time connections`);
  console.log(
    `🗄️  MongoDB Atlas connected: ${process.env.MONGODB_URI.split("@")[1]}`
  );
  console.log(`🔐 OTP Authentication enabled`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  server.close(() => {
    console.log("Process terminated");
    mongoose.connection.close();
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down gracefully");
  server.close(() => {
    console.log("Process terminated");
    mongoose.connection.close();
  });
});
