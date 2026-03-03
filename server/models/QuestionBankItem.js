const mongoose = require('mongoose');

const questionBankItemSchema = new mongoose.Schema({
  text: {
    type: String,
    required: true,
    trim: true,
  },
  marks: {
    type: Number,
    required: true,
    min: 0,
  },
  difficulty: {
    type: String,
    enum: ['Easy', 'Medium', 'Hard'],
    required: true,
  },
  domain: {
    type: String,
    required: true,
    trim: true,
  },
  modelAnswer: {
    type: String,
    required: false,
    trim: true,
  },
  facultyID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Faculty',
    required: true,
  },
}, {
  timestamps: true
});

// Index for faster queries on facultyID
questionBankItemSchema.index({ facultyID: 1 });
questionBankItemSchema.index({ domain: 1 });

const QuestionBankItem = mongoose.model('QuestionBankItem', questionBankItemSchema);

module.exports = QuestionBankItem;
