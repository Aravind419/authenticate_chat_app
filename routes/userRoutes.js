const express = require("express");
const router = express.Router();
const User = require("../models/User");
const rateLimit = require("express-rate-limit");

// Rate limiting for user registration
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: "Too many registration attempts, please try again later.",
});

// Register new user
router.post("/register", registerLimiter, async (req, res) => {
  try {
    const { username } = req.body;

    if (!username || username.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: "Username must be at least 3 characters long",
      });
    }

    // Check if username already exists
    const existingUser = await User.findOne({ username: username.trim() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Username already exists",
      });
    }

    // Create new user
    const user = new User({
      username: username.trim(),
    });

    await user.save();

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      user: {
        userId: user.userId,
        username: user.username,
        status: user.status,
        lastSeen: user.lastSeen,
      },
    });
  } catch (error) {
    console.error("User registration error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Get all users (for chat list)
router.get("/users", async (req, res) => {
  try {
    const users = await User.find(
      {},
      {
        userId: 1,
        username: 1,
        status: 1,
        lastSeen: 1,
        isOnline: 1,
      }
    ).sort({ username: 1 });

    res.json({
      success: true,
      users: users,
    });
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Get user by ID
router.get("/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findOne({ userId });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      user: {
        userId: user.userId,
        username: user.username,
        status: user.status,
        lastSeen: user.lastSeen,
        isOnline: user.isOnline,
      },
    });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Update user status
router.put("/user/status/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.body;

    const user = await User.findOne({ userId });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (status === "Online") {
      await user.setOnline();
    } else if (status === "Offline") {
      await user.updateLastSeen();
    } else {
      user.status = status;
      user.lastSeen = new Date();
      await user.save();
    }

    res.json({
      success: true,
      message: "Status updated successfully",
      user: {
        userId: user.userId,
        username: user.username,
        status: user.status,
        lastSeen: user.lastSeen,
        isOnline: user.isOnline,
      },
    });
  } catch (error) {
    console.error("Update status error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Get user status
router.get("/user/status/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findOne({ userId });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      status: user.status,
      lastSeen: user.lastSeen,
      isOnline: user.isOnline,
    });
  } catch (error) {
    console.error("Get status error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

module.exports = router;
