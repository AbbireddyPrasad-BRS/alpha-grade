const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const Exam = require('../models/Exam');
const StudentResponse = require('../models/StudentResponse');
const Faculty = require('../models/Faculty');
const Student = require('../models/Student');
const User = require('../models/User');

/**
 * @route   GET /api/admin/exams
 * @desc    Monitor all exams (active, completed, upcoming)
 * @access  Private (Admin)
 */
router.get('/exams', protect, authorize('Admin'), async (req, res) => {
  try {
    let exams = await Exam.find()
      .select('subject startTime endTime status examCode password facultyID')
      .populate('facultyID', 'name email')
      .sort({ startTime: -1 })
      .lean();

    // Fallback for unpopulated faculty details (if they exist in Faculty collection instead of User)
    const unpopulatedExams = exams.filter(e => e.facultyID && !e.facultyID.name);
    if (unpopulatedExams.length > 0) {
      const facultyIds = [...new Set(unpopulatedExams.map(e => e.facultyID.toString()))];
      const faculties = await Faculty.find({ _id: { $in: facultyIds } }).select('name email');
      const facultyMap = {};
      faculties.forEach(f => { facultyMap[f._id.toString()] = f; });

      exams = exams.map(e => {
        if (e.facultyID && !e.facultyID.name && facultyMap[e.facultyID.toString()]) {
          e.facultyID = facultyMap[e.facultyID.toString()];
        }
        return e;
      });
    }

    res.json(exams);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching all exams' });
  }
});

/**
 * @route   PUT /api/admin/exams/:id
 * @desc    Modify any exam (Troubleshooting/Correction)
 * @access  Private (Admin)
 */
router.put('/exams/:id', protect, authorize('Admin'), async (req, res) => {
  try {
    const exam = await Exam.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!exam) return res.status(404).json({ message: 'Exam not found' });
    res.json(exam);
  } catch (error) {
    res.status(500).json({ message: 'Error updating exam' });
  }
});

/**
 * @route   GET /api/admin/submissions
 * @desc    View all student submissions for evaluation/monitoring
 * @access  Private (Admin)
 */
router.get('/submissions', protect, authorize('Admin'), async (req, res) => {
  try {
    const submissions = await StudentResponse.find()
      .populate('studentId', 'name email enrollmentNumber')
      .populate('examId', 'subject maxMarks');
    res.json(submissions);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching submissions' });
  }
});

/**
 * @route   GET /api/admin/results/overall
 * @desc    Get overall results for all students (for download)
 * @access  Private (Admin)
 */
router.get('/results/overall', protect, authorize('Admin'), async (req, res) => {
  try {
    const results = await StudentResponse.find()
      .populate('studentId', 'name email enrollmentNumber')
      .populate('examId', 'subject maxMarks passMarks')
      .sort({ submittedAt: -1 });
    
    // Transform for easier CSV consumption if needed
    res.json(results);
  } catch (error) {
    res.status(500).json({ message: 'Error generating overall results' });
  }
});

/**
 * @route   GET /api/admin/faculties
 * @desc    Get list of all faculties for exam assignment
 * @access  Private (Admin)
 */
router.get('/faculties', protect, authorize('Admin'), async (req, res) => {
  try {
    console.log('Admin fetching faculties list...');
    // Fetch from Faculty collection
    const facultyDocs = await Faculty.find({}).select('_id name email department').lean();
    // Fetch from User collection (legacy support)
    const userDocs = await User.find({ role: 'Faculty' }).select('_id name email').lean();

    console.log(`Found ${facultyDocs.length} in Faculty collection, ${userDocs.length} in User collection.`);

    const facultyMap = new Map();
    // Add Users first
    userDocs.forEach(u => { if (u.email) facultyMap.set(u.email.toLowerCase(), u); });
    // Overwrite/Add Faculties
    facultyDocs.forEach(f => { if (f.email) facultyMap.set(f.email.toLowerCase(), f); });

    const uniqueFaculties = Array.from(facultyMap.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    res.json(uniqueFaculties);
  } catch (error) {
    console.error('Error fetching faculties:', error);
    res.status(500).json({ message: 'Error fetching faculties' });
  }
});

module.exports = router;
