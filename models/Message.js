const mongoose = require("mongoose");

const reactionSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
  },
  reaction: {
    type: String,
    required: true,
    enum: ["❤️", "😂", "👍", "👎", "😮", "😢", "😡", "🎉", "👏", "🙏"],
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

const messageSchema = new mongoose.Schema(
  {
    messageId: {
      type: String,
      required: true,
      unique: true,
      default: () => "msg_" + Math.random().toString(36).substr(2, 9),
    },
    senderId: {
      type: String,
      required: true,
      ref: "User",
    },
    receiverId: {
      type: String,
      required: true,
      ref: "User",
    },
    messageType: {
      type: String,
      enum: ["text", "image", "video", "document", "audio", "call"],
      default: "text",
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    isEdited: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedFor: [
      {
        type: String,
        ref: "User",
      },
    ],
    reactions: [reactionSchema],
    mediaUrl: {
      type: String,
    },
    mediaType: {
      type: String,
      enum: ["image", "video", "document", "audio"],
    },
    mediaName: {
      type: String,
    },
    mediaSize: {
      type: Number,
    },
    callStatus: {
      type: String,
      enum: ["initiated", "connected", "ended", "missed", "declined"],
      default: "initiated",
    },
    callDuration: {
      type: Number, // in seconds
    },
    readBy: [
      {
        userId: {
          type: String,
          ref: "User",
        },
        readAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    deliveredTo: [
      {
        userId: {
          type: String,
          ref: "User",
        },
        deliveredAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Index for efficient querying
messageSchema.index({ senderId: 1, receiverId: 1, timestamp: -1 });
messageSchema.index({ messageId: 1 });

// Method to check if message can be edited (15 minutes window)
messageSchema.methods.canEdit = function () {
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
  return this.timestamp > fifteenMinutesAgo;
};

// Method to add reaction
messageSchema.methods.addReaction = function (userId, reaction) {
  const existingReactionIndex = this.reactions.findIndex(
    (r) => r.userId === userId
  );

  if (existingReactionIndex !== -1) {
    // Update existing reaction
    this.reactions[existingReactionIndex].reaction = reaction;
    this.reactions[existingReactionIndex].timestamp = new Date();
  } else {
    // Add new reaction
    this.reactions.push({ userId, reaction });
  }

  return this.save();
};

// Method to remove reaction
messageSchema.methods.removeReaction = function (userId) {
  this.reactions = this.reactions.filter((r) => r.userId !== userId);
  return this.save();
};

// Method to mark as read
messageSchema.methods.markAsRead = function (userId) {
  const existingReadIndex = this.readBy.findIndex((r) => r.userId === userId);

  if (existingReadIndex === -1) {
    this.readBy.push({ userId });
  }

  return this.save();
};

// Method to mark as delivered
messageSchema.methods.markAsDelivered = function (userId) {
  const existingDeliveredIndex = this.deliveredTo.findIndex(
    (d) => d.userId === userId
  );

  if (existingDeliveredIndex === -1) {
    this.deliveredTo.push({ userId });
  }

  return this.save();
};

module.exports = mongoose.model("Message", messageSchema);
