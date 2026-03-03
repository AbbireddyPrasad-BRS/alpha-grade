import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

const ExamRoom = ({ examId, studentId, onExamEnd }) => {
  const [socket, setSocket] = useState(null);
  const [examStatus, setExamStatus] = useState('waiting');
  const [exam, setExam] = useState(null);
  const [answers, setAnswers] = useState({});
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [webcamConsent, setWebcamConsent] = useState(false);
  const [microphoneConsent, setMicrophoneConsent] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    // Request permissions
    const requestPermissions = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: true, 
          audio: true 
        });
        setWebcamConsent(true);
        setMicrophoneConsent(true);
        stream.getTracks().forEach(track => track.stop());
      } catch (error) {
        console.error('Permission denied:', error);
      }
    };

    requestPermissions();

    // Socket connection
    const newSocket = io('http://localhost:5000');
    setSocket(newSocket);

    // Join exam room
    newSocket.emit('join_exam_room', {
      examId,
      studentId,
      webcamConsent,
      microphoneConsent
    });

    // Socket listeners
    newSocket.on('joined_waiting_room', () => {
      setExamStatus('waiting');
    });

    newSocket.on('exam_started', (data) => {
      setExamStatus('in-progress');
      fetchExamData();
    });

    newSocket.on('exam_terminated', (data) => {
      if (data.studentId === studentId) {
        alert('Your exam has been terminated by the faculty');
        onExamEnd();
      }
    });

    newSocket.on('exam_submitted', (data) => {
      alert(`Exam submitted! Total Score: ${data.totalScore}`);
      onExamEnd();
    });

    // Tab switch detection
    const handleVisibilityChange = () => {
      if (document.hidden && examStatus === 'in-progress') {
        setTabSwitchCount(prev => prev + 1);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      newSocket.close();
    };
  }, [examId, studentId, examStatus]);

  // Heartbeat and monitoring
  useEffect(() => {
    if (socket && examStatus === 'in-progress') {
      intervalRef.current = setInterval(() => {
        socket.emit('student_heartbeat', {
          examId,
          studentId,
          tabSwitchCount
        });
      }, 30000); // Every 30 seconds
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [socket, examStatus, tabSwitchCount]);

  const fetchExamData = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:5000/api/student/exam/${examId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const examData = await response.json();
      setExam(examData);
      setTimeRemaining(examData.duration * 60); // Convert to seconds
      
      // Initialize answers
      const initialAnswers = {};
      examData.questions.forEach(q => {
        initialAnswers[q._id] = '';
      });
      setAnswers(initialAnswers);
    } catch (error) {
      console.error('Failed to fetch exam:', error);
    }
  };

  // Timer
  useEffect(() => {
    if (timeRemaining > 0 && examStatus === 'in-progress') {
      const timer = setTimeout(() => {
        setTimeRemaining(timeRemaining - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (timeRemaining === 0 && examStatus === 'in-progress') {
      handleSubmitExam();
    }
  }, [timeRemaining, examStatus]);

  const handleAnswerChange = (questionId, answer) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: answer
    }));
  };

  const handleSubmitExam = () => {
    if (!socket) return;
    
    const submissionData = Object.entries(answers).map(([questionId, answer]) => ({
      questionId,
      answer
    }));

    socket.emit('submit_exam', {
      examId,
      studentId,
      answers: submissionData
    });
  };

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (examStatus === 'waiting') {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md text-center">
          <h2 className="text-2xl font-bold mb-4">Waiting Room</h2>
          <p className="mb-4">Please wait for the faculty to start the exam.</p>
          <div className="space-y-2">
            <p className={`text-sm ${webcamConsent ? 'text-green-600' : 'text-red-600'}`}>
              Webcam: {webcamConsent ? 'Granted' : 'Permission Required'}
            </p>
            <p className={`text-sm ${microphoneConsent ? 'text-green-600' : 'text-red-600'}`}>
              Microphone: {microphoneConsent ? 'Granted' : 'Permission Required'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-lg">Loading exam...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <h1 className="text-2xl font-bold text-gray-900">{exam.title}</h1>
            <div className="flex items-center space-x-4">
              <div className="text-lg font-mono bg-red-100 px-3 py-1 rounded">
                Time: {formatTime(timeRemaining)}
              </div>
              <div className="text-sm text-gray-600">
                Tab Switches: {tabSwitchCount}
              </div>
              <button
                onClick={handleSubmitExam}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
              >
                Submit Exam
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Questions */}
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="space-y-8">
          {exam.questions.map((question, index) => (
            <div key={question._id} className="bg-white rounded-lg shadow p-6">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Question {index + 1} ({question.maxMarks} marks)
                </h3>
                <p className="text-gray-700">{question.question}</p>
              </div>
              <textarea
                className="w-full h-32 p-3 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Type your answer here..."
                value={answers[question._id] || ''}
                onChange={(e) => handleAnswerChange(question._id, e.target.value)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ExamRoom;