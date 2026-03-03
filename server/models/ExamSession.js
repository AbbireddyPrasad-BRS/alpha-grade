const mongoose = require('mongoose');

const examSessionSchema = new mongoose.Schema({
  examID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exam',
    required: true
  },
  studentID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  socketID: {
    type: String,
  },
  status: {
    type: String,
    enum: ['waiting', 'admitted', 'in-progress', 'completed', 'terminated', 'submitted'],
    default: 'waiting'
  },
  startTime: {
    type: Date,
  },
  endTime: {
    type: Date,
  },
  progress: {
    type: Number,
    default: 0
  },
  monitoringData: {
    focus_change_count: { type: Number, default: 0 },
    lastHeartbeat: { type: Date },
    webcamConsent: { type: Boolean, default: false },
    microphoneConsent: { type: Boolean, default: false }
  }
}, {
  timestamps: true
});

examSessionSchema.index({ examID: 1, studentID: 1 }, { unique: true });

const ExamSession = mongoose.model('ExamSession', examSessionSchema);

module.exports = ExamSession;
