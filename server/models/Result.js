const mongoose = require('mongoose');

const resultSchema = new mongoose.Schema({
  examId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exam',
    required: true
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  responseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StudentResponse',
    required: true
  },
  totalScore: {
    type: Number,
    required: true,
    default: 0
  },
  answers: [
    {
      questionID: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'QuestionBankItem'
      },
      marksObtained: {
        type: Number,
        default: 0
      },
      feedback: {
        type: String,
        default: ''
      }
    }
  ],
  evaluatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Result', resultSchema);