const jwt = require('jsonwebtoken');
const Faculty = require('../models/Faculty');
const Student = require('../models/Student');
const User = require('../models/User');

/**
 * @desc    Protect routes by verifying JWT token
 * @access  Private
 */
const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');

    // Find user in the correct collection based on the role in the token
    if (decoded.role === 'Faculty') {
      req.user = await Faculty.findById(decoded.id).select('-password');
    } else if (decoded.role === 'Student') {
      req.user = await Student.findById(decoded.id).select('-password');
    } else if (decoded.role === 'Admin') {
      req.user = await User.findById(decoded.id).select('-password');
    } else {
      return res.status(401).json({ message: 'Not authorized, invalid role in token' });
    }

    if (!req.user) {
        return res.status(401).json({ message: 'Not authorized, user not found' });
    }

    next();
  } catch (error) {
    console.error('Token verification failed:', error);
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

/**
 * @desc    Grant access to specific roles
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: `User role ${req.user.role} is not authorized to access this route` });
    }
    next();
  };
};

module.exports = { protect, authorize };