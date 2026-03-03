const mongoose = require('mongoose');

const examSchema = new mongoose.Schema({
  facultyID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Faculty',
    required: true,
  },
  subject: {
    type: String,
    required: true,
    trim: true,
  },
  maxMarks: {
    type: Number,
    required: true,
    min: 1,
  },
  passMarks: {
    type: Number,
    required: true,
    min: 0,
  },
  durationMinutes: {
    type: Number,
    required: true,
    min: 1,
  },
  evaluationMode: {
    type: String,
    enum: ['AI Based Evaluation', 'Rubric Based Evaluation'],
    required: true,
  },
  creationMethod: {
    type: String,
    trim: true,
  },
  topics: {
    type: Array,
    default: []
  },
  numberOfQuestions: {
    type: Number,
    required: true,
    default: 0,
  },
  isCreatedByAdmin: {
    type: Boolean,
    default: false,
  },
  startTime: {
    type: Date,
  },
  actualStartTime: {
    type: Date,
  },
  endTime: {
    type: Date,
  },
  status: {
    type: String,
    enum: ['pending', 'open', 'closed'],
    default: 'pending',
    required: true,
  },
  allowDeletion: {
    type: Boolean,
    default: false,
  },
  rubricText: {
    type: String,
    default: ''
  },
  examCode: {
    type: String,
    trim: true,
  },
  password: {
    type: String,
    trim: true,
  },
  questions: [{
    questionID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'QuestionBankItem',
      required: true,
    },
    marks: {
      type: Number,
      required: true,
      min: 0,
    }
  }],
  submissions: [{
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    score: { type: Number, default: null },
    submittedAt: { type: Date, default: Date.now }
  }]
}, {
  timestamps: true
});

// Index for faster queries
examSchema.index({ facultyID: 1 });
examSchema.index({ subject: 1 });


const Exam = mongoose.model('Exam', examSchema);

module.exports = Exam;
