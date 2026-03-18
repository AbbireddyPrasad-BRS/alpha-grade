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

// Initialize app
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "https://alpha-grade.netlify.app", // Adjust for your client's URL
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors({
    origin: 'https://alpha-grade.netlify.app',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));
app.use(express.json());

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/alphagrade', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅MongoDB connected successfully.');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    process.exit(1); // Exit process with failure
  }
};

connectDB();

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/exams', examRoutes);

// Basic route for checking server status
app.get('/', (req, res) => {
  res.send('AlphaGrade Server is running.');
});

// Initialize Socket.IO
initializeSocket(io);

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🔥 Server running on port ${PORT}`);
});

module.exports = { app, server, io };