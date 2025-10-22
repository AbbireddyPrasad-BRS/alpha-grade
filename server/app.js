const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000", // React client
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Mongoose schemas
const facultySchema = new mongoose.Schema({
  name: String,
  email: String,
  passwordHash: String,
  department: String
});

const studentSchema = new mongoose.Schema({
  name: String,
  rollNumber: String,
  email: String,
  passwordHash: String,
  class: String
});

const Faculty = mongoose.model('Faculty', facultySchema);
const Student = mongoose.model('Student', studentSchema);

// Additional schemas
const questionBankItemSchema = new mongoose.Schema({
  question: String,
  options: [String],
  answer: String,
  subject: String,
  difficulty: String
});

const examSchema = new mongoose.Schema({
  title: String,
  facultyId: mongoose.Schema.Types.ObjectId,
  questions: [questionBankItemSchema],
  createdAt: { type: Date, default: Date.now }
});

const QuestionBankItem = mongoose.model('QuestionBankItem', questionBankItemSchema);
const Exam = mongoose.model('Exam', examSchema);

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/alphagrade', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// JWT middleware
const authenticateToken = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'Access denied' });

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });
    req.user = user;
    next();
  });
};

// isFaculty middleware
const isFaculty = (req, res, next) => {
  if (req.user.role !== 'faculty') return res.status(403).json({ message: 'Access denied' });
  next();
};

// Faculty registration
app.post('/api/faculty/register', async (req, res) => {
  try {
    const { name, email, password, department } = req.body;
    const existingFaculty = await Faculty.findOne({ email });
    if (existingFaculty) return res.status(400).json({ message: 'Faculty already exists' });

    const passwordHash = await bcrypt.hash(password, 10);
    const faculty = new Faculty({ name, email, passwordHash, department });
    await faculty.save();
    res.status(201).json({ message: 'Faculty registered successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Student registration
app.post('/api/student/register', async (req, res) => {
  try {
    const { name, rollNumber, email, password, class: studentClass } = req.body;
    const existingStudent = await Student.findOne({ email });
    if (existingStudent) return res.status(400).json({ message: 'Student already exists' });

    const passwordHash = await bcrypt.hash(password, 10);
    const student = new Student({ name, rollNumber, email, passwordHash, class: studentClass });
    await student.save();
    res.status(201).json({ message: 'Student registered successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Faculty login
app.post('/api/faculty/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const faculty = await Faculty.findOne({ email });
    if (!faculty) return res.status(400).json({ message: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, faculty.passwordHash);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ id: faculty._id, role: 'faculty' }, process.env.JWT_SECRET || 'your-secret-key');
    res.json({ token });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Student login
app.post('/api/student/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const student = await Student.findOne({ email });
    if (!student) return res.status(400).json({ message: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, student.passwordHash);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ id: student._id, role: 'student' }, process.env.JWT_SECRET || 'your-secret-key');
    res.json({ token });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Create exam endpoint
app.post('/api/faculty/create-exam', authenticateToken, isFaculty, async (req, res) => {
  try {
    const { title, subject, difficulty, numQuestions } = req.body;
    const facultyId = req.user.id;

    // Call AI service to generate questions
    const aiResponse = await axios.post('http://localhost:8000/ai/generate-questions', {
      subject,
      difficulty,
      numQuestions
    });

    const questions = aiResponse.data.questions;

    // Save questions to QuestionBankItem
    const savedQuestions = await QuestionBankItem.insertMany(questions);

    // Create exam
    const exam = new Exam({
      title,
      facultyId,
      questions: savedQuestions
    });

    await exam.save();
    res.status(201).json({ message: 'Exam created successfully', examId: exam._id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get faculty exams
app.get('/api/faculty/exams', authenticateToken, isFaculty, async (req, res) => {
  try {
    const exams = await Exam.find({ facultyId: req.user.id }).populate('questions');
    res.json(exams);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get student exams
app.get('/api/student/exams', authenticateToken, async (req, res) => {
  try {
    const exams = await Exam.find().populate('questions');
    res.json(exams);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get exam by ID
app.get('/api/student/exam/:examId', authenticateToken, async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.examId).populate('questions');
    if (!exam) return res.status(404).json({ message: 'Exam not found' });
    res.json(exam);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Submit exam
app.post('/api/student/submit-exam/:examId', authenticateToken, async (req, res) => {
  try {
    const { answers } = req.body;
    // For now, just log the submission. In a real app, you'd save results.
    console.log(`Exam ${req.params.examId} submitted by student ${req.user.id}`, answers);
    res.json({ message: 'Exam submitted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get student results
app.get('/api/student/results', authenticateToken, async (req, res) => {
  try {
    // Mock results for now
    res.json([]);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Basic route
app.get('/', (req, res) => {
  res.send('AlphaGrade Server is running');
});

// Socket.IO for real-time communication
io.on('connection', (socket) => {
  console.log('A user connected');

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { app, server, io };
