const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Faculty = require('../models/Faculty');
const Student = require('../models/Student');
const mongoose = require('mongoose');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

// Patch schemas to ensure userId is recognized and not stripped during save.
// This prevents "duplicate key error ... index: userId_1 dup key: { userId: null }"
if (Student.schema && !Student.schema.path('userId')) {
  Student.schema.add({ userId: { type: mongoose.Schema.Types.ObjectId, unique: true } });
}
if (Faculty.schema && !Faculty.schema.path('userId')) {
  Faculty.schema.add({ userId: { type: mongoose.Schema.Types.ObjectId, unique: true } });
}
if (Faculty.schema && !Faculty.schema.path('canCreateExam')) {
  Faculty.schema.add({ canCreateExam: { type: Boolean, default: true } });
}
if (Faculty.schema && !Faculty.schema.path('canEvaluate')) {
  Faculty.schema.add({ canEvaluate: { type: Boolean, default: true } });
}
if (Student.schema && !Student.schema.path('canTakeExam')) {
  Student.schema.add({ canTakeExam: { type: Boolean, default: true } });
}
if (Student.schema && !Student.schema.path('role')) {
  Student.schema.add({ role: { type: String, default: 'Student' } });
}
if (Faculty.schema && !Faculty.schema.path('role')) {
  Faculty.schema.add({ role: { type: String, default: 'Faculty' } });
}

// Generate JWT token
const generateToken = (id, role, name) => {
  return jwt.sign({ id, role, name }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

/**
 * @route   GET /api/auth/admin-exists
 * @desc    Check if an admin is already registered
 * @access  Public
 */
router.get('/admin-exists', async (req, res) => {
  try {
    const adminCount = await User.countDocuments({ role: 'Admin' });
    res.json({ exists: adminCount > 0 });
  } catch (error) {
    console.error('Error checking admin existence:', error);
    res.status(500).json({ message: 'Server error checking admin status' });
  }
});

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user (Student or Faculty)
 * @access  Public
 */
router.post('/register', async (req, res) => {
  const { name, email, password, role, department, enrollmentNumber } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ message: 'name, email, password and role are required' });
  }

  if (!['Faculty', 'Student', 'Admin'].includes(role)) {
    return res.status(400).json({ message: 'role must be either "Faculty", "Student" or "Admin"' });
  }

  try {
    if (role === 'Admin') {
      const adminCount = await User.countDocuments({ role: 'Admin' });
      if (adminCount > 0) {
        return res.status(400).json({ message: 'Admin already registered' });
      }
    }

    // Check if user already exists in either collection
    const existingUser = (await Faculty.findOne({ email })) || (await Student.findOne({ email })) || (await User.findOne({ email }));
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    let newUser;

    // Create user directly in the appropriate collection
    if (role === 'Faculty') {
      newUser = new Faculty({
        name,
        email,
        password,
        role: 'Faculty',
        department: department || '',
        canCreateExam: true,
        canEvaluate: true,
      });
      // Force userId to be the same as _id to satisfy the unique index in MongoDB
      newUser.set('userId', newUser._id, { strict: false });
    } else if (role === 'Student') {
      newUser = new Student({
        name,
        email,
        password,
        role: 'Student',
        enrollmentNumber: enrollmentNumber || '',
        canTakeExam: true,
      });
      // Force userId to be the same as _id to satisfy the unique index in MongoDB
      newUser.set('userId', newUser._id, { strict: false });
    } else if (role === 'Admin') {
      newUser = new User({
        name,
        email,
        password,
        role: 'Admin'
      });
    } else {
      // This case is already handled by the initial validation, but it's good practice
      return res.status(400).json({ message: 'Invalid role specified' });
    }

    await newUser.save();

    // Generate token
    const token = generateToken(newUser._id, newUser.role, newUser.name);

    // Notify clients about the new user
    const io = req.app.get('io');
    if (io) io.emit('users:list-updated');

    res.status(201).json({
      message: `${role} registered successfully`,
      token,
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        canCreateExam: newUser.role === 'Faculty' ? newUser.canCreateExam : undefined,
        canEvaluate: newUser.role === 'Faculty' ? newUser.canEvaluate : undefined,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    // Handle duplicate key error explicitly
    if (error.code === 11000) {
      // Check which key caused the duplication
      const field = Object.keys(error.keyPattern)[0];
      const message = field === 'email' ? 'Email already registered.' : `An account with this ${field} already exists.`;
      return res.status(400).json({ message });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user & get token
 * @access  Public
 */
router.post('/login', async (req, res) => {
  const { email, password, role } = req.body;

  if (!email || !password || !role) {
    return res.status(400).json({ message: 'email, password, and role are required' });
  }

  try {
    let user;

    // Handle Admin Login
    if (role === 'Admin') {
      user = await User.findOne({ email, role: 'Admin' });
    } else if (role === 'Faculty') {
      user = await Faculty.findOne({ email });
    } else if (role === 'Student') {
      user = await Student.findOne({ email });
    } else {
      return res.status(400).json({ message: 'Invalid role specified' });
    }

    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Generate token
    const token = generateToken(user._id, user.role || role, user.name);

    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        canCreateExam: user.role === 'Faculty' ? user.canCreateExam : undefined,
        canEvaluate: user.role === 'Faculty' ? user.canEvaluate : undefined,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   GET /api/auth/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/me', protect, async (req, res) => {
  try {
    let user;
    const id = req.user.id || req.user._id;
    const role = req.user.role;

    if (role === 'Admin') {
      user = await User.findById(id).select('-password');
    } else if (role === 'Faculty') {
      user = await Faculty.findById(id).select('-password');
    } else if (role === 'Student') {
      user = await Student.findById(id).select('-password');
    }

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   GET /api/auth/users
 * @desc    Get all users (Admin only)
 * @access  Private (Admin)
 */
router.get('/users', protect, authorize('Admin'), async (req, res) => {
  try {
    console.log('Admin requesting users list...');

    // Fetch from specific collections
    const facultyDocs = await Faculty.find({}).select('-password').sort({ createdAt: -1 });
    const studentDocs = await Student.find({}).select('-password').sort({ createdAt: -1 });
    
    // Fetch from generic User collection (legacy or misclassified)
    const userFaculty = await User.find({ role: 'Faculty' }).select('-password').sort({ createdAt: -1 });
    const userStudents = await User.find({ role: 'Student' }).select('-password').sort({ createdAt: -1 });
    const admins = await User.find({ role: 'Admin' }).select('-password');

    // Helper to merge and deduplicate by email (preferring specific collection docs)
    const mergeUsers = (specific, legacy) => {
      const map = new Map();
      legacy.forEach(u => map.set(u.email, u.toObject ? u.toObject() : u));
      specific.forEach(u => map.set(u.email, u.toObject ? u.toObject() : u));
      return Array.from(map.values());
    };

    const faculty = mergeUsers(facultyDocs, userFaculty);
    const students = mergeUsers(studentDocs, userStudents);

    console.log(`Returning: ${faculty.length} faculty, ${students.length} students, ${admins.length} admins`);
    res.json({ faculty, students, admins });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   DELETE /api/auth/users/:id
 * @desc    Delete a user (Admin only)
 * @access  Private (Admin)
 */
router.delete('/users/:id', protect, authorize('Admin'), async (req, res) => {
  const { role } = req.query;
  try {
    let deletedUser;
    if (role === 'Faculty') {
      deletedUser = await Faculty.findByIdAndDelete(req.params.id);
      if (!deletedUser) {
        deletedUser = await User.findOneAndDelete({ _id: req.params.id, role: 'Faculty' });
      }
    } else if (role === 'Student') {
      deletedUser = await Student.findByIdAndDelete(req.params.id);
      if (!deletedUser) {
        deletedUser = await User.findOneAndDelete({ _id: req.params.id, role: 'Student' });
      }
    } else if (role === 'Admin') {
       if (req.params.id === req.user.id) {
           return res.status(400).json({ message: 'Cannot delete yourself' });
       }
       deletedUser = await User.findByIdAndDelete(req.params.id);
    }

    if (!deletedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const io = req.app.get('io');
    if (io) io.emit('users:list-updated');

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   PUT /api/auth/users/:id
 * @desc    Update a user's details (Admin only)
 * @access  Private (Admin)
 */
router.put('/users/:id', protect, authorize('Admin'), async (req, res) => {
  const { name, email, department, canCreateExam, enrollmentNumber, canEvaluate, canTakeExam, canDeleteExam } = req.body;

  try {
    // 1. Try to update in Faculty collection
    let updatedUser = await Faculty.findByIdAndUpdate(
      req.params.id,
      { name, email, department, canCreateExam, canEvaluate, canDeleteExam },
      { new: true, runValidators: true }
    ).select('-password');

    // 2. If not found, try Student collection
    if (!updatedUser) {
      updatedUser = await Student.findByIdAndUpdate(
        req.params.id,
        { name, email, enrollmentNumber, canTakeExam },
        { new: true, runValidators: true }
      ).select('-password');
    }

    // 3. If not found, try generic User collection (Legacy)
    if (!updatedUser) {
      const legacyUser = await User.findById(req.params.id);
      if (legacyUser) {
        // If it's a Faculty in User collection, migrate to Faculty collection to support 'department'
        if (legacyUser.role === 'Faculty') {
          const userData = legacyUser.toObject();
          userData.department = department || '';
          userData.name = name || userData.name;
          userData.email = email || userData.email;
          userData.canCreateExam = canCreateExam !== undefined ? canCreateExam : true;
          userData.canEvaluate = canEvaluate !== undefined ? canEvaluate : true;
          
          // Insert into Faculty collection directly to preserve _id and password hash
          await Faculty.collection.insertOne(userData);
          await User.findByIdAndDelete(req.params.id);
          updatedUser = await Faculty.findById(req.params.id).select('-password');
        } else if (legacyUser.role === 'Student') {
          const userData = legacyUser.toObject();
          userData.enrollmentNumber = enrollmentNumber || '';
          userData.name = name || userData.name;
          userData.email = email || userData.email;
          userData.canTakeExam = canTakeExam !== undefined ? canTakeExam : true;
          
          await Student.collection.insertOne(userData);
          await User.findByIdAndDelete(req.params.id);
          updatedUser = await Student.findById(req.params.id).select('-password');
        } else {
          // Just update User doc
          updatedUser = await User.findByIdAndUpdate(req.params.id, { name, email }, { new: true }).select('-password');
        }
      }
    }

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const io = req.app.get('io');
    if (io) io.emit('users:list-updated');

    res.json(updatedUser);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
