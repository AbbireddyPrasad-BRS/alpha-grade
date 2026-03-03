import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';

const ExamTaking = () => {
  const { examId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [exam, setExam] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Exam State
  const [hasStarted, setHasStarted] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [questionStatus, setQuestionStatus] = useState({}); // { index: 'answered' | 'review' | 'visited' }
  const [answers, setAnswers] = useState({}); // { questionId: answerText }
  const [broadcasts, setBroadcasts] = useState([]);
  
  // Media/Permissions
  const videoRef = useRef(null);
  const [stream, setStream] = useState(null);
  
  const socket = useSocket(); // Use the global socket from context

  const fetchExam = useCallback(async () => {
    try {
      const response = await api.get(`/exams/${examId}`);

      setExam(response.data);
      
      // Calculate time left based on actual start time if available, otherwise scheduled start time
      const startRef = response.data.actualStartTime || response.data.startTime;
      if (startRef && response.data.durationMinutes) {
        const endTime = new Date(new Date(startRef).getTime() + response.data.durationMinutes * 60000);
        const now = new Date();
        const seconds = Math.floor((endTime - now) / 1000);
        setTimeLeft(seconds > 0 ? seconds : 0);
      }
      
      // Initialize answers to ensure all questions are tracked
      const initialAnswers = {};
      const initialStatus = {};
      if (response.data.questions) {
        response.data.questions.forEach((q, index) => {
          // Robust ID resolution: try subdoc _id, then questionID ref (obj or string), then index
          const id = q._id || (typeof q.questionID === 'object' ? q.questionID._id : q.questionID) || index;
          initialAnswers[id] = '';
          initialStatus[index] = 'unvisited';
        });
      }
      setAnswers(initialAnswers);
      setQuestionStatus(initialStatus);
      setLoading(false);
    } catch (err) {
      if (err.response?.data?.inLobby) {
        // Redirect to lobby if not admitted yet
        navigate(`/exam-lobby/${examId}`);
        return;
      }
      console.error('Failed to fetch exam', err);
      setLoading(false);
    }
  }, [examId, navigate]);

  useEffect(() => {
    fetchExam();
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [examId, stream, fetchExam]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    if (socket) {
      socket.on('student:kicked', () => {
        alert('Your exam session has been terminated by the invigilator.');
        navigate('/dashboard');
      });

      socket.on('exam:broadcast', ({ message }) => {
        setBroadcasts(prev => [...prev, { id: Date.now(), text: message }]);
      });

      socket.on('student:admitted', () => {
        // Re-fetch to get questions and actual start time if faculty triggered start
        fetchExam();
      });

      return () => {
        socket.off('student:kicked');
        socket.off('exam:broadcast');
      };
    }
  }, [socket, navigate, examId, fetchExam]);

  const submitExam = useCallback(async (auto = false) => {
    if (isSubmitting || isSubmitted) return;

    if (!auto) {
      const attemptedCount = Object.keys(answers).filter(k => answers[k] && answers[k].trim()).length;
      const total = exam.questions.length;
      if (!window.confirm(`You have attempted ${attemptedCount} out of ${total} questions. Are you sure you want to submit?`)) {
        return;
      }
    }

    setIsSubmitting(true);
    setHasStarted(false); // Stop proctoring logic immediately

    try {
      const studentId = user?._id || user?.id;
      if (!studentId) {
        throw new Error("User session invalid. Please log in again.");
      }

      const formattedAnswers = Object.entries(answers).map(([questionId, answer]) => ({
        questionID: questionId,
        answer
      }));
      
      await api.post(`/exams/${examId}/submit`, { 
        answers: formattedAnswers,
        studentId,
        examId
      });

      setIsSubmitted(true);
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(err => {});
      }
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }

      alert('Exam submitted successfully!');
      navigate('/dashboard');
    } catch (err) {
      console.error('Failed to submit exam', err);
      const msg = err.response?.data?.message || 'Failed to submit exam. Please try again.';
      alert(msg);
      setHasStarted(true); // Re-enable proctoring if submission failed
    } finally {
      setIsSubmitting(false);
    }
  }, [answers, exam, user, examId, stream, isSubmitting, isSubmitted, navigate]);

  useEffect(() => {
    if (hasStarted && timeLeft !== null && timeLeft > 0 && !isSubmitted) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    } else if (hasStarted && timeLeft === 0 && !isSubmitted) {
      const autoSubmit = async () => { await submitExam(true); };
      autoSubmit();
    }
  }, [timeLeft, hasStarted, isSubmitted, submitExam]);

  // Attach stream to video element when started
  useEffect(() => {
    if (hasStarted && videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [hasStarted, stream]);

  useEffect(() => {
    if (hasStarted && exam && !isSubmitted) {
      setQuestionStatus(prev => {
        if (prev[currentQuestionIndex] === 'unvisited' || !prev[currentQuestionIndex]) {
          return { ...prev, [currentQuestionIndex]: 'visited' };
        }
        return prev;
      });
    }
  }, [currentQuestionIndex, hasStarted, exam, isSubmitted]);

  // Real-time Monitoring: Heartbeat and Tab Switches
  const [tabSwitches, setTabSwitches] = useState(0);
  const answersRef = useRef(answers);
  const tabSwitchesRef = useRef(tabSwitches);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    tabSwitchesRef.current = tabSwitches;
  }, [tabSwitches]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && hasStarted && !isSubmitted) {
        setTabSwitches(prev => {
          const newVal = prev + 1;
          // Send immediate update on tab switch for real-time monitoring
          if (socket && exam) {
            const attemptedCount = Object.keys(answersRef.current).filter(k => answersRef.current[k] && answersRef.current[k].trim()).length;
            const progress = Math.round((attemptedCount / exam.questions.length) * 100);
            socket.emit('student:heartbeat', { 
              examId, 
              studentId: user?._id || user?.id,
              progress, 
              tabSwitches: newVal,
              focus_change_count: Number(newVal) // Match ExamSession schema
            });
          }
          return newVal;
        });
      }
    };

    const handleFullscreenExit = () => {
      if (!document.fullscreenElement && hasStarted && !isSubmitted) {
        setTabSwitches(prev => {
          const newVal = prev + 1;
          if (socket && exam) {
            socket.emit('student:heartbeat', { 
              examId, 
              studentId: user?._id || user?.id,
              progress: Math.round((Object.keys(answersRef.current).filter(k => answersRef.current[k]?.trim()).length / exam.questions.length) * 100),
              tabSwitches: newVal,
              focus_change_count: Number(newVal)
            });
          }
          return newVal;
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('fullscreenchange', handleFullscreenExit);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('fullscreenchange', handleFullscreenExit);
    };
  }, [hasStarted, isSubmitted, socket, exam, examId, user]);

  useEffect(() => {
    if (hasStarted && socket && !isSubmitted && exam) {
      const heartbeatInterval = setInterval(() => {
        const attemptedCount = Object.keys(answersRef.current).filter(k => answersRef.current[k] && answersRef.current[k].trim()).length;
        const progress = Math.round((attemptedCount / exam.questions.length) * 100);
        
        socket.emit('student:heartbeat', {
          examId,
          studentId: user?._id || user?.id,
          progress,
          tabSwitches: tabSwitchesRef.current,
          focus_change_count: Number(tabSwitchesRef.current) // Match ExamSession schema
        });
      }, 5000); // Every 5 seconds for better real-time accuracy

      return () => clearInterval(heartbeatInterval);
    }
  }, [hasStarted, socket, isSubmitted, examId, exam]);

  const enterFullscreen = async () => {
    try {
      const element = document.documentElement;
      if (element.requestFullscreen) await element.requestFullscreen();
      else if (element.webkitRequestFullscreen) await element.webkitRequestFullscreen();
    } catch (err) {
      console.error('Fullscreen request failed', err);
    }
  };

  const startExam = async () => {
    try {
      await enterFullscreen();

      // Request Webcam
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      setStream(mediaStream);
      
      setHasStarted(true);
      if (socket) {
        socket.emit('student:start-exam', { examId });
        // Send initial heartbeat immediately to show student as online and in-progress
        const attemptedCount = Object.keys(answersRef.current).filter(k => answersRef.current[k] && answersRef.current[k].trim()).length;
        const progress = Math.round((attemptedCount / exam.questions.length) * 100);
        socket.emit('student:heartbeat', { 
          examId, 
          studentId: user?._id || user?.id,
          progress, 
          tabSwitches: tabSwitchesRef.current,
          focus_change_count: Number(tabSwitchesRef.current)
        });
      }
    } catch (err) {
      alert('Permissions for Webcam and Fullscreen are required to start the exam. Please allow access.');
      console.error(err);
    }
  };

  const handleAnswerChange = (qId, val) => {
    setAnswers(prev => ({ ...prev, [qId]: val }));
  };

  const handleSaveAndNext = () => {
    const q = exam.questions[currentQuestionIndex];
    const qId = q._id || (typeof q.questionID === 'object' ? q.questionID._id : q.questionID) || currentQuestionIndex;
    
    if (answers[qId] && answers[qId].trim()) {
      setQuestionStatus(prev => ({ ...prev, [currentQuestionIndex]: 'answered' }));
    } else {
      setQuestionStatus(prev => ({ ...prev, [currentQuestionIndex]: 'visited' }));
    }

    if (currentQuestionIndex < exam.questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    }
  };

  const handleMarkForReview = () => {
    setQuestionStatus(prev => ({ ...prev, [currentQuestionIndex]: 'review' }));
    if (currentQuestionIndex < exam.questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    }
  };

  const getStatusColor = (index) => {
    const status = questionStatus[index];
    if (status === 'answered') return 'bg-green-600 text-white border-green-800';
    if (status === 'review') return 'bg-violet-600 text-white border-violet-800';
    if (status === 'visited') return 'bg-orange-500 text-white border-orange-700';
    return 'bg-gray-200 text-gray-500 border-gray-300';
  };

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const preventCopyPaste = (e) => {
    e.preventDefault();
    alert('Copying and pasting is not allowed during the exam.');
  };

  if (loading || !exam) return <div className="p-10 text-center">Loading Exam...</div>;

  // 1. Thank You Screen
  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-lg shadow-lg text-center max-w-md w-full">
          <div className="text-green-500 text-5xl mb-4">✓</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Exam Submitted!</h2>
          <p className="text-gray-600 mb-6">Thank you for completing the exam. Your responses have been recorded.</p>
          <button 
            onClick={() => navigate('/dashboard')}
            className="btn-primary w-full"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // 2. Instructions Screen
  if (!hasStarted) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-2xl w-full">
          <h1 className="text-3xl font-bold text-gray-900 mb-6 border-b pb-4">Exam Instructions</h1>
          
          <div className="space-y-4 text-gray-700 mb-8">
            <p><strong>Subject:</strong> {exam.subject}</p>
            <p><strong>Duration:</strong> {exam.durationMinutes} Minutes</p>
            <p><strong>Total Questions:</strong> {exam.questions.length}</p>
            
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 my-4">
              <h3 className="font-bold text-yellow-800 mb-2">Important Rules:</h3>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>You must grant permission for <strong>Webcam</strong> and <strong>Fullscreen</strong> mode.</li>
                <li>Do not exit fullscreen mode during the exam.</li>
                <li><strong>Copy & Paste</strong> is strictly prohibited.</li>
                <li>Ensure you have a stable internet connection.</li>
                <li>The exam will auto-submit when the timer reaches zero.</li>
              </ul>
            </div>
          </div>

          <button 
            onClick={startExam}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 px-6 rounded-lg text-lg transition-colors shadow-md"
          >
            Grant Permissions & Start Exam
          </button>
        </div>
      </div>
    );
  }

  // 3. Waiting for Invigilator to Trigger Start (or scheduled time)
  const isExamLive = exam.actualStartTime || (exam.startTime && new Date(exam.startTime) <= new Date());
  if (!isExamLive) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-lg text-center max-w-md w-full">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Waiting for Invigilator</h1>
          <p className="text-gray-600 mb-2">You have joined the exam room for <strong>{exam.subject}</strong>.</p>
          <p className="text-indigo-600 font-semibold">The exam will begin as soon as the invigilator starts the session.</p>
          <p className="text-xs text-gray-400 mt-6 italic">Webcam proctoring is active. Do not exit this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen bg-gray-100 flex flex-col"
      onCopy={preventCopyPaste}
      onPaste={preventCopyPaste}
      onCut={preventCopyPaste}
      onContextMenu={preventCopyPaste}
    >
      {/* Malpractice Warning Banner */}
      {tabSwitches > 3 && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 bg-red-600 text-white px-6 py-2 rounded-full shadow-2xl font-bold animate-pulse border-2 border-white">
          ⚠️ MALPRACTICE WARNING: {tabSwitches} violations detected. Faculty notified.
        </div>
      )}

      {/* Fullscreen Enforcement Overlay */}
      {hasStarted && !isSubmitted && !isFullscreen && (
        <div className="fixed inset-0 z-[100] bg-gray-900 bg-opacity-95 flex flex-col items-center justify-center p-6 text-center">
          <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-md">
            <h2 className="text-2xl font-black text-red-600 mb-4">FULLSCREEN REQUIRED</h2>
            <p className="text-gray-600 mb-8">You have exited fullscreen mode. This is tracked as a malpractice incident. Please return to fullscreen to continue.</p>
            <button onClick={enterFullscreen} className="w-full bg-indigo-600 text-white font-bold py-3 rounded-lg hover:bg-indigo-700 transition-colors">Re-enter Fullscreen</button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white shadow-sm z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-900 truncate max-w-xs">{exam.subject}</h1>
          
          <div className="flex items-center gap-6">
            <div className="flex flex-col items-end">
              <span className="text-xs text-gray-500 uppercase font-semibold">Time Remaining</span>
              <span className={`text-xl font-mono font-bold ${timeLeft !== null && timeLeft < 300 ? 'text-red-600 animate-pulse' : 'text-gray-800'}`}>
                {formatTime(timeLeft)}
              </span>
            </div>
            <button 
                onClick={() => submitExam(false)}
                disabled={isSubmitting}
                className={`bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded font-medium text-sm ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                {isSubmitting ? 'Submitting...' : 'Submit Exam'}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-grow flex max-w-7xl mx-auto w-full p-4 gap-4 h-[calc(100vh-4rem)]">
        {/* Left: Question Area */}
        <div className="flex-grow flex flex-col gap-4">
          {broadcasts.length > 0 && (
            <div className="space-y-2">
              {broadcasts.map(msg => (
                <div key={msg.id} className="bg-indigo-50 border-l-4 border-indigo-500 p-3 text-sm text-indigo-800 animate-pulse flex justify-between items-center">
                  <span><strong>Invigilator:</strong> {msg.text}</span>
                  <button onClick={() => setBroadcasts(prev => prev.filter(m => m.id !== msg.id))} className="font-bold">&times;</button>
                </div>
              ))}
            </div>
          )}

          {(() => {
            const q = exam.questions[currentQuestionIndex];
            const qId = q._id || (typeof q.questionID === 'object' ? q.questionID._id : q.questionID) || currentQuestionIndex;
            return (
              <div key={qId} className="bg-white rounded-lg shadow-lg p-8 border border-gray-200 flex flex-col h-full overflow-hidden">
                <div className="flex justify-between items-center mb-6 pb-4 border-b">
                  <h3 className="text-xl font-bold text-gray-800">
                    Question {currentQuestionIndex + 1} of {exam.questions.length}
                  </h3>
                  <span className="bg-indigo-100 text-indigo-700 px-4 py-1.5 rounded-full text-sm font-black">
                    {q.marks || q.maxMarks} Marks
                  </span>
                </div>
                
                <div className="flex-grow overflow-y-auto mb-6">
                  <p className="text-lg text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {q.questionID?.text || q.question || 'Question text not available'}
                  </p>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-bold text-gray-500 uppercase mb-2 tracking-wider">Your Answer</label>
                  <textarea
                    className="w-full h-64 p-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none text-gray-800 text-lg transition-all"
                    placeholder="Type your detailed answer here..."
                    value={answers[qId] || ''}
                    onChange={(e) => handleAnswerChange(qId, e.target.value)}
                  />
                </div>

                <div className="flex justify-between items-center pt-6 border-t">
                  <div className="flex gap-3">
                    <button 
                      onClick={() => {
                        if (currentQuestionIndex > 0) setCurrentQuestionIndex(prev => prev - 1);
                      }}
                      disabled={currentQuestionIndex === 0}
                      className="px-6 py-2.5 rounded-lg font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 transition-colors"
                    >
                      Previous
                    </button>
                    <button 
                      onClick={() => {
                        if (currentQuestionIndex < exam.questions.length - 1) setCurrentQuestionIndex(prev => prev + 1);
                      }}
                      disabled={currentQuestionIndex === exam.questions.length - 1}
                      className="px-6 py-2.5 rounded-lg font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 transition-colors"
                    >
                      Next
                    </button>
                  </div>
                  
                  <div className="flex gap-3">
                    <button 
                      onClick={handleMarkForReview}
                      className="px-6 py-2.5 rounded-lg font-bold text-violet-700 bg-violet-50 border-2 border-violet-100 hover:bg-violet-100 transition-colors"
                    >
                      Mark for Review
                    </button>
                    <button 
                      onClick={handleSaveAndNext}
                      className="px-8 py-2.5 rounded-lg font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all active:scale-95"
                    >
                      Save & Next
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Right: Sidebar (Webcam + Palette) */}
        <div className="w-80 flex flex-col gap-4 flex-shrink-0">
          {/* Webcam */}
          <div className="bg-black rounded-lg overflow-hidden shadow-lg aspect-video relative group">
            <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover transform scale-x-[-1]"></video>
            <div className="absolute bottom-2 left-2 text-white text-xs bg-black bg-opacity-50 px-2 py-1 rounded">
              Live Proctoring
            </div>
          </div>

          {/* Question Palette */}
          <div className="bg-white rounded-xl shadow-lg flex-grow flex flex-col overflow-hidden border border-gray-200">
            <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
              <h4 className="font-black text-gray-700 uppercase text-xs tracking-widest">Question Palette</h4>
              <span className="text-[10px] font-bold bg-gray-200 px-2 py-0.5 rounded text-gray-600">
                {Object.values(questionStatus).filter(s => s === 'answered').length}/{exam.questions.length}
              </span>
            </div>
            
            <div className="p-4 overflow-y-auto flex-grow">
              <div className="grid grid-cols-5 gap-2">
                {exam.questions.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentQuestionIndex(idx)}
                    className={`h-10 w-10 rounded-lg flex items-center justify-center text-sm font-black border-b-4 transition-all active:scale-90 ${
                      currentQuestionIndex === idx ? 'ring-2 ring-offset-2 ring-indigo-500 scale-105' : ''
                    } ${getStatusColor(idx)}`}
                  >
                    {idx + 1}
                  </button>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div className="p-4 border-t bg-gray-50 space-y-2">
              <div className="flex items-center gap-3 text-[10px] font-bold uppercase text-gray-500">
                <div className="w-3 h-3 bg-green-600 rounded-sm"></div>
                <span>Answered</span>
              </div>
              <div className="flex items-center gap-3 text-[10px] font-bold uppercase text-gray-500">
                <div className="w-3 h-3 bg-violet-600 rounded-sm"></div>
                <span>Marked for Review</span>
              </div>
              <div className="flex items-center gap-3 text-[10px] font-bold uppercase text-gray-500">
                <div className="w-3 h-3 bg-orange-500 rounded-sm"></div>
                <span>Not Answered</span>
              </div>
              <div className="flex items-center gap-3 text-[10px] font-bold uppercase text-gray-500">
                <div className="w-3 h-3 bg-gray-200 rounded-sm"></div>
                <span>Not Visited</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ExamTaking;
