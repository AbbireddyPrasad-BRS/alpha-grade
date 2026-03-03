const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const facultySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    default: 'Faculty',
  },
  department: { type: String, default: '' },
  canCreateExam: { type: Boolean, default: false },
  canEvaluate: { type: Boolean, default: false },
  canDeleteExam: { type: Boolean, default: false },
}, {
  timestamps: true
});

// Pre-save hook to hash password
facultySchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password for login
facultySchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

const Faculty = mongoose.model('Faculty', facultySchema);
module.exports = Faculty;