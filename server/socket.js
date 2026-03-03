const ExamSession = require('./models/ExamSession');
const Exam = require('./models/Exam');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const Faculty = require('./models/Faculty');
const Student = require('./models/Student');

const initializeSocket = (io) => {
  // Middleware to authenticate socket connections and attach user info
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // Fetch user details from the correct model based on role
        let user;
        if (decoded.role === 'Faculty') {
          user = await Faculty.findById(decoded.id).select('name role');
        } else if (decoded.role === 'Student') {
          user = await Student.findById(decoded.id).select('name role');
        } else if (decoded.role === 'Admin') {
          user = await User.findById(decoded.id).select('name role');
        }

        if (user) {
          socket.user = user;
        }
      } catch (err) {
        console.error('Socket authentication error:', err.message);
        return next(new Error('Authentication error'));
      }
    }
    next();
  });

  io.on('connection', (socket) => {
    console.log(`New client connected: ${socket.id} (User: ${socket.user ? socket.user.name : 'Guest'})`);

    // Helper to notify admins of system activity
    const notifyAdmins = (message) => {
      io.emit('admin:activity-broadcast', {
        message,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
    };

    // Event for when a student joins an exam lobby
    socket.on('student:join-lobby', async ({ examId }) => {
      if (!socket.user) {
        return console.error('Socket user not authenticated');
      }

      try {
        // Create or find the exam session for this student and exam
        let session = await ExamSession.findOneAndUpdate(
          { examID: examId, studentID: socket.user.id },
          { socketID: socket.id, status: 'admitted' },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        ).populate('studentID', 'name email');

        // Student joins a room for this specific exam
        socket.join(`exam-room:${examId}`);

        // Notify the faculty monitoring this exam
        // The faculty will be in a room like `faculty-room:examId`
        io.to(`faculty-room:${examId}`).emit('faculty:student-joined', session);

        console.log(`Student ${socket.user.id} joined lobby for exam ${examId}`);
        notifyAdmins(`Student ${socket.user.name} joined lobby for Exam ID: ${examId}`);
      } catch (error) {
        console.error('Error in student:join-lobby event:', error);
      }
    });

    // Event for when a faculty starts monitoring an exam
    socket.on('faculty:start-monitoring', async ({ examId }) => {
      try {
        // Set the exam status to 'open'
        await Exam.findByIdAndUpdate(examId, { status: 'open' });

        // Faculty joins a specific room to receive updates for that exam
        socket.join(`faculty-room:${examId}`);
        console.log(`Faculty ${socket.id} is now monitoring exam ${examId} and it is now open.`);

        // Send waiting list
        const waitingSessions = await ExamSession.find({ examID: examId, status: 'waiting' }).populate('studentID', 'name email');
        if (waitingSessions.length > 0) {
          socket.emit('faculty:waiting-list', waitingSessions);
        }

        // Send admitted list for the seat map
        const admittedSessions = await ExamSession.find({ examID: examId, status: 'admitted' }).populate('studentID', 'name email');
        if (admittedSessions.length > 0) {
          socket.emit('faculty:admitted-list', admittedSessions);
        }

        // Also emit an event to all clients to refresh their exam lists
        io.emit('exams:list-updated');

      } catch (error) {
        console.error('Error in faculty:start-monitoring event:', error);
      }
    });

    // Event for Admin to observe an exam (join room without changing status)
    socket.on('admin:observe-exam', async ({ examId }) => {
      if (!socket.user || socket.user.role !== 'Admin') {
        return console.error('Unauthorized admin access attempt');
      }
      try {
        socket.join(`faculty-room:${examId}`);
        console.log(`Admin ${socket.user.name} is observing exam ${examId}`);

        // Send current waiting list to admin immediately
        const waitingSessions = await ExamSession.find({ examID: examId, status: 'waiting' }).populate('studentID', 'name email');
        if (waitingSessions.length > 0) {
          socket.emit('faculty:waiting-list', waitingSessions);
        }
        const admittedSessions = await ExamSession.find({ examID: examId, status: 'admitted' }).populate('studentID', 'name email');
        if (admittedSessions.length > 0) {
          socket.emit('faculty:admitted-list', admittedSessions);
        }
      } catch (error) {
        console.error('Error in admin:observe-exam:', error);
      }
    });

    // Event for when a faculty admits a specific student
    socket.on('faculty:admit-student', async ({ sessionId }) => {
      try {
        const session = await ExamSession.findByIdAndUpdate(
          sessionId,
          { status: 'admitted' },
          { new: true }
        ).populate('studentID', 'name');
        
        if (session && session.socketID) {
          // Notify the specific student they have been admitted
          io.to(session.socketID).emit('student:admitted');
          
          // Notify the faculty/admin that the student has been moved (for UI update)
          io.to(`faculty-room:${session.examID}`).emit('faculty:student-admitted', session);
          notifyAdmins(`Student ${session.studentID.name} admitted to exam.`);
        }
      } catch (error) {
        console.error('Error admitting student:', error);
      }
    });

    // Event for when a faculty kicks a student from the lobby
    socket.on('faculty:kick-student', async ({ sessionId }) => {
      try {
        const session = await ExamSession.findByIdAndDelete(sessionId);
        if (session && session.socketID) {
          // Notify the specific student they have been kicked
          io.to(session.socketID).emit('student:kicked');
        }
        // Notify the faculty that the student has been removed (for UI update)
        io.to(`faculty-room:${session.examID}`).emit('faculty:student-kicked', { sessionId });
      } catch (error) {
        console.error('Error kicking student:', error);
      }
    });

    // Event for when faculty starts the exam for everyone in the waiting room
    socket.on('faculty:start-exam', async ({ examId }) => {
      try {
        const actualStartTime = new Date();
        // Update all waiting students for this exam to 'admitted' in DB
        await Promise.all([
          ExamSession.updateMany({ examID: examId, status: 'waiting' }, { status: 'admitted' }),
          Exam.findByIdAndUpdate(examId, { actualStartTime, status: 'open' })
        ]);


        const admittedSessions = await ExamSession.find({ examID: examId, status: 'admitted' }).populate('studentID', 'name email');
        
        admittedSessions.forEach(session => {
          if (session.socketID) {
            io.to(session.socketID).emit('student:admitted');
          }
        });

        // Notify faculty room to clear waiting list
        io.to(`faculty-room:${examId}`).emit('faculty:waiting-list', []);
        io.to(`faculty-room:${examId}`).emit('faculty:admitted-list', admittedSessions);
        
        console.log(`Starting exam ${examId} for students.`);
      } catch (error) {
        console.error('Error starting exam:', error);
      }
    });

    // Event for when an admin updates a user's permissions or details
    socket.on('admin:user-updated', () => {
      io.emit('users:list-updated');
    });

    // Event for when an exam is updated or deleted
    socket.on('admin:exam-updated', () => {
      io.emit('exams:list-updated');
    });

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
      // Optional: Add logic to handle student disconnection from lobby
      // For example, update the ExamSession status.
    });
  });
};

module.exports = initializeSocket;