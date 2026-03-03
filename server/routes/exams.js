const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const axios = require('axios');
const { protect, authorize } = require('../middleware/auth');
const Exam = require('../models/Exam');
const crypto = require('crypto');
const QuestionBankItem = require('../models/QuestionBankItem');
const StudentResponse = require('../models/StudentResponse');
const ExamSession = require('../models/ExamSession');
const evaluateController = require('../models/evaluateController');
const multer = require('multer');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const Faculty = require('../models/Faculty');
const Student = require('../models/Student');
const User = require('../models/User');
const Result = require('../models/Result');

// Multer setup for in-memory file storage
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- Faculty Routes ---

/**
 * @route   GET /api/exams/faculties
 * @desc    Get list of all faculties for exam assignment (Admin only)
 * @access  Private (Admin)
 */
router.get('/faculties', protect, authorize('Admin'), async (req, res) => {
  try {
    console.log('Exams route fetching faculties list...');
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
    console.error('Error fetching faculties for exam assignment:', error);
    res.status(500).json({ message: 'Error fetching faculties' });
  }
});

/**
 * @route   POST /api/exams
 * @desc    Create a new exam
 * @access  Private (Faculty)
 */
router.post('/', protect, authorize('Faculty', 'Admin'), upload.single('rubricFile'), async (req, res) => {
  const {
    subject,
    maxMarks,
    passMarks,
    durationMinutes,
    evaluationMode,
    creationMethod,
    questions: questionsJSON, // For 'Manual' - array of { question, maxMarks, difficulty, subject, questionID? }
    topics, // For 'AI' - array of topics (optional)
    numberOfQuestions, // number requested for AI or manual count
    startTime,
    endTime,
    facultyID, // Admin must provide this
    password, // Optional: Admin/Faculty can set a specific password
    examCode: customExamCode
  } = req.body;

  try {
    // Check if Faculty has permission to create exams
    if (req.user.role === 'Faculty') {
      const faculty = await Faculty.findById(req.user.id);
      if (faculty && faculty.canCreateExam === false) {
        return res.status(403).json({ message: 'Your permission to create exams has been revoked by the Admin.' });
      }
    }

    let examQuestions = [];
    let rubricText = req.body.rubricText || '';

    // Extract text from rubric file if provided
    if (evaluationMode === 'Rubric Based Evaluation' && req.file) {
      if (req.file.mimetype === 'application/pdf') {
        const data = await pdf(req.file.buffer);
        rubricText = data.text;
      } else if (req.file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const { value } = await mammoth.extractRawText({ buffer: req.file.buffer });
        rubricText = value;
      }
    }
    const questions = JSON.parse(questionsJSON || '[]');

    if (creationMethod === 'Manual') {
      // Expect client to send manual questions as objects with question (text), maxMarks, difficulty, subject
      if (!Array.isArray(questions) || questions.length === 0) {
        return res.status(400).json({ message: 'Manual creation requires a questions array' });
      }

      // Create or reuse QuestionBankItem for each provided question
      for (const q of questions) {
        // If client provided an existing question ID, reuse it
        if (q.questionID) {
          const existing = await QuestionBankItem.findById(q.questionID);
          if (!existing) {
            return res.status(400).json({ message: `Question ID ${q.questionID} not found` });
          }
          examQuestions.push({ questionID: existing._id, marks: existing.marks });
          continue;
        }

        // Otherwise create a bank item from provided fields
        const newQ = new QuestionBankItem({
          text: q.question || q.text || '',
          marks: q.maxMarks || q.marks || 0,
          difficulty: q.difficulty || 'medium',
          domain: q.subject || q.domain || subject || '',
          modelAnswer: q.modelAnswer || '',
          facultyID: req.user._id,
        });
        await newQ.save();
        examQuestions.push({ questionID: newQ._id, marks: newQ.marks });
      }

      // If a numberOfQuestions is provided, ensure counts match
      if (typeof numberOfQuestions === 'number' && examQuestions.length !== numberOfQuestions) {
        return res.status(400).json({ message: `Provided ${examQuestions.length} manual questions but numberOfQuestions is ${numberOfQuestions}` });
      }
    } else if (creationMethod === 'AI') {
      // Use numberOfQuestions if provided, otherwise fallback to 10
      const numQuestions = Number(numberOfQuestions) || 10;

      // Call AI service - map the payload to the AI service contract. The ai-service expects subject,difficulty,numQuestions in its current implementation.
      const aiPayload = {
        subject: subject || (topics && topics.map(t=>t.topic).join(', ')) || 'General',
        difficulty: 'medium',
        numQuestions: numQuestions
      };

      const aiResponse = await axios.post('http://localhost:8000/ai/generate-questions', aiPayload, { timeout: 20000 }).catch(err => {
        console.error('AI service call failed', err.message || err);
        throw new Error('AI service unavailable or returned an error');
      });

      const aiQuestions = aiResponse.data.questions || aiResponse.data?.questions || [];

      if (!Array.isArray(aiQuestions) || aiQuestions.length === 0) {
        return res.status(500).json({ message: 'AI service returned no questions' });
      }

      // Convert AI questions into QuestionBankItem and collect marks.
      for (const q of aiQuestions) {
        // Expect AI to return fields such as { question, maxMarks } or { text, marks }
        const text = q.question || q.text || q.prompt || '';
        const marks = Number(q.maxMarks || q.marks || q.mark || 0);
        const difficulty = q.difficulty || 'medium';
        const domain = q.subject || q.domain || subject || '';

        const newQuestion = new QuestionBankItem({
          text,
          marks,
          difficulty,
          domain,
          modelAnswer: q.modelAnswer || '',
          facultyID: req.user._id,
        });
        await newQuestion.save();
        examQuestions.push({ questionID: newQuestion._id, marks: newQuestion.marks });
      }

      // If marks don't sum to maxMarks, scale proportionally to match maxMarks
      const totalQuestionMarks = examQuestions.reduce((sum, q) => sum + (q.marks || 0), 0);
      if (totalQuestionMarks !== Number(maxMarks)) {
        if (totalQuestionMarks === 0) {
          return res.status(400).json({ message: 'AI-generated questions have zero total marks; cannot scale to maxMarks' });
        }
        // Scale marks
        let scaledSum = 0;
        examQuestions = examQuestions.map((q, idx) => {
          const scaled = Math.max(0, Math.round((q.marks || 0) * Number(maxMarks) / totalQuestionMarks));
          scaledSum += scaled;
          return { ...q, marks: scaled };
        });
        // Fix rounding difference by adjusting the first question
        const diff = Number(maxMarks) - scaledSum;
        if (diff !== 0 && examQuestions.length > 0) {
          examQuestions[0].marks = (examQuestions[0].marks || 0) + diff;
        }
      }

      // If AI returned a different number of questions than requested, still allow but log warning
      if (aiQuestions.length !== numQuestions) {
        console.warn(`AI returned ${aiQuestions.length} questions, requested ${numQuestions}`);
      }
    }

    // Ensure sum of question marks equals maxMarks
    const totalQuestionMarks = examQuestions.reduce((sum, q) => sum + (q.marks || 0), 0);
    if (totalQuestionMarks !== Number(maxMarks)) {
      return res.status(400).json({ message: `Sum of question marks (${totalQuestionMarks}) does not match maxMarks (${maxMarks})` });
    }

    let targetFacultyID = req.user._id;
    let isCreatedByAdmin = false;

    if (req.user.role === 'Admin') {
      if (!facultyID) {
        return res.status(400).json({ message: 'Faculty assignment is required for Admin created exams.' });
      }
      targetFacultyID = facultyID;
      isCreatedByAdmin = true;
    }

    if (!customExamCode || !password) {
      return res.status(400).json({ message: 'Exam Code and Password are required.' });
    }

    const examCode = customExamCode;
    const examPassword = password;

    const newExam = new Exam({
      facultyID: targetFacultyID,
      subject,
      maxMarks,
      passMarks,
      durationMinutes,
      evaluationMode,
      creationMethod,
      numberOfQuestions: Number(numberOfQuestions) || examQuestions.length,
      topics,
      questions: examQuestions,
      rubricText,
      startTime,
      endTime: endTime || null,
      isCreatedByAdmin,
      examCode : examCode,
      password: examPassword
    });

    const exam = await newExam.save();

    // Notify clients
    const io = req.app.get('io');
    if (io) io.emit('exams:list-updated');

    res.status(201).json(exam);
  } catch (error) {
    console.error('Create exam error:', error.message || error);
    res.status(500).json({ message: 'Server Error' });
  }
});

/**
 * @route   GET /api/exams/my-exams
 * @desc    Get all exams created by a faculty member
 * @access  Private (Faculty)
 */
router.get('/my-exams', protect, authorize('Faculty', 'Admin'), async (req, res) => {
    try {
        console.log('Fetching all exams for Admin/Faculty...');
        
        let query = {};
        // If Faculty, only show exams assigned to them or created by them
        if (req.user.role === 'Faculty') {
            query = { facultyID: req.user._id };
        }

        let exams = await Exam.find(query).select('subject maxMarks passMarks durationMinutes evaluationMode creationMethod numberOfQuestions topics questions rubricText startTime endTime isCreatedByAdmin examCode password actualStartTime status')
            .populate('questions.questionID', 'text')
            .populate('facultyID', 'name email')
            .sort({ createdAt: -1 })
            .lean(); // Use lean to allow modification of the result object

        // Fallback: If facultyID is present but not populated (i.e., it's just an ID string/ObjectId),
        // it likely means the ref in Schema points to 'User' but the doc is in 'Faculty'.
        // We manually fetch these faculty details.
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

        console.log(`Found ${exams.length} exams.`);
        res.json(exams);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ message: 'Server Error' });
    }
});

/**
 * @route   DELETE /api/exams/:id
 * @desc    Delete an exam
 * @access  Private (Faculty)
 */
router.delete('/:id', protect, authorize('Faculty', 'Admin'), async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);

    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    // Optional: Only allow the creator to delete
    if (req.user.role !== 'Admin' && exam.facultyID.toString() !== req.user.id) {
      return res.status(403).json({ message: 'User not authorized to delete this exam' });
    }

    // Prevent deletion of active exams (unless Admin)
    if (req.user.role !== 'Admin' && exam.status === 'open') {
      return res.status(400).json({ message: 'Active exams cannot be deleted. Please close the exam first.' });
    }

    await exam.deleteOne();

    // Notify clients
    const io = req.app.get('io');
    if (io) io.emit('exams:list-updated');

    res.json({ message: 'Exam removed successfully' });
  } catch (error) {
    console.error('Delete exam error:', error.message);
    res.status(500).json({ message: 'Server Error' });
  }
});

/**
 * @route   POST /api/exams/:id/evaluate
 * @desc    Trigger AI evaluation for an exam
 * @access  Private (Faculty)
 */
router.post('/:id/evaluate', protect, authorize('Faculty', 'Admin'), async (req, res, next) => {
  if (req.user.role === 'Admin') return next();
  const faculty = await Faculty.findById(req.user.id);
  if (faculty && faculty.canEvaluate === false) {
    return res.status(403).json({ message: 'Your permission to evaluate exams has been revoked.' });
  }
  next();
}, evaluateController.evaluateExam);

/**
 * @route   POST /api/exams/:id/evaluate/:studentId
 * @desc    Re-evaluate a specific student's submission
 * @access  Private (Faculty)
 */
router.post('/:id/evaluate/:studentId', protect, authorize('Faculty', 'Admin'), async (req, res, next) => {
  if (req.user.role === 'Admin') return next();
  const faculty = await Faculty.findById(req.user.id);
  if (faculty && faculty.canEvaluate === false) {
    return res.status(403).json({ message: 'Your permission to evaluate exams has been revoked.' });
  }
  next();
}, evaluateController.reevaluateStudent);

/**
 * @route   GET /api/exams/:id/results
 * @desc    Get evaluated results for an exam
 * @access  Private (Faculty)
 */
router.get('/:id/results', protect, authorize('Faculty', 'Admin'), evaluateController.getExamResults);

/**
 * @route   GET /api/exams/:id/analytics
 * @desc    Get aggregated analytics for dashboard charts
 * @access  Private (Faculty/Admin)
 */
router.get('/:id/analytics', protect, authorize('Faculty', 'Admin'), async (req, res) => {
    try {
        const examId = new mongoose.Types.ObjectId(req.params.id);
        const exam = await Exam.findById(examId);
        
        const stats = await StudentResponse.aggregate([
            { $match: { examId } },
            {
                $group: {
                    _id: null,
                    avgScore: { $avg: "$totalScore" },
                    maxScore: { $max: "$totalScore" },
                    minScore: { $min: "$totalScore" },
                    passCount: { $sum: { $cond: [{ $gte: ["$totalScore", exam.passMarks] }, 1, 0] } },
                    failCount: { $sum: { $cond: [{ $lt: ["$totalScore", exam.passMarks] }, 1, 0] } },
                    totalSubmissions: { $sum: 1 }
                }
            }
        ]);

        const distribution = await StudentResponse.aggregate([
            { $match: { examId } },
            {
                $bucket: {
                    groupBy: "$totalScore",
                    boundaries: [0, exam.maxMarks * 0.2, exam.maxMarks * 0.4, exam.maxMarks * 0.6, exam.maxMarks * 0.8, exam.maxMarks + 1],
                    default: "Other",
                    output: { count: { $sum: 1 } }
                }
            }
        ]);

        res.json({ stats: stats[0] || {}, distribution });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching analytics' });
    }
});

// --- Student Routes ---

/**
 * @route   POST /api/exams/access
 * @desc    Validate exam credentials (ID & Password) for student access
 * @access  Private (Student)
 */
router.post('/access', protect, authorize('Student'), async (req, res) => {
  const { examId, examCode, password } = req.body;

  try {
    let exam;
    if (examId) {
      exam = await Exam.findById(examId).select('+password');
    } else if (examCode) {
      // Fallback for manual entry: find the most recent non-closed exam with this code
      exam = await Exam.findOne({ examCode, status: { $ne: 'closed' } }).select('+password').sort({ createdAt: -1 });
    }

    if (!exam) {
      return res.status(404).json({ message: 'Invalid Exam ID' });
    }

    // Logic for checking the exam password
    if (exam.password && exam.password !== password) {
      return res.status(400).json({ message: 'Incorrect exam password. Please try again.' });
    }

    const studentId = req.user.id || req.user._id;

    // Strict permission check before allowing password entry/access
    const student = await Student.findById(studentId);
    if (student && student.canTakeExam === false) {
      return res.status(403).json({ 
        message: 'You have no permission to write the exam, contact faculty member.' 
      });
    }

    // Prevent re-joining if already submitted
    const existingSubmission = await StudentResponse.findOne({ examId: exam._id, studentId });
    if (existingSubmission) {
      return res.status(400).json({ message: 'You have already submitted this exam.' });
    }

    // Create or update session to 'waiting' status to enter the lobby
    await ExamSession.findOneAndUpdate(
      { examID: exam._id, studentID: studentId },
      { status: 'admitted', lastHeartbeat: new Date() },
      { upsert: true }
    );

    res.json({ _id: exam._id });
  } catch (error) {
    console.error('Exam access error:', error.message);
    res.status(500).json({ message: 'Server Error' });
  }
});

/**
 * @route   GET /api/exams
 * @desc    Get all available exams for a student
 * @access  Private (Student)
 */
router.get('/', protect, authorize('Student'), async (req, res) => {
    try {
        // Fetch all exams; the frontend dashboard will handle classification (Active, Upcoming, Completed)
        const exams = await Exam.find()
            .select('_id subject startTime endTime durationMinutes maxMarks passMarks status examCode actualStartTime')
            .lean();
        
        res.json(exams);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ message: 'Server Error' });
    }
});

/**
 * @route   GET /api/exams/my-results
 * @desc    Get all results for the logged-in student
 * @access  Private (Student)
 */
router.get('/my-results', protect, authorize('Student'), async (req, res) => {
    try {
        const studentId = new mongoose.Types.ObjectId(req.user.id || req.user._id);
        // Fetch all submissions directly from StudentResponse model
        const results = await StudentResponse.find({ studentId })
            .populate('examId', 'subject maxMarks passMarks startTime endTime durationMinutes examCode status actualStartTime')
            .sort({ submittedAt: -1, createdAt: -1 })
            .lean();
        res.json(results);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ message: 'Server Error' });
    }
});
/**
 * @route   GET /api/exams/:id/sessions
 * @desc    Get all active sessions for an exam
 * @access  Private (Faculty/Admin)
 */
router.get('/:id/sessions', protect, authorize('Faculty', 'Admin'), async (req, res) => {
  try {
    const sessions = await ExamSession.find({ examID: req.params.id, status: { $in: ['admitted', 'in-progress', 'submitted'] } })
      .populate('studentID', 'name email enrollmentNumber');
    res.json(sessions);
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

/**
 * @route   GET /api/exams/:id
 * @desc    Get a single exam by ID (for starting an exam)
 * @access  Private (Student or Faculty)
 */
router.get('/:id', protect, async (req, res) => {
  try {
    let query = Exam.findById(req.params.id);
    
    // Only hide model answers for students
    if (req.user.role === 'Student') {
        query = query.select('subject maxMarks passMarks durationMinutes evaluationMode creationMethod numberOfQuestions topics questions rubricText startTime endTime examCode actualStartTime status').populate('questions.questionID', 'text marks difficulty domain');
    } else {
        query = query.select('subject maxMarks passMarks durationMinutes evaluationMode creationMethod numberOfQuestions topics questions rubricText startTime endTime examCode password actualStartTime status').populate('questions.questionID')
                     .populate('submissions.studentId', 'name email enrollmentNumber');
    }

    const exam = await query;
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    // Access Control for Students
    if (req.user.role === 'Student') {
        const now = new Date();
        
        // Check if exam has expired
        if (exam.endTime && now > new Date(exam.endTime)) {
            return res.status(403).json({ message: 'This exam has expired.' });
        }

        // Check if student is allowed to take exams
        const student = await Student.findById(req.user.id);
        if (student && student.canTakeExam === false) {
            return res.status(403).json({ message: 'Your permission to take exams has been revoked by the Admin.' });
        }

        // Block access if already submitted
        const existingSubmission = await StudentResponse.findOne({ examId: exam._id, studentId: req.user.id });
        if (existingSubmission) {
            return res.status(403).json({ message: 'You have already submitted this exam.' });
        }

        // Ensure an admitted session exists (Direct Access)
        // This handles refreshes and ensures the student appears on the faculty monitor
        await ExamSession.findOneAndUpdate(
            { examID: exam._id, studentID: req.user.id },
            { status: 'admitted', lastHeartbeat: new Date() },
            { upsert: true, new: true }
        );

        // Check if exam hasn't started yet (neither triggered by faculty nor scheduled time reached)
        const isLive = exam.actualStartTime || (exam.startTime && now >= new Date(exam.startTime));
        if (!isLive) {
            // Return exam details but HIDE questions
            exam.questions = [];
        }
    }
    res.json(exam);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: 'Server Error' });
  }
});

/**
 * @route   PUT /api/exams/:id
 * @desc    Update an existing exam
 * @access  Private (Faculty/Admin)
 */
router.put('/:id', protect, authorize('Faculty', 'Admin'), upload.single('rubricFile'), async (req, res) => {
  const {
    subject,
    maxMarks,
    passMarks,
    durationMinutes,
    evaluationMode,
    creationMethod,
    questions: questionsJSON,
    topics,
    numberOfQuestions,
    startTime,
    endTime,
    password,
    examCode: updatedExamCode
  } = req.body;

  try {
    let exam = await Exam.findById(req.params.id).select('+examCode +password');

    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    // Authorization check
    if (req.user.role !== 'Admin') {
      if (exam.facultyID.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'User not authorized to update this exam' });
      }

      // Faculty can only edit upcoming exams
      const now = new Date();
      if (exam.startTime && now >= new Date(exam.startTime)) {
        return res.status(403).json({ message: 'Faculty cannot edit an exam once it has started or completed.' });
      }
    }

    let rubricText = req.body.rubricText || exam.rubricText;
    // Handle new rubric file upload
    if (evaluationMode === 'Rubric Based Evaluation' && req.file) {
        if (req.file.mimetype === 'application/pdf') {
            const data = await pdf(req.file.buffer);
            rubricText = data.text;
        } else if (req.file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            const { value } = await mammoth.extractRawText({ buffer: req.file.buffer });
            rubricText = value;
        }
    } else if (evaluationMode === 'AI Based Evaluation') {
        rubricText = ''; // Clear rubric if mode changes
    }

    let examQuestions = [];
    const questions = JSON.parse(questionsJSON || '[]');

    if (creationMethod === 'Manual') {
      if (!Array.isArray(questions)) {
        return res.status(400).json({ message: 'Manual creation requires a questions array' });
      }

      for (const q of questions) {
        // For updates, we treat questions as new items to ensure edits are captured 
        // and don't inadvertently affect other exams sharing the same QuestionBankItem.
        // If specific ID reuse is strictly required, logic can be added here.
        
        const newQ = new QuestionBankItem({
          text: q.question || q.text || '',
          marks: Number(q.maxMarks || q.marks || 0),
          difficulty: q.difficulty || 'medium',
          domain: q.subject || q.domain || subject || '',
          modelAnswer: q.modelAnswer || '',
          facultyID: req.user._id,
        });
        await newQ.save();
        examQuestions.push({ questionID: newQ._id, marks: newQ.marks });
      }

      if (typeof numberOfQuestions === 'number' && examQuestions.length !== numberOfQuestions) {
        return res.status(400).json({ message: `Provided ${examQuestions.length} manual questions but numberOfQuestions is ${numberOfQuestions}` });
      }
    } else if (creationMethod === 'AI') {
      const numQuestions = Number(numberOfQuestions) || 10;

      const aiPayload = {
        subject: subject || (topics && topics.map(t=>t.topic).join(', ')) || 'General',
        difficulty: 'medium',
        numQuestions: numQuestions
      };

      const aiResponse = await axios.post('http://localhost:8000/ai/generate-questions', aiPayload, { timeout: 20000 }).catch(err => {
        console.error('AI service call failed', err.message || err);
        throw new Error('AI service unavailable. Please try again or switch to Manual creation.');
      });

      const aiQuestions = aiResponse.data.questions || aiResponse.data?.questions || [];

      if (!Array.isArray(aiQuestions) || aiQuestions.length === 0) {
        return res.status(500).json({ message: 'AI service returned no questions' });
      }

      for (const q of aiQuestions) {
        const text = q.question || q.text || q.prompt || '';
        const marks = Number(q.maxMarks || q.marks || q.mark || 0);
        const difficulty = q.difficulty || 'medium';
        const domain = q.subject || q.domain || subject || '';

        const newQuestion = new QuestionBankItem({
          text,
          marks,
          difficulty,
          domain,
          modelAnswer: q.modelAnswer || '',
          facultyID: req.user._id,
        });
        await newQuestion.save();
        examQuestions.push({ questionID: newQuestion._id, marks: newQuestion.marks });
      }

      // Scale marks logic (same as POST)
      const totalQuestionMarks = examQuestions.reduce((sum, q) => sum + (q.marks || 0), 0);
      if (totalQuestionMarks !== Number(maxMarks)) {
        if (totalQuestionMarks === 0) {
          return res.status(400).json({ message: 'AI-generated questions have zero total marks; cannot scale to maxMarks' });
        }
        let scaledSum = 0;
        examQuestions = examQuestions.map((q, idx) => {
          const scaled = Math.max(0, Math.round((q.marks || 0) * Number(maxMarks) / totalQuestionMarks));
          scaledSum += scaled;
          return { ...q, marks: scaled };
        });
        const diff = Number(maxMarks) - scaledSum;
        if (diff !== 0 && examQuestions.length > 0) {
          examQuestions[0].marks = (examQuestions[0].marks || 0) + diff;
        }
      }

      if (aiQuestions.length !== numQuestions) {
        console.warn(`AI returned ${aiQuestions.length} questions, requested ${numQuestions}`);
      }
    }

    // Ensure sum of question marks equals maxMarks
    const totalQuestionMarks = examQuestions.reduce((sum, q) => sum + (q.marks || 0), 0);
    if (totalQuestionMarks !== Number(maxMarks)) {
      return res.status(400).json({ message: `Sum of question marks (${totalQuestionMarks}) does not match maxMarks (${maxMarks})` });
    }

    // Update fields
    exam.subject = subject;
    exam.maxMarks = maxMarks;
    exam.passMarks = passMarks;
    exam.durationMinutes = durationMinutes;
    exam.evaluationMode = evaluationMode;
    exam.creationMethod = creationMethod;
    exam.numberOfQuestions = Number(numberOfQuestions) || examQuestions.length;
    exam.topics = topics;
    exam.questions = examQuestions;
    exam.rubricText = rubricText;
    exam.startTime = startTime;
    exam.endTime = endTime;
    if (password) exam.password = password;
    if (updatedExamCode) exam.examCode = updatedExamCode;

    await exam.save();

    // Notify clients
    const io = req.app.get('io');
    if (io) io.emit('exams:list-updated');

    res.json(exam);
  } catch (error) {
    console.error('Update exam error:', error);
    res.status(500).json({ message: error.message || 'Server Error' });
  }
});

/**
 * @route   POST /api/exams/:id/submit
 * @desc    Submit answers for an exam
 * @access  Private (Student)
 */
router.post('/:id/submit', protect, authorize('Student'), async (req, res) => {
    const { answers } = req.body;
    const examId = req.params.id;
    const studentId = req.user.id || req.user._id;

    try {
        // Populate questions to get details for the snapshot
        const exam = await Exam.findById(examId).populate('questions.questionID');
        if (!exam) {
            return res.status(404).json({ message: 'Exam not found' });
        }

        // Check permission
        const student = await Student.findById(studentId);
        if (student && student.canTakeExam === false) {
            return res.status(403).json({ message: 'Your permission to submit exams has been revoked.' });
        }

        // Check for existing submission
        const existing = await StudentResponse.findOne({ examId, studentId });
        if (existing) {
            return res.status(400).json({ message: 'You have already submitted this exam.' });
        }

        // Map answers to the schema format without triggering AI evaluation
        const processedAnswers = answers.map(a => {
            const qDef = exam.questions.find(q => 
                (q._id && q._id.toString() === a.questionID) || 
                (q.questionID?._id && q.questionID._id.toString() === a.questionID) || 
                (q.questionID?.toString() === a.questionID)
            );
            return {
                questionID: a.questionID,
                questionText: qDef?.questionID?.text || 'Question text unavailable',
                answer: a.answer || '',
                maxMarks: qDef?.marks || 0,
                marksObtained: 0,
                feedback: 'Pending evaluation'
            };
        });

        const response = await StudentResponse.findOneAndUpdate(
            { examId, studentId },
            {
                facultyId: exam.facultyID,
                subject: exam.subject,
                answers: processedAnswers,
                totalScore: 0,
                isEvaluated: false,
                submittedAt: new Date()
            },
            { upsert: true, new: true }
        );

        // Update session status to 'submitted'
        await ExamSession.findOneAndUpdate(
            { examID: examId, studentID: studentId },
            { status: 'submitted' }
        );

        // Notify faculty room that student has submitted (to remove from seat map)
        const io = req.app.get('io');
        if (io) {
            io.to(`faculty-room:${examId}`).emit('faculty:student-submitted', { studentId });
        }

        // Notify Admin Activity Feed
        if (io) {
            io.emit('admin:activity-broadcast', { message: `Submission received for ${exam.subject}`, time: new Date().toLocaleTimeString() });
        }

        // Atomic update to Exam submissions list to prevent duplicates
        await Exam.updateOne(
            { _id: examId, "submissions.studentId": { $ne: studentId } },
            { 
                $push: { 
                    submissions: { 
                        studentId, 
                        score: 0, 
                        submittedAt: new Date() 
                    } 
                } 
            }
        );

        res.status(200).json({ message: 'Exam submitted successfully.', response });

    } catch (error) {
        console.error('Submit exam error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

/**
 * @route   GET /api/exams/:id/result
 * @desc    Get result for a specific exam for the logged-in student
 * @access  Private (Student)
 */
router.get('/:id/result', protect, authorize('Student'), async (req, res) => {
    try {
        const studentId = req.user.id || req.user._id;
        const examId = req.params.id;

        // Fetch directly from StudentResponse model as it contains evaluation data
        const submission = await StudentResponse.findOne({ examId, studentId })
            .populate('examId', 'subject maxMarks passMarks');
        
        if (!submission) {
            return res.status(404).json({ message: 'No submission found for this exam.' });
        }

        res.json(submission);
    } catch (error) {
        console.error('Get specific result error:', error.message);
        res.status(500).json({ message: 'Server Error' });
    }
});

/**
 * @route   GET /api/exams/:id/result/:studentId
 * @desc    Get result for a specific student (Faculty/Admin only)
 * @access  Private (Faculty/Admin)
 */
router.get('/:id/result/:studentId', protect, authorize('Faculty', 'Admin'), async (req, res) => {
    try {
        const { id: examId, studentId } = req.params;

        const submission = await StudentResponse.findOne({ examId, studentId })
            .populate('examId', 'subject maxMarks passMarks')
            .populate('studentId', 'name email enrollmentNumber');
        
        if (!submission) {
            return res.status(404).json({ message: 'No submission found for this student.' });
        }

        res.json(submission);
    } catch (error) {
        console.error('Get student result error:', error.message);
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;