const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const rateLimit = require("express-rate-limit");

// Rate limiting for file uploads
const uploadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // limit each IP to 10 uploads per 5 minutes
  message: "Too many uploads, please try again later.",
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = "uploads/";
    // Create uploads directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  },
});

// File filter to allow only specific file types
const fileFilter = (req, file, cb) => {
  const allowedTypes = {
    image: ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"],
    video: ["video/mp4", "video/avi", "video/mov", "video/wmv", "video/flv"],
    document: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ],
    audio: ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp3"],
  };

  const fileType = file.mimetype;
  const isAllowed = Object.values(allowedTypes).flat().includes(fileType);

  if (isAllowed) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Invalid file type. Only images, videos, documents, and audio files are allowed."
      ),
      false
    );
  }
};

// Configure multer with file size limits
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
    files: 1, // Only one file at a time
  },
});

// Upload media file
router.post(
  "/upload",
  uploadLimiter,
  upload.single("media"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No file uploaded",
        });
      }

      const file = req.file;
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "User ID required",
        });
      }

      // Determine file type
      let mediaType = "document";
      if (file.mimetype.startsWith("image/")) {
        mediaType = "image";
      } else if (file.mimetype.startsWith("video/")) {
        mediaType = "video";
      } else if (file.mimetype.startsWith("audio/")) {
        mediaType = "audio";
      }

      // Create file URL
      const fileUrl = `${req.protocol}://${req.get("host")}/uploads/${
        file.filename
      }`;

      res.json({
        success: true,
        message: "File uploaded successfully",
        data: {
          mediaUrl: fileUrl,
          mediaType: mediaType,
          mediaName: file.originalname,
          mediaSize: file.size,
          filename: file.filename,
        },
      });
    } catch (error) {
      console.error("File upload error:", error);

      if (error.message.includes("Invalid file type")) {
        return res.status(400).json({
          success: false,
          message: error.message,
        });
      }

      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          message: "File size too large. Maximum size is 50MB.",
        });
      }

      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
);

// Get file by filename
router.get("/file/:filename", (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(__dirname, "../uploads", filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: "File not found",
      });
    }

    // Send file
    res.sendFile(filePath);
  } catch (error) {
    console.error("Get file error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Delete file
router.delete("/file/:filename", async (req, res) => {
  try {
    const { filename } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID required",
      });
    }

    const filePath = path.join(__dirname, "../uploads", filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: "File not found",
      });
    }

    // Delete file
    fs.unlinkSync(filePath);

    res.json({
      success: true,
      message: "File deleted successfully",
    });
  } catch (error) {
    console.error("Delete file error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Get file info
router.get("/file/info/:filename", (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(__dirname, "../uploads", filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: "File not found",
      });
    }

    // Get file stats
    const stats = fs.statSync(filePath);
    const ext = path.extname(filename).toLowerCase();

    // Determine file type
    let mediaType = "document";
    if ([".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext)) {
      mediaType = "image";
    } else if ([".mp4", ".avi", ".mov", ".wmv", ".flv"].includes(ext)) {
      mediaType = "video";
    } else if ([".mp3", ".wav", ".ogg"].includes(ext)) {
      mediaType = "audio";
    }

    res.json({
      success: true,
      data: {
        filename: filename,
        originalName: filename,
        mediaType: mediaType,
        mediaSize: stats.size,
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime,
      },
    });
  } catch (error) {
    console.error("Get file info error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

module.exports = router;
