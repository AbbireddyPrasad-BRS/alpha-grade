const mongoose = require('mongoose');

const StudentResponseSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
  facultyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Faculty' },
  subject: { type: String, required: true },
  
  // Detailed breakdown of answers for evaluation
  answers: [{
    questionID: { type: String, required: true },
    questionText: { type: String }, // Stored for context in case exam changes
    answer: { type: String },
    maxMarks: { type: Number },
    marksObtained: { type: Number, default: 0 },
    feedback: { type: String, default: '' }
  }],

  totalScore: { type: Number, default: 0 },
  isEvaluated: { type: Boolean, default: false },
  submittedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

// Ensure efficient lookups and prevent duplicate submissions for the same exam by the same student
StudentResponseSchema.index({ examId: 1, studentId: 1 }, { unique: true });
StudentResponseSchema.index({ facultyId: 1 });

module.exports = mongoose.model('StudentResponse', StudentResponseSchema);