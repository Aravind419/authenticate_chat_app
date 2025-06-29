const express = require("express");
const router = express.Router();
const Message = require("../models/Message");
const User = require("../models/User");
const rateLimit = require("express-rate-limit");

// Rate limiting for message sending
const messageLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // limit each IP to 30 messages per minute
  message: "Too many messages, please slow down.",
});

// Get chat history between two users
router.get("/messages/:userId/:receiverId", async (req, res) => {
  try {
    const { userId, receiverId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    // Validate users exist
    const [sender, receiver] = await Promise.all([
      User.findOne({ userId }),
      User.findOne({ userId: receiverId }),
    ]);

    if (!sender || !receiver) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Get messages between the two users
    const messages = await Message.find({
      $or: [
        { senderId: userId, receiverId: receiverId },
        { senderId: receiverId, receiverId: userId },
      ],
      isDeleted: false,
    })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .populate("senderId", "username")
      .populate("receiverId", "username");

    // Mark messages as read for the current user
    const unreadMessages = messages.filter(
      (msg) =>
        msg.receiverId.userId === userId &&
        !msg.readBy.some((read) => read.userId === userId)
    );

    if (unreadMessages.length > 0) {
      await Promise.all(unreadMessages.map((msg) => msg.markAsRead(userId)));
    }

    res.json({
      success: true,
      messages: messages.reverse(), // Return in chronological order
      total: messages.length,
    });
  } catch (error) {
    console.error("Get messages error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Send a new message
router.post("/messages/send", messageLimiter, async (req, res) => {
  try {
    const {
      senderId,
      receiverId,
      content,
      messageType = "text",
      mediaUrl,
      mediaType,
      mediaName,
      mediaSize,
    } = req.body;

    if (!senderId || !receiverId || !content) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    // Validate users exist
    const [sender, receiver] = await Promise.all([
      User.findOne({ userId: senderId }),
      User.findOne({ userId: receiverId }),
    ]);

    if (!sender || !receiver) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Create new message
    const message = new Message({
      senderId,
      receiverId,
      content: content.trim(),
      messageType,
      mediaUrl,
      mediaType,
      mediaName,
      mediaSize,
    });

    await message.save();

    // Populate sender and receiver info
    await message.populate("senderId", "username");
    await message.populate("receiverId", "username");

    res.status(201).json({
      success: true,
      message: "Message sent successfully",
      data: message,
    });
  } catch (error) {
    console.error("Send message error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Edit a message (15 minutes window)
router.put("/messages/edit/:messageId", async (req, res) => {
  try {
    const { messageId } = req.params;
    const { newContent, userId } = req.body;

    if (!newContent || !userId) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    const message = await Message.findOne({ messageId });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    // Check if user is the sender
    if (message.senderId !== userId) {
      return res.status(403).json({
        success: false,
        message: "You can only edit your own messages",
      });
    }

    // Check if message can be edited (15 minutes window)
    if (!message.canEdit()) {
      return res.status(400).json({
        success: false,
        message: "Message can only be edited within 15 minutes of sending",
      });
    }

    // Update message
    message.content = newContent.trim();
    message.isEdited = true;
    message.editedAt = new Date();

    await message.save();

    res.json({
      success: true,
      message: "Message edited successfully",
      data: message,
    });
  } catch (error) {
    console.error("Edit message error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Delete message for everyone
router.delete("/messages/delete/:messageId", async (req, res) => {
  try {
    const { messageId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID required",
      });
    }

    const message = await Message.findOne({ messageId });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    // Check if user is the sender
    if (message.senderId !== userId) {
      return res.status(403).json({
        success: false,
        message: "You can only delete your own messages",
      });
    }

    // Mark as deleted for everyone
    message.isDeleted = true;
    message.deletedFor = [message.senderId, message.receiverId];

    await message.save();

    res.json({
      success: true,
      message: "Message deleted successfully",
    });
  } catch (error) {
    console.error("Delete message error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Add reaction to message
router.post("/messages/reaction/:messageId", async (req, res) => {
  try {
    const { messageId } = req.params;
    const { userId, reaction } = req.body;

    if (!userId || !reaction) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    const message = await Message.findOne({ messageId });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    // Add reaction
    await message.addReaction(userId, reaction);

    res.json({
      success: true,
      message: "Reaction added successfully",
      data: message,
    });
  } catch (error) {
    console.error("Add reaction error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Remove reaction from message
router.delete("/messages/reaction/:messageId", async (req, res) => {
  try {
    const { messageId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID required",
      });
    }

    const message = await Message.findOne({ messageId });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    // Remove reaction
    await message.removeReaction(userId);

    res.json({
      success: true,
      message: "Reaction removed successfully",
      data: message,
    });
  } catch (error) {
    console.error("Remove reaction error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Mark message as read
router.put("/messages/read/:messageId", async (req, res) => {
  try {
    const { messageId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID required",
      });
    }

    const message = await Message.findOne({ messageId });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    // Mark as read
    await message.markAsRead(userId);

    res.json({
      success: true,
      message: "Message marked as read",
    });
  } catch (error) {
    console.error("Mark as read error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

module.exports = router;
