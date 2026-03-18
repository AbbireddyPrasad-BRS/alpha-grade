const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const http = require('http');
const { protect, authorize } = require('../middleware/auth');

// Helper to safely get the Exam model
let Exam;
try {
  Exam = require('../models/Exam');
} catch (e) {
  // Fallback will use mongoose.models later
}

// @route   GET /api/admin/health
// @desc    Get system health status (DB and AI)
router.get('/health', protect, authorize('Admin'), (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected';
  
  // Safely check local Ollama instance without crashing if it's offline
  const request = http.get('http://localhost:11434/api/tags', (response) => {
    res.json({
      database: dbStatus,
      aiService: response.statusCode === 200 ? 'Connected' : 'Disconnected',
      uptime: process.uptime()
    });
  });

  request.on('error', () => {
    res.json({
      database: dbStatus,
      aiService: 'Disconnected',
      uptime: process.uptime()
    });
  });
  
  request.setTimeout(2000, () => {
    request.destroy();
  });
});

// @route   GET /api/admin/results/overall
// @desc    Get all system-wide submissions/results
router.get('/results/overall', protect, authorize('Admin'), async (req, res) => {
  try {
    let results = [];
    if (mongoose.models.Result) {
      results = await mongoose.model('Result')
        .find()
        .populate('studentId', 'name email')
        .populate('examId', 'subject maxMarks passMarks')
        .sort({ submittedAt: -1 });
    }
    res.json(results);
  } catch (error) {
    console.error('Error fetching overall results:', error);
    res.status(500).json({ message: 'Failed to fetch results' });
  }
});

// @route   GET /api/admin/questions
// @desc    Get all questions in the global bank
router.get('/questions', protect, authorize('Admin'), async (req, res) => {
  try {
    let questions = [];
    if (mongoose.models.Question) {
      questions = await mongoose.model('Question').find().sort({ createdAt: -1 });
    }
    res.json(questions);
  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({ message: 'Failed to fetch questions' });
  }
});

// @route   DELETE /api/admin/questions/:id
// @desc    Delete a specific question
router.delete('/questions/:id', protect, authorize('Admin'), async (req, res) => {
  try {
    if (mongoose.models.Question) {
      await mongoose.model('Question').findByIdAndDelete(req.params.id);
    }
    res.json({ message: 'Question deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete question' });
  }
});

// @route   PUT /api/admin/exams/:id
// @desc    Partial update for exam (e.g. toggling allowDeletion lock)
router.put('/exams/:id', protect, authorize('Admin'), async (req, res) => {
  try {
    const examModel = Exam || mongoose.models.Exam;
    if (examModel) {
      const updatedExam = await examModel.findByIdAndUpdate(
        req.params.id,
        { $set: req.body },
        { new: true }
      );
      return res.json(updatedExam);
    }
    res.status(404).json({ message: 'Exam model not found' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update exam status' });
  }
});

module.exports = router;