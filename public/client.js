// Global variables
let socket;
let currentUser = null;
let selectedUser = null;
let users = [];
let messages = [];
let typingTimeout = null;
let peerConnection = null;
let localStream = null;
let remoteStream = null;
let otpTimer = null;
let pendingUserId = null;

// DOM elements
const loadingScreen = document.getElementById("loadingScreen");
const registrationModal = document.getElementById("registrationModal");
const otpModal = document.getElementById("otpModal");
const loginModal = document.getElementById("loginModal");
const chatInterface = document.getElementById("chatInterface");
const registrationForm = document.getElementById("registrationForm");
const otpForm = document.getElementById("otpForm");
const loginForm = document.getElementById("loginForm");
const usernameInput = document.getElementById("username");
const phoneNumberInput = document.getElementById("phoneNumber");
const loginPhoneNumberInput = document.getElementById("loginPhoneNumber");
const currentUsernameSpan = document.getElementById("currentUsername");
const userStatusSpan = document.getElementById("userStatus");
const logoutBtn = document.getElementById("logoutBtn");
const userList = document.getElementById("userList");
const userSearch = document.getElementById("userSearch");
const messagesContainer = document.getElementById("messages");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const attachBtn = document.getElementById("attachBtn");
const fileInput = document.getElementById("fileInput");
const emojiBtn = document.getElementById("emojiBtn");
const emojiPicker = document.getElementById("emojiPicker");
const typingIndicator = document.getElementById("typingIndicator");
const chatUserName = document.getElementById("chatUserName");
const chatUserStatus = document.getElementById("chatUserStatus");
const audioCallBtn = document.getElementById("audioCallBtn");
const videoCallBtn = document.getElementById("videoCallBtn");
const callModal = document.getElementById("callModal");
const callTitle = document.getElementById("callTitle");
const callDescription = document.getElementById("callDescription");
const acceptCallBtn = document.getElementById("acceptCallBtn");
const declineCallBtn = document.getElementById("declineCallBtn");
const callVideoContainer = document.getElementById("callVideoContainer");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const endCallBtn = document.getElementById("endCallBtn");
const messageContextMenu = document.getElementById("messageContextMenu");
const editMessageBtn = document.getElementById("editMessageBtn");
const deleteMessageBtn = document.getElementById("deleteMessageBtn");
const reactMessageBtn = document.getElementById("reactMessageBtn");
const resendOtpBtn = document.getElementById("resendOtpBtn");
const timerCount = document.getElementById("timerCount");
const loginLink = document.getElementById("loginLink");
const registerLink = document.getElementById("registerLink");
const backToRegister = document.getElementById("backToRegister");
const notification = document.getElementById("notification");

// Initialize the application
document.addEventListener("DOMContentLoaded", () => {
  initializeApp();
  setupEventListeners();
});

// Initialize the application
function initializeApp() {
  // Check if user is already authenticated
  const token = localStorage.getItem("authToken");
  const savedUser = localStorage.getItem("currentUser");

  if (token && savedUser) {
    currentUser = JSON.parse(savedUser);
    showChatInterface();
    connectSocket();
  } else {
    showRegistrationModal();
  }
}

// Setup event listeners
function setupEventListeners() {
  // Registration form
  registrationForm.addEventListener("submit", handleRegistration);

  // OTP form
  otpForm.addEventListener("submit", handleOtpVerification);

  // Login form
  loginForm.addEventListener("submit", handleLogin);

  // OTP input handling
  setupOtpInputs();

  // Auth navigation
  loginLink.addEventListener("click", (e) => {
    e.preventDefault();
    showLoginModal();
  });

  registerLink.addEventListener("click", (e) => {
    e.preventDefault();
    showRegistrationModal();
  });

  backToRegister.addEventListener("click", (e) => {
    e.preventDefault();
    showRegistrationModal();
  });

  // Resend OTP
  resendOtpBtn.addEventListener("click", handleResendOtp);

  // Logout
  logoutBtn.addEventListener("click", handleLogout);

  // Message input
  messageInput.addEventListener("input", handleMessageInput);
  messageInput.addEventListener("keypress", handleMessageKeypress);
  sendBtn.addEventListener("click", sendMessage);

  // File attachment
  attachBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", handleFileUpload);

  // Emoji picker
  emojiBtn.addEventListener("click", toggleEmojiPicker);
  emojiPicker.addEventListener("click", handleEmojiClick);

  // User search
  userSearch.addEventListener("input", filterUsers);

  // Call buttons
  audioCallBtn.addEventListener("click", () => initiateCall("audio"));
  videoCallBtn.addEventListener("click", () => initiateCall("video"));

  // Call modal
  acceptCallBtn.addEventListener("click", acceptCall);
  declineCallBtn.addEventListener("click", declineCall);
  endCallBtn.addEventListener("click", endCall);

  // Context menu
  editMessageBtn.addEventListener("click", editMessage);
  deleteMessageBtn.addEventListener("click", deleteMessage);
  reactMessageBtn.addEventListener("click", showReactionPicker);

  // Close modals and menus on outside click
  document.addEventListener("click", handleOutsideClick);

  // Auto-resize textarea
  messageInput.addEventListener("input", autoResizeTextarea);
}

// OTP Input Setup
function setupOtpInputs() {
  const otpInputs = document.querySelectorAll(".otp-input");

  otpInputs.forEach((input, index) => {
    input.addEventListener("input", (e) => {
      const value = e.target.value;
      if (value && index < otpInputs.length - 1) {
        otpInputs[index + 1].focus();
      }
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !e.target.value && index > 0) {
        otpInputs[index - 1].focus();
      }
    });
  });
}

// Authentication Functions
async function handleRegistration(e) {
  e.preventDefault();

  const username = usernameInput.value.trim();
  const phoneNumber = phoneNumberInput.value.trim();

  if (username.length < 3) {
    showNotification("Username must be at least 3 characters long", "error");
    return;
  }

  if (!phoneNumber) {
    showNotification("Phone number is required", "error");
    return;
  }

  try {
    const response = await fetch("/api/auth/send-otp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, phoneNumber }),
    });

    const data = await response.json();

    if (data.success) {
      pendingUserId = data.userId;
      showOtpModal();
      startOtpTimer();
      showNotification("OTP sent successfully!", "success");
    } else {
      showNotification(data.message, "error");
    }
  } catch (error) {
    console.error("Registration error:", error);
    showNotification("Registration failed. Please try again.", "error");
  }
}

async function handleOtpVerification(e) {
  e.preventDefault();

  const otpCode = getOtpCode();
  if (otpCode.length !== 6) {
    showNotification("Please enter the complete 6-digit OTP", "error");
    return;
  }

  try {
    const response = await fetch("/api/auth/verify-otp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId: pendingUserId, otpCode }),
    });

    const data = await response.json();

    if (data.success) {
      currentUser = data.user;
      localStorage.setItem("currentUser", JSON.stringify(currentUser));
      localStorage.setItem("authToken", data.token);

      showChatInterface();
      connectSocket();
      showNotification("Registration successful!", "success");
    } else {
      showNotification(data.message, "error");
    }
  } catch (error) {
    console.error("OTP verification error:", error);
    showNotification("OTP verification failed. Please try again.", "error");
  }
}

async function handleLogin(e) {
  e.preventDefault();

  const phoneNumber = loginPhoneNumberInput.value.trim();

  if (!phoneNumber) {
    showNotification("Phone number is required", "error");
    return;
  }

  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ phoneNumber }),
    });

    const data = await response.json();

    if (data.success) {
      pendingUserId = data.userId;
      showOtpModal();
      startOtpTimer();
      showNotification("Login OTP sent successfully!", "success");
    } else {
      showNotification(data.message, "error");
    }
  } catch (error) {
    console.error("Login error:", error);
    showNotification("Login failed. Please try again.", "error");
  }
}

async function handleResendOtp() {
  if (!pendingUserId) return;

  try {
    const response = await fetch("/api/auth/resend-otp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId: pendingUserId }),
    });

    const data = await response.json();

    if (data.success) {
      startOtpTimer();
      showNotification("New OTP sent successfully!", "success");
    } else {
      showNotification(data.message, "error");
    }
  } catch (error) {
    console.error("Resend OTP error:", error);
    showNotification("Failed to resend OTP. Please try again.", "error");
  }
}

function getOtpCode() {
  const otpInputs = document.querySelectorAll(".otp-input");
  return Array.from(otpInputs)
    .map((input) => input.value)
    .join("");
}

function startOtpTimer() {
  let timeLeft = 60;
  resendOtpBtn.disabled = true;

  const updateTimer = () => {
    timerCount.textContent = timeLeft;
    if (timeLeft <= 0) {
      resendOtpBtn.disabled = false;
      clearInterval(otpTimer);
    }
    timeLeft--;
  };

  updateTimer();
  otpTimer = setInterval(updateTimer, 1000);
}

// Modal Management
function showRegistrationModal() {
  hideAllModals();
  registrationModal.classList.remove("hidden");
  chatInterface.classList.add("hidden");
}

function showOtpModal() {
  hideAllModals();
  otpModal.classList.remove("hidden");
  clearOtpInputs();
}

function showLoginModal() {
  hideAllModals();
  loginModal.classList.remove("hidden");
}

function showChatInterface() {
  hideAllModals();
  chatInterface.classList.remove("hidden");

  if (currentUser) {
    currentUsernameSpan.textContent = currentUser.username;
    userStatusSpan.textContent = "Online";
    userStatusSpan.className = "status-indicator online";
  }
}

function hideAllModals() {
  registrationModal.classList.add("hidden");
  otpModal.classList.add("hidden");
  loginModal.classList.add("hidden");
  chatInterface.classList.add("hidden");
}

function clearOtpInputs() {
  const otpInputs = document.querySelectorAll(".otp-input");
  otpInputs.forEach((input) => {
    input.value = "";
  });
  document.getElementById("otp1").focus();
}

// Socket.IO Connection
function connectSocket() {
  socket = io();

  socket.on("connect", () => {
    console.log("Connected to server");
    socket.emit("join", { userId: currentUser.userId });
    loadUsers();
    loadRecentChats();
  });

  socket.on("disconnect", () => {
    console.log("Disconnected from server");
    showNotification("Connection lost. Trying to reconnect...", "error");
  });

  socket.on("error", (data) => {
    showNotification(data.message, "error");
  });

  // Message events
  socket.on("newMessage", handleNewMessage);
  socket.on("messageSent", handleMessageSent);
  socket.on("messageEdited", handleMessageEdited);
  socket.on("messageDeleted", handleMessageDeleted);
  socket.on("reactionAdded", handleReactionAdded);

  // Typing events
  socket.on("typing", handleTypingIndicator);

  // User status events
  socket.on("userStatus", handleUserStatusUpdate);

  // Call events
  socket.on("incomingCall", handleIncomingCall);
  socket.on("callResponse", handleCallResponse);
  socket.on("callFailed", handleCallFailed);
  socket.on("webrtc-signal", handleWebRTCSignal);
}

// User Management
async function loadUsers() {
  try {
    const response = await fetch("/api/users");
    const data = await response.json();

    if (data.success) {
      users = data.users.filter((user) => user.userId !== currentUser.userId);
      renderUserList();
    }
  } catch (error) {
    console.error("Load users error:", error);
  }
}

async function loadRecentChats() {
  try {
    const response = await fetch(`/api/messages/recent/${currentUser.userId}`);
    const data = await response.json();

    if (data.success) {
      renderRecentChats(data.recentChats);
    }
  } catch (error) {
    console.error("Load recent chats error:", error);
  }
}

function renderUserList() {
  userList.innerHTML = "";

  users.forEach((user) => {
    const userElement = createUserElement(user);
    userList.appendChild(userElement);
  });
}

function renderRecentChats(recentChats) {
  userList.innerHTML = "";

  if (recentChats.length === 0) {
    userList.innerHTML = "<div class='no-chats'>No recent chats</div>";
    return;
  }

  recentChats.forEach((chat) => {
    const chatElement = createRecentChatElement(chat);
    userList.appendChild(chatElement);
  });
}

function createUserElement(user) {
  const userElement = document.createElement("div");
  userElement.className = "user-item";
  userElement.dataset.userId = user.userId;

  const statusClass = user.isOnline ? "online" : "offline";
  const statusText = user.isOnline ? "Online" : formatLastSeen(user.lastSeen);

  userElement.innerHTML = `
    <div class="user-avatar">
      <i class="fas fa-user"></i>
    </div>
    <div class="user-details">
      <div class="user-name">${user.username}</div>
      <div class="user-status">${statusText}</div>
    </div>
    <div class="status-indicator ${statusClass}"></div>
  `;

  userElement.addEventListener("click", () => selectUser(user));

  return userElement;
}

function createRecentChatElement(chat) {
  const userElement = document.createElement("div");
  userElement.className = "user-item";
  userElement.dataset.userId = chat.userId;

  const statusClass = chat.isOnline ? "online" : "offline";
  const statusText = chat.isOnline ? "Online" : formatLastSeen(chat.lastSeen);

  userElement.innerHTML = `
    <div class="user-avatar">
      <i class="fas fa-user"></i>
    </div>
    <div class="user-details">
      <div class="user-name">${chat.username}</div>
      <div class="user-status">${statusText}</div>
      <div class="last-message">${chat.lastMessage || "No messages yet"}</div>
    </div>
    <div class="status-indicator ${statusClass}"></div>
  `;

  userElement.addEventListener("click", () => selectUser(chat));

  return userElement;
}

function selectUser(user) {
  selectedUser = user;

  // Update UI
  document.querySelectorAll(".user-item").forEach((item) => {
    item.classList.remove("active");
  });
  document
    .querySelector(`[data-user-id="${user.userId}"]`)
    .classList.add("active");

  chatUserName.textContent = user.username;
  chatUserStatus.textContent = user.isOnline
    ? "Online"
    : formatLastSeen(user.lastSeen);

  // Load messages
  loadMessages(user.userId);

  // Enable call buttons
  audioCallBtn.disabled = false;
  videoCallBtn.disabled = false;
}

// Message Management
async function loadMessages(receiverId) {
  try {
    const response = await fetch(
      `/api/messages/${currentUser.userId}/${receiverId}`
    );
    const data = await response.json();

    if (data.success) {
      messages = data.messages;
      renderMessages();
      scrollToBottom();
    }
  } catch (error) {
    console.error("Load messages error:", error);
  }
}

function renderMessages() {
  messagesContainer.innerHTML = "";

  messages.forEach((message) => {
    const messageElement = createMessageElement(message);
    messagesContainer.appendChild(messageElement);
  });
}

function createMessageElement(message) {
  const messageElement = document.createElement("div");
  const isOwnMessage = message.senderId === currentUser.userId;
  messageElement.className = `message ${isOwnMessage ? "sent" : "received"}`;
  messageElement.dataset.messageId = message.messageId;

  let content = "";

  if (message.isDeleted) {
    content = '<div class="message-deleted">Message deleted</div>';
  } else {
    content = `
      <div class="message-content">${escapeHtml(message.content)}</div>
      ${message.mediaUrl ? createMediaContent(message) : ""}
      ${message.isEdited ? '<div class="message-edited">(edited)</div>' : ""}
      ${
        message.reactions.length > 0
          ? createReactionsContent(message.reactions)
          : ""
      }
    `;
  }

  messageElement.innerHTML = `
    ${content}
    <div class="message-time">${formatTime(message.timestamp)}</div>
  `;

  // Add context menu for own messages
  if (isOwnMessage && !message.isDeleted) {
    messageElement.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      showMessageContextMenu(e, message);
    });
  }

  return messageElement;
}

function createMediaContent(message) {
  switch (message.mediaType) {
    case "image":
      return `<div class="message-media">
        <div class="media-preview" onclick="openMedia('${message.mediaUrl}')">
          <img src="${message.mediaUrl}" alt="Image">
        </div>
      </div>`;
    case "video":
      return `<div class="message-media">
        <div class="media-preview" onclick="openMedia('${message.mediaUrl}')">
          <video src="${message.mediaUrl}" controls></video>
        </div>
      </div>`;
    case "audio":
      return `<div class="message-media">
        <audio src="${message.mediaUrl}" controls></audio>
      </div>`;
    default:
      return `<div class="message-media">
        <div class="media-file" onclick="downloadFile('${message.mediaUrl}', '${message.mediaName}')">
          <i class="fas fa-file"></i>
          <span>${message.mediaName}</span>
        </div>
      </div>`;
  }
}

function createReactionsContent(reactions) {
  const reactionGroups = {};
  reactions.forEach((reaction) => {
    if (!reactionGroups[reaction.reaction]) {
      reactionGroups[reaction.reaction] = 0;
    }
    reactionGroups[reaction.reaction]++;
  });

  const reactionElements = Object.entries(reactionGroups).map(
    ([emoji, count]) =>
      `<span class="reaction" onclick="toggleReaction('${emoji}')">${emoji} ${count}</span>`
  );

  return `<div class="message-reactions">${reactionElements.join("")}</div>`;
}

// Message Sending
function handleMessageInput() {
  const message = messageInput.value.trim();
  sendBtn.disabled = !message;

  // Send typing indicator
  if (selectedUser && message) {
    socket.emit("typing", {
      senderId: currentUser.userId,
      receiverId: selectedUser.userId,
    });
  }
}

function handleMessageKeypress(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function sendMessage() {
  const content = messageInput.value.trim();
  if (!content || !selectedUser) return;

  socket.emit("newMessage", {
    senderId: currentUser.userId,
    receiverId: selectedUser.userId,
    content: content,
  });

  messageInput.value = "";
  sendBtn.disabled = true;
  autoResizeTextarea();
}

function handleNewMessage(data) {
  const message = data.message;

  // Add to messages array if it's from the current chat
  if (
    selectedUser &&
    ((message.senderId === selectedUser.userId &&
      message.receiverId === currentUser.userId) ||
      (message.senderId === currentUser.userId &&
        message.receiverId === selectedUser.userId))
  ) {
    messages.push(message);
    const messageElement = createMessageElement(message);
    messagesContainer.appendChild(messageElement);
    scrollToBottom();
  }

  // Show notification if not in the current chat
  if (
    message.senderId !== currentUser.userId &&
    (!selectedUser || message.senderId !== selectedUser.userId)
  ) {
    const sender = users.find((u) => u.userId === message.senderId);
    if (sender) {
      showNotification(`New message from ${sender.username}`, "info");
    }
  }

  // Update recent chats
  loadRecentChats();
}

function handleMessageSent(data) {
  if (data.success) {
    const message = data.message;
    messages.push(message);
    const messageElement = createMessageElement(message);
    messagesContainer.appendChild(messageElement);
    scrollToBottom();

    // Update recent chats
    loadRecentChats();
  }
}

// File Upload
async function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append("media", file);
  formData.append("userId", currentUser.userId);

  try {
    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    if (data.success) {
      socket.emit("newMessage", {
        senderId: currentUser.userId,
        receiverId: selectedUser.userId,
        content: `Sent ${data.data.mediaName}`,
        messageType: data.data.mediaType,
        mediaUrl: data.data.mediaUrl,
        mediaType: data.data.mediaType,
        mediaName: data.data.mediaName,
        mediaSize: data.data.mediaSize,
      });
    } else {
      showNotification(data.message, "error");
    }
  } catch (error) {
    console.error("File upload error:", error);
    showNotification("File upload failed", "error");
  }

  fileInput.value = "";
}

// Emoji Picker
function toggleEmojiPicker() {
  emojiPicker.classList.toggle("hidden");
}

function handleEmojiClick(e) {
  if (e.target.classList.contains("emoji-btn")) {
    const emoji = e.target.dataset.emoji;
    messageInput.value += emoji;
    messageInput.focus();
    toggleEmojiPicker();
  }
}

// Typing Indicator
function handleTypingIndicator(data) {
  if (data.isTyping) {
    typingIndicator.classList.remove("hidden");
  } else {
    typingIndicator.classList.add("hidden");
  }
}

// User Status Updates
function handleUserStatusUpdate(data) {
  const user = users.find((u) => u.userId === data.userId);
  if (user) {
    user.status = data.status;
    user.lastSeen = data.lastSeen;
    user.isOnline = data.status === "Online";

    // Update UI
    const userElement = document.querySelector(
      `[data-user-id="${data.userId}"]`
    );
    if (userElement) {
      const statusElement = userElement.querySelector(".user-status");
      const indicatorElement = userElement.querySelector(".status-indicator");

      statusElement.textContent = user.isOnline
        ? "Online"
        : formatLastSeen(user.lastSeen);
      indicatorElement.className = `status-indicator ${
        user.isOnline ? "online" : "offline"
      }`;
    }

    // Update chat header if this is the selected user
    if (selectedUser && selectedUser.userId === data.userId) {
      chatUserStatus.textContent = user.isOnline
        ? "Online"
        : formatLastSeen(user.lastSeen);
    }
  }
}

// Filter users
function filterUsers() {
  const searchTerm = userSearch.value.toLowerCase();
  const userElements = userList.querySelectorAll(".user-item");

  userElements.forEach((element) => {
    const userName = element
      .querySelector(".user-name")
      .textContent.toLowerCase();
    if (userName.includes(searchTerm)) {
      element.style.display = "flex";
    } else {
      element.style.display = "none";
    }
  });
}

// Message Context Menu
function showMessageContextMenu(e, message) {
  e.preventDefault();

  messageContextMenu.style.left = e.pageX + "px";
  messageContextMenu.style.top = e.pageY + "px";
  messageContextMenu.classList.remove("hidden");

  // Store current message for context menu actions
  window.currentContextMessage = message;
}

function editMessage() {
  const message = window.currentContextMessage;
  if (!message) return;

  const newContent = prompt("Edit message:", message.content);
  if (newContent && newContent !== message.content) {
    socket.emit("editMessage", {
      messageId: message.messageId,
      newContent: newContent,
      userId: currentUser.userId,
    });
  }

  hideContextMenu();
}

function deleteMessage() {
  const message = window.currentContextMessage;
  if (!message) return;

  if (confirm("Delete this message for everyone?")) {
    socket.emit("deleteMessage", {
      messageId: message.messageId,
      userId: currentUser.userId,
    });
  }

  hideContextMenu();
}

function showReactionPicker() {
  // Show emoji picker for reactions
  const message = window.currentContextMessage;
  if (!message) return;

  // This would show a reaction picker
  console.log("Show reaction picker for message:", message.messageId);
  hideContextMenu();
}

function hideContextMenu() {
  messageContextMenu.classList.add("hidden");
  window.currentContextMessage = null;
}

// Call Management
function initiateCall(callType) {
  if (!selectedUser) return;

  socket.emit("callInitiate", {
    senderId: currentUser.userId,
    receiverId: selectedUser.userId,
    callType: callType,
  });

  showNotification(`Initiating ${callType} call...`, "info");
}

function handleIncomingCall(data) {
  callTitle.textContent = `Incoming ${data.callType} call`;
  callDescription.textContent = `Incoming call from ${
    users.find((u) => u.userId === data.senderId)?.username || "Unknown"
  }`;
  callModal.classList.remove("hidden");

  // Store call data
  window.currentCall = data;
}

function acceptCall() {
  const callData = window.currentCall;
  if (!callData) return;

  socket.emit("callResponse", {
    senderId: callData.senderId,
    receiverId: currentUser.userId,
    response: "accept",
  });

  callModal.classList.add("hidden");
  initializeWebRTC(callData.callType);
}

function declineCall() {
  const callData = window.currentCall;
  if (!callData) return;

  socket.emit("callResponse", {
    senderId: callData.senderId,
    receiverId: currentUser.userId,
    response: "decline",
  });

  callModal.classList.add("hidden");
  window.currentCall = null;
}

function endCall() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
    localStream = null;
  }

  callVideoContainer.classList.add("hidden");
  callModal.classList.add("hidden");

  socket.emit("callResponse", {
    senderId: window.currentCall?.senderId,
    receiverId: currentUser.userId,
    response: "end",
  });

  window.currentCall = null;
}

function handleCallResponse(data) {
  if (data.response === "accept") {
    initializeWebRTC(window.currentCall?.callType || "audio");
  } else if (data.response === "decline") {
    showNotification("Call was declined", "error");
  } else if (data.response === "end") {
    endCall();
  }
}

function handleCallFailed(data) {
  showNotification(data.message, "error");
}

// WebRTC Implementation
async function initializeWebRTC(callType) {
  try {
    const constraints = {
      audio: true,
      video: callType === "video",
    };

    localStream = await navigator.mediaDevices.getUserMedia(constraints);

    if (callType === "video") {
      callVideoContainer.classList.remove("hidden");
      localVideo.srcObject = localStream;
    }

    peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });

    peerConnection.ontrack = (event) => {
      remoteStream = event.streams[0];
      if (callType === "video") {
        remoteVideo.srcObject = remoteStream;
      }
    };

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("webrtc-signal", {
          senderId: currentUser.userId,
          receiverId: selectedUser.userId,
          signal: {
            type: "candidate",
            candidate: event.candidate,
          },
        });
      }
    };

    // Create and send offer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    socket.emit("webrtc-signal", {
      senderId: currentUser.userId,
      receiverId: selectedUser.userId,
      signal: {
        type: "offer",
        sdp: offer,
      },
    });
  } catch (error) {
    console.error("WebRTC initialization error:", error);
    showNotification("Failed to initialize call", "error");
  }
}

function handleWebRTCSignal(data) {
  if (!peerConnection) return;

  const signal = data.signal;

  if (signal.type === "offer") {
    peerConnection
      .setRemoteDescription(new RTCSessionDescription(signal.sdp))
      .then(() => peerConnection.createAnswer())
      .then((answer) => peerConnection.setLocalDescription(answer))
      .then(() => {
        socket.emit("webrtc-signal", {
          senderId: currentUser.userId,
          receiverId: data.senderId,
          signal: {
            type: "answer",
            sdp: peerConnection.localDescription,
          },
        });
      });
  } else if (signal.type === "answer") {
    peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
  } else if (signal.type === "candidate") {
    peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
  }
}

// Handle logout
function handleLogout() {
  if (socket) {
    socket.disconnect();
  }
  localStorage.removeItem("currentUser");
  localStorage.removeItem("authToken");
  currentUser = null;
  selectedUser = null;
  users = [];
  messages = [];

  if (otpTimer) {
    clearInterval(otpTimer);
  }

  showRegistrationModal();
  usernameInput.value = "";
  phoneNumberInput.value = "";
  loginPhoneNumberInput.value = "";
  showNotification("Logged out successfully", "info");
}

// Utility functions
function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function autoResizeTextarea() {
  messageInput.style.height = "auto";
  messageInput.style.height = messageInput.scrollHeight + "px";
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatLastSeen(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;

  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return date.toLocaleDateString();
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function handleOutsideClick(e) {
  // Close emoji picker
  if (!emojiPicker.contains(e.target) && !emojiBtn.contains(e.target)) {
    emojiPicker.classList.add("hidden");
  }

  // Close context menu
  if (!messageContextMenu.contains(e.target)) {
    hideContextMenu();
  }
}

function showNotification(message, type = "info") {
  const notificationElement = notification.cloneNode(true);
  notificationElement.classList.remove("hidden");
  notificationElement.classList.add(type);

  const iconElement = notificationElement.querySelector(".notification-icon");
  const messageElement = notificationElement.querySelector(
    ".notification-message"
  );

  iconElement.className = `notification-icon fas ${
    type === "success"
      ? "fa-check-circle"
      : type === "error"
      ? "fa-exclamation-circle"
      : "fa-info-circle"
  }`;

  messageElement.textContent = message;

  document.body.appendChild(notificationElement);

  setTimeout(() => {
    notificationElement.remove();
  }, 5000);
}

// Global functions for media handling
function openMedia(url) {
  window.open(url, "_blank");
}

function downloadFile(url, filename) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function toggleReaction(emoji) {
  // This would be implemented to toggle reactions
  console.log("Toggle reaction:", emoji);
}
