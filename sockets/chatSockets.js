const User = require("../models/User");
const Message = require("../models/Message");

class ChatSocketHandler {
  constructor(io) {
    this.io = io;
    this.connectedUsers = new Map(); // userId -> socketId
    this.typingUsers = new Map(); // userId -> { receiverId, timeout }

    this.setupSocketHandlers();
  }

  setupSocketHandlers() {
    this.io.on("connection", (socket) => {
      console.log("User connected:", socket.id);

      // User joins with their userId
      socket.on("join", async (data) => {
        try {
          const { userId } = data;

          if (!userId) {
            socket.emit("error", { message: "User ID required" });
            return;
          }

          // Update user status to online
          const user = await User.findOne({ userId });
          if (user) {
            await user.setOnline();
            this.connectedUsers.set(userId, socket.id);
            socket.userId = userId;

            // Broadcast user online status
            this.io.emit("userStatus", {
              userId: user.userId,
              status: "Online",
              lastSeen: user.lastSeen,
            });

            console.log(`User ${user.username} (${userId}) joined`);
          }
        } catch (error) {
          console.error("Join error:", error);
          socket.emit("error", { message: "Failed to join" });
        }
      });

      // Handle typing indicator
      socket.on("typing", (data) => {
        try {
          const { senderId, receiverId } = data;

          if (!senderId || !receiverId) {
            return;
          }

          // Clear existing typing timeout for this user
          const existingTimeout = this.typingUsers.get(senderId);
          if (existingTimeout && existingTimeout.receiverId === receiverId) {
            clearTimeout(existingTimeout.timeout);
          }

          // Emit typing event to receiver
          const receiverSocketId = this.connectedUsers.get(receiverId);
          if (receiverSocketId) {
            this.io.to(receiverSocketId).emit("typing", {
              senderId,
              receiverId,
              isTyping: true,
            });
          }

          // Set timeout to stop typing indicator
          const timeout = setTimeout(() => {
            this.stopTyping(senderId, receiverId);
          }, 3000); // Stop typing indicator after 3 seconds

          this.typingUsers.set(senderId, { receiverId, timeout });
        } catch (error) {
          console.error("Typing error:", error);
        }
      });

      // Handle new message
      socket.on("newMessage", async (data) => {
        try {
          const {
            senderId,
            receiverId,
            content,
            messageType,
            mediaUrl,
            mediaType,
            mediaName,
            mediaSize,
          } = data;

          if (!senderId || !receiverId || !content) {
            socket.emit("error", { message: "Missing required fields" });
            return;
          }

          // Create new message
          const message = new Message({
            senderId,
            receiverId,
            content,
            messageType: messageType || "text",
            mediaUrl,
            mediaType,
            mediaName,
            mediaSize,
          });

          await message.save();
          await message.populate("senderId", "username");
          await message.populate("receiverId", "username");

          // Stop typing indicator
          this.stopTyping(senderId, receiverId);

          // Emit to sender (confirmation)
          socket.emit("messageSent", {
            success: true,
            message: message,
          });

          // Emit to receiver (if online)
          const receiverSocketId = this.connectedUsers.get(receiverId);
          if (receiverSocketId) {
            this.io.to(receiverSocketId).emit("newMessage", {
              message: message,
            });

            // Mark as delivered
            await message.markAsDelivered(receiverId);
          }

          console.log(`Message sent from ${senderId} to ${receiverId}`);
        } catch (error) {
          console.error("New message error:", error);
          socket.emit("error", { message: "Failed to send message" });
        }
      });

      // Handle message edit
      socket.on("editMessage", async (data) => {
        try {
          const { messageId, newContent, userId } = data;

          if (!messageId || !newContent || !userId) {
            socket.emit("error", { message: "Missing required fields" });
            return;
          }

          const message = await Message.findOne({ messageId });

          if (!message) {
            socket.emit("error", { message: "Message not found" });
            return;
          }

          // Check if user is the sender
          if (message.senderId !== userId) {
            socket.emit("error", {
              message: "You can only edit your own messages",
            });
            return;
          }

          // Check if message can be edited (15 minutes window)
          if (!message.canEdit()) {
            socket.emit("error", {
              message:
                "Message can only be edited within 15 minutes of sending",
            });
            return;
          }

          // Update message
          message.content = newContent.trim();
          message.isEdited = true;
          message.editedAt = new Date();

          await message.save();

          // Emit to both sender and receiver
          const receiverSocketId = this.connectedUsers.get(message.receiverId);
          if (receiverSocketId) {
            this.io.to(receiverSocketId).emit("messageEdited", {
              messageId,
              newContent: message.content,
              editedAt: message.editedAt,
            });
          }

          socket.emit("messageEdited", {
            messageId,
            newContent: message.content,
            editedAt: message.editedAt,
          });
        } catch (error) {
          console.error("Edit message error:", error);
          socket.emit("error", { message: "Failed to edit message" });
        }
      });

      // Handle message deletion
      socket.on("deleteMessage", async (data) => {
        try {
          const { messageId, userId } = data;

          if (!messageId || !userId) {
            socket.emit("error", { message: "Missing required fields" });
            return;
          }

          const message = await Message.findOne({ messageId });

          if (!message) {
            socket.emit("error", { message: "Message not found" });
            return;
          }

          // Check if user is the sender
          if (message.senderId !== userId) {
            socket.emit("error", {
              message: "You can only delete your own messages",
            });
            return;
          }

          // Mark as deleted for everyone
          message.isDeleted = true;
          message.deletedFor = [message.senderId, message.receiverId];

          await message.save();

          // Emit to both sender and receiver
          const receiverSocketId = this.connectedUsers.get(message.receiverId);
          if (receiverSocketId) {
            this.io.to(receiverSocketId).emit("messageDeleted", {
              messageId,
            });
          }

          socket.emit("messageDeleted", {
            messageId,
          });
        } catch (error) {
          console.error("Delete message error:", error);
          socket.emit("error", { message: "Failed to delete message" });
        }
      });

      // Handle message reactions
      socket.on("addReaction", async (data) => {
        try {
          const { messageId, userId, reaction } = data;

          if (!messageId || !userId || !reaction) {
            socket.emit("error", { message: "Missing required fields" });
            return;
          }

          const message = await Message.findOne({ messageId });

          if (!message) {
            socket.emit("error", { message: "Message not found" });
            return;
          }

          // Add reaction
          await message.addReaction(userId, reaction);

          // Emit to both sender and receiver
          const receiverSocketId = this.connectedUsers.get(message.receiverId);
          const senderSocketId = this.connectedUsers.get(message.senderId);

          if (receiverSocketId) {
            this.io.to(receiverSocketId).emit("reactionAdded", {
              messageId,
              userId,
              reaction,
            });
          }

          if (senderSocketId && senderSocketId !== socket.id) {
            this.io.to(senderSocketId).emit("reactionAdded", {
              messageId,
              userId,
              reaction,
            });
          }

          socket.emit("reactionAdded", {
            messageId,
            userId,
            reaction,
          });
        } catch (error) {
          console.error("Add reaction error:", error);
          socket.emit("error", { message: "Failed to add reaction" });
        }
      });

      // Handle call initiation
      socket.on("callInitiate", (data) => {
        try {
          const { senderId, receiverId, callType } = data; // callType: 'audio' or 'video'

          if (!senderId || !receiverId || !callType) {
            socket.emit("error", { message: "Missing required fields" });
            return;
          }

          const receiverSocketId = this.connectedUsers.get(receiverId);

          if (receiverSocketId) {
            this.io.to(receiverSocketId).emit("incomingCall", {
              senderId,
              receiverId,
              callType,
            });
          } else {
            socket.emit("callFailed", { message: "User is offline" });
          }
        } catch (error) {
          console.error("Call initiation error:", error);
          socket.emit("error", { message: "Failed to initiate call" });
        }
      });

      // Handle call response
      socket.on("callResponse", (data) => {
        try {
          const { senderId, receiverId, response } = data; // response: 'accept', 'decline', 'end'

          if (!senderId || !receiverId || !response) {
            socket.emit("error", { message: "Missing required fields" });
            return;
          }

          const senderSocketId = this.connectedUsers.get(senderId);

          if (senderSocketId) {
            this.io.to(senderSocketId).emit("callResponse", {
              senderId,
              receiverId,
              response,
            });
          }
        } catch (error) {
          console.error("Call response error:", error);
          socket.emit("error", { message: "Failed to respond to call" });
        }
      });

      // Handle WebRTC signaling
      socket.on("webrtc-signal", (data) => {
        try {
          const { senderId, receiverId, signal } = data;

          if (!senderId || !receiverId || !signal) {
            socket.emit("error", { message: "Missing required fields" });
            return;
          }

          const receiverSocketId = this.connectedUsers.get(receiverId);

          if (receiverSocketId) {
            this.io.to(receiverSocketId).emit("webrtc-signal", {
              senderId,
              receiverId,
              signal,
            });
          }
        } catch (error) {
          console.error("WebRTC signal error:", error);
          socket.emit("error", { message: "Failed to send signal" });
        }
      });

      // Handle disconnect
      socket.on("disconnect", async () => {
        try {
          if (socket.userId) {
            // Update user status to offline
            const user = await User.findOne({ userId: socket.userId });
            if (user) {
              await user.updateLastSeen();

              // Remove from connected users
              this.connectedUsers.delete(socket.userId);

              // Clear typing indicators
              this.stopTyping(socket.userId);

              // Broadcast user offline status
              this.io.emit("userStatus", {
                userId: user.userId,
                status: "Offline",
                lastSeen: user.lastSeen,
              });

              console.log(
                `User ${user.username} (${socket.userId}) disconnected`
              );
            }
          }
        } catch (error) {
          console.error("Disconnect error:", error);
        }
      });
    });
  }

  stopTyping(senderId, receiverId = null) {
    const typingData = this.typingUsers.get(senderId);

    if (typingData) {
      if (!receiverId || typingData.receiverId === receiverId) {
        clearTimeout(typingData.timeout);
        this.typingUsers.delete(senderId);

        // Emit stop typing event
        const receiverSocketId = this.connectedUsers.get(
          receiverId || typingData.receiverId
        );
        if (receiverSocketId) {
          this.io.to(receiverSocketId).emit("typing", {
            senderId,
            receiverId: receiverId || typingData.receiverId,
            isTyping: false,
          });
        }
      }
    }
  }

  // Get online users
  getOnlineUsers() {
    return Array.from(this.connectedUsers.keys());
  }

  // Check if user is online
  isUserOnline(userId) {
    return this.connectedUsers.has(userId);
  }
}

module.exports = ChatSocketHandler;
