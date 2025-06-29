const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      default: () => "u_" + Math.random().toString(36).substr(2, 9),
    },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 20,
    },
    phoneNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    otp: {
      code: String,
      expiresAt: Date,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["Online", "Offline", "Away"],
      default: "Offline",
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    profilePicture: {
      type: String,
      default: null,
    },
    lastActiveChat: {
      type: String,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

// Update lastSeen when user goes offline
userSchema.methods.updateLastSeen = function () {
  this.lastSeen = new Date();
  this.isOnline = false;
  this.status = "Offline";
  return this.save();
};

// Set user as online
userSchema.methods.setOnline = function () {
  this.isOnline = true;
  this.status = "Online";
  this.lastSeen = new Date();
  return this.save();
};

// Generate OTP
userSchema.methods.generateOTP = function () {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  this.otp = {
    code: otp,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
  };
  return this.save();
};

// Verify OTP
userSchema.methods.verifyOTP = function (otpCode) {
  if (!this.otp || !this.otp.code || !this.otp.expiresAt) {
    return false;
  }

  if (new Date() > this.otp.expiresAt) {
    this.otp = null;
    this.save();
    return false;
  }

  if (this.otp.code === otpCode) {
    this.isVerified = true;
    this.otp = null;
    this.save();
    return true;
  }

  return false;
};

// Clear OTP
userSchema.methods.clearOTP = function () {
  this.otp = null;
  return this.save();
};

module.exports = mongoose.model("User", userSchema);
