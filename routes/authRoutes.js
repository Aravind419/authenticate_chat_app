const express = require("express");
const router = express.Router();
const User = require("../models/User");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");

// Only require and initialize Twilio if not in development mode
let client = null;
let twilioPhoneNumber = null;
if (process.env.NODE_ENV !== "development") {
  const twilio = require("twilio");
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
  client = twilio(accountSid, authToken);
}

// Rate limiting for OTP requests
const otpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 3, // limit each IP to 3 OTP requests per 5 minutes
  message: "Too many OTP requests, please try again later.",
});

// Rate limiting for OTP verification
const verifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // limit each IP to 5 verification attempts per 10 minutes
  message: "Too many verification attempts, please try again later.",
});

// Send OTP
router.post("/send-otp", otpLimiter, async (req, res) => {
  try {
    const { phoneNumber, username } = req.body;

    if (!phoneNumber || !username) {
      return res.status(400).json({
        success: false,
        message: "Phone number and username are required",
      });
    }

    // Validate phone number format (basic validation)
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    if (!phoneRegex.test(phoneNumber.replace(/\s/g, ""))) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone number format",
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

    // Check if phone number already exists
    const existingPhone = await User.findOne({ phoneNumber });
    if (existingPhone) {
      return res.status(400).json({
        success: false,
        message: "Phone number already registered",
      });
    }

    // Create new user
    const user = new User({
      username: username.trim(),
      phoneNumber: phoneNumber.replace(/\s/g, ""),
    });

    // Generate OTP
    await user.generateOTP();

    // For development/testing, return the OTP in response
    if (process.env.NODE_ENV === "development") {
      res.json({
        success: true,
        message: "OTP sent successfully (development mode)",
        userId: user.userId,
        otp: user.otp.code, // Only in development
      });
    } else {
      // In production, you would integrate with Twilio or other SMS service
      res.json({
        success: true,
        message: "OTP sent successfully",
        userId: user.userId,
      });
    }
  } catch (error) {
    console.error("Send OTP error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Verify OTP and complete registration
router.post("/verify-otp", verifyLimiter, async (req, res) => {
  try {
    const { userId, otpCode } = req.body;

    if (!userId || !otpCode) {
      return res.status(400).json({
        success: false,
        message: "User ID and OTP code are required",
      });
    }

    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Verify OTP
    const isValid = await user.verifyOTP(otpCode);
    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.userId, username: user.username },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      message: "Phone number verified successfully",
      user: {
        userId: user.userId,
        username: user.username,
        phoneNumber: user.phoneNumber,
        isVerified: user.isVerified,
      },
      token: token,
    });
  } catch (error) {
    console.error("Verify OTP error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Resend OTP
router.post("/resend-otp", otpLimiter, async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Generate new OTP
    await user.generateOTP();

    // Send new OTP via SMS
    try {
      await client.messages.create({
        body: `Your new Connect Together verification code is: ${user.otp.code}. Valid for 10 minutes.`,
        from: twilioPhoneNumber,
        to: user.phoneNumber,
      });

      res.json({
        success: true,
        message: "New OTP sent successfully",
      });
    } catch (smsError) {
      console.error("SMS sending error:", smsError);

      // For development/testing
      if (process.env.NODE_ENV === "development") {
        res.json({
          success: true,
          message: "New OTP sent successfully (development mode)",
          otp: user.otp.code,
        });
      } else {
        res.status(500).json({
          success: false,
          message: "Failed to send OTP. Please try again.",
        });
      }
    }
  } catch (error) {
    console.error("Resend OTP error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Login with phone number
router.post("/login", async (req, res) => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required",
      });
    }

    const user = await User.findOne({
      phoneNumber: phoneNumber.replace(/\s/g, ""),
    });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found with this phone number",
      });
    }

    // Generate OTP for login
    await user.generateOTP();

    // Send OTP via SMS
    try {
      await client.messages.create({
        body: `Your Connect Together login code is: ${user.otp.code}. Valid for 10 minutes.`,
        from: twilioPhoneNumber,
        to: user.phoneNumber,
      });

      res.json({
        success: true,
        message: "Login OTP sent successfully",
        userId: user.userId,
      });
    } catch (smsError) {
      console.error("SMS sending error:", smsError);

      // For development/testing
      if (process.env.NODE_ENV === "development") {
        res.json({
          success: true,
          message: "Login OTP sent successfully (development mode)",
          userId: user.userId,
          otp: user.otp.code,
        });
      } else {
        res.status(500).json({
          success: false,
          message: "Failed to send OTP. Please try again.",
        });
      }
    }
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Verify login OTP
router.post("/verify-login", verifyLimiter, async (req, res) => {
  try {
    const { userId, otpCode } = req.body;

    if (!userId || !otpCode) {
      return res.status(400).json({
        success: false,
        message: "User ID and OTP code are required",
      });
    }

    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Verify OTP
    const isValid = await user.verifyOTP(otpCode);
    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.userId, username: user.username },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      message: "Login successful",
      user: {
        userId: user.userId,
        username: user.username,
        phoneNumber: user.phoneNumber,
        isVerified: user.isVerified,
      },
      token: token,
    });
  } catch (error) {
    console.error("Verify login error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Access token required",
    });
  }

  jwt.verify(
    token,
    process.env.JWT_SECRET || "your-secret-key",
    (err, user) => {
      if (err) {
        return res.status(403).json({
          success: false,
          message: "Invalid or expired token",
        });
      }
      req.user = user;
      next();
    }
  );
};

// Get current user profile
router.get("/profile", authenticateToken, async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.user.userId });
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
        phoneNumber: user.phoneNumber,
        isVerified: user.isVerified,
        status: user.status,
        lastSeen: user.lastSeen,
        isOnline: user.isOnline,
      },
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

module.exports = { router, authenticateToken };
