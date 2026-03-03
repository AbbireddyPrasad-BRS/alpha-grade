const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

// Import routes and socket handler
const authRoutes = require('./routes/auth');
const examRoutes = require('./routes/exams');
const initializeSocket = require('./socket');

// --- Environment Variable Check ---
if (!process.env.JWT_SECRET) {
  console.error('FATAL ERROR: JWT_SECRET is not defined in .env file.');
  process.exit(1);
}

// Initialize app
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000", // Adjust for your client's URL
    methods: ["GET", "POST"]
  }
});

// Make io accessible to our router
app.set('io', io);

// Middleware
app.use(cors());
app.use(express.json());

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI );
    console.log('✅MongoDB connected successfully.');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    process.exit(1); // Exit process with failure
  }
};

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/exams', examRoutes);

// Basic route for checking server status
app.get('/', (req, res) => {
  res.send('AlphaGrade Server is running.');
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, async () => {
  console.log(`🔥 Server running on port ${PORT}`);

  await connectDB();

  // Initialize Socket.IO after DB is connected
  initializeSocket(io);

  // Force reconnect for any clients that connected before DB was ready to ensure correct log order
  io.sockets.sockets.forEach((socket) => socket.disconnect(true));
});

module.exports = { app, server, io };