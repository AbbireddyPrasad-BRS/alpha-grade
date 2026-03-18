import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { getMyExams, getExamById } from '../services/api';
import FacultyExamMonitor from './FacultyExamMonitor';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';

const FacultyDashboard = () => {
  const [exams, setExams] = useState([]);
  const [selectedExam, setSelectedExam] = useState(null);
  const [activeSessions, setActiveSessions] = useState([]);
  const [monitoringExam, setMonitoringExam] = useState(null);
  const [reportExam, setReportExam] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const socket = useSocket();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [currentUser, setCurrentUser] = useState(user);
  const [isProfileLoading] = useState(false);

  const fetchProfile = useCallback(async () => {
    // The backend does not have a GET /api/auth/profile endpoint.
    // To eliminate the 404 error in the network tab, we safely bypass 
    // the network request and use the cached user from AuthContext.
    if (user) setCurrentUser(user);
  }, [user]);

  const fetchExams = useCallback(async () => {
    setError('');
    try {
      const response = await getMyExams();
      setExams(response.data);
    } catch (err) {
      const serverMessage = err?.response?.data?.message;
      const status = err?.response?.status;
      const message = serverMessage || (status ? `Request failed (${status})` : err.message || 'Failed to fetch exams');
      setError(message);
      console.error('Failed to fetch exams:', err.response || err);
    }
  }, []);

  const refreshDashboard = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      await Promise.all([fetchExams(), fetchProfile()]);
    } finally {
      setIsLoading(false);
    }
  }, [fetchExams, fetchProfile]);

  useEffect(() => {
    refreshDashboard();

    const handleUserUpdate = () => {
      // Small delay to ensure DB consistency before re-fetching
      setTimeout(refreshDashboard, 500);
    };

    if (socket) {
      socket.on('exams:list-updated', fetchExams);
      socket.on('users:list-updated', handleUserUpdate);
      return () => {
        socket.off('exams:list-updated', fetchExams);
        socket.off('users:list-updated', handleUserUpdate);
      };
    }
  }, [socket, fetchExams, refreshDashboard]);

  // Sync local currentUser state when AuthContext user changes
  useEffect(() => {
    // Only initialize from context if we don't have local data yet
    if (user && !currentUser) {
      setCurrentUser(user);
    }
  }, [user, currentUser]);

  const getExamEndTime = useCallback((exam) => {
    if (exam.endTime) return new Date(exam.endTime);
    if (exam.startTime && exam.durationMinutes) {
      return new Date(new Date(exam.startTime).getTime() + exam.durationMinutes * 60000);
    }
    return null;
  }, []);

  const activeExams = useMemo(() => exams.filter(exam => {
    const start = exam.startTime ? new Date(exam.startTime) : null;
    const end = getExamEndTime(exam);
    
    // If no start time, assume it's active if not closed (or rely on status)
    if (!start) return true; 
    
    return start <= currentTime && (!end || end > currentTime);
  }), [exams, currentTime, getExamEndTime]);

  const isExamActive = useCallback((exam) => activeExams.some(e => e._id === exam._id), [activeExams]);

  // Poll for active sessions if selected exam is ongoing
  useEffect(() => {
    let interval;
    if (selectedExam && isExamActive(selectedExam)) {
        const fetchSessions = async () => {
          try {
            const { data } = await api.get(`/exams/${selectedExam._id}/sessions`);
            setActiveSessions(data);
          } catch (err) { console.error(err); }
        };
        fetchSessions();
        interval = setInterval(fetchSessions, 5000);
      }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [selectedExam, currentTime, isExamActive]);

  // Clear error after 5 seconds to keep the UI clean
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const viewExamDetails = async (examId) => {
    try {
      const response = await getExamById(examId);
      const data = response.data;
      // Print credentials to terminal (console) as requested
      console.log('--- Exam Details Opened ---');
      console.log('Subject:', data.subject);
      console.log('Exam Code:', data.examCode || data.code || data.subjectCode || 'N/A');
      console.log('Password:', data.password || data.examPassword || 'N/A');
      setSelectedExam(response.data);
    } catch (err) {
      console.error('Failed to fetch exam details', err.response || err);
      const serverMessage = err?.response?.data?.message;
      setError(serverMessage || 'Failed to fetch exam details');
    }
  };

  const deleteExam = async (examId) => {
    const isAdmin = currentUser && currentUser.role === 'Admin';

    // 1. Check Global Permission (Skip for Admin)
    if (!isAdmin && currentUser && !currentUser.canDeleteExam) {
      setError('delete permission disabled contact admin');
      return;
    }

    // 2. Check Exam-Level Lock (Skip for Admin)
    const examToDelete = exams.find(e => e._id === examId);
    if (!isAdmin && examToDelete && !examToDelete.allowDeletion) {
      setError('This exam is locked for deletion. Contact admin to unlock.');
      return;
    }

    if (window.confirm('Are you sure you want to delete this exam?')) {
      try {
        await api.delete(`/exams/${examId}`);
        if (socket) socket.emit('admin:exam-updated');
        fetchExams(); // Refresh the list after deleting
      } catch (err) {
        const serverMessage = err?.response?.data?.message;
        setError(serverMessage || 'Failed to delete the exam.');
        console.error('Failed to delete exam', err.response || err);
      }
    }
  };

  const evaluateExam = async (examId) => {
    if (currentUser && !currentUser.canEvaluate) {
      setError('Evaluation permission disabled. Contact admin.');
      return;
    }

    if (!window.confirm('Start AI evaluation for this exam? This process uses Llama 3 to grade student answers. It may take some time.')) return;
    
    try {
      setIsLoading(true);
      // Increase timeout for the frontend request as evaluation is slow
      const response = await api.post(`/exams/${examId}/evaluate`, {}, { timeout: 120000 });
      alert(response.data.message);
      fetchExams(); // Refresh to update status
    } catch (err) {
      console.error('Evaluation failed', err);
      const msg = err.response?.data?.message || (err.code === 'ECONNABORTED' ? 'Evaluation is taking longer than expected, but is running in the background.' : 'Failed to start evaluation. Ensure Llama 3 is running.');
      setError(msg);
      // Even if it times out on frontend, refresh list after a delay to see if updates happened
      setTimeout(fetchExams, 5000);
    } finally {
      setIsLoading(false);
    }
  };

  // Update current time every second to handle auto-transition
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Categorize exams
  const upcomingExams = exams.filter(exam => {
    if (!exam.startTime) return false;
    return new Date(exam.startTime) > currentTime;
  });

  const completedExams = exams.filter(exam => {
    const end = getExamEndTime(exam);
    if (!end) return false;
    return end <= currentTime;
  }).sort((a, b) => getExamEndTime(b) - getExamEndTime(a));

  // Helper to determine status for the modal
  const isExamCompleted = (exam) => completedExams.some(e => e._id === exam._id);

  // Helper to determine exam status for display
  const getExamStatusInfo = (exam) => {
    const now = currentTime;
    const start = exam.startTime ? new Date(exam.startTime) : null;
    const end = getExamEndTime(exam);

    if (exam.status === 'closed') return { label: 'CLOSED', className: 'bg-red-50 text-red-700 border-red-100' };
    if (start && now < start) return { label: 'UPCOMING', className: 'bg-blue-50 text-blue-700 border-blue-100' };
    if (end && now >= end) return { label: 'COMPLETED', className: 'bg-gray-50 text-gray-600 border-gray-100' };
    if (exam.status === 'open' || (start && now >= start && (!end || now < end))) {
      return { label: 'ACTIVE', className: 'bg-indigo-50 text-indigo-700 border-indigo-100' };
    }
    return { label: exam.status.toUpperCase(), className: 'bg-yellow-50 text-yellow-700 border-yellow-100' };
  };

  const renderExamList = (examList, title) => (
    <div className="mb-8">
      <h3 className="text-xl font-semibold text-gray-800 mb-3">{title} ({examList.length})</h3>
      {examList.length > 0 ? (
        <div className="flex overflow-x-auto pb-6 gap-6 snap-x">
          {examList.map((exam) => (
            <div 
              key={exam._id} 
              className="min-w-[320px] max-w-[320px] bg-white shadow-md rounded-xl border border-gray-200 p-6 flex flex-col justify-between hover:shadow-xl transition-all duration-300 snap-start"
            >
              <div>
                <div className="flex justify-between items-start mb-3">
                  <h4 className="text-lg font-bold text-indigo-700 truncate flex-grow mr-2" title={exam.subject}>
                    {exam.subject}
                  </h4>
                  <span className={`px-2 py-1 text-[10px] font-black rounded-md uppercase whitespace-nowrap border ${getExamStatusInfo(exam).className}`}>
                    {getExamStatusInfo(exam).label}
                  </span>
                  {!exam.allowDeletion && (
                    <span className="ml-1 px-2 py-1 text-[10px] font-black rounded-md uppercase bg-gray-100 text-gray-400 border-gray-200" title="Deletion Locked by Admin">
                      Locked
                    </span>
                  )}
                </div>
                
                <div className="flex gap-2 mb-4">
                  {exam.isCreatedByAdmin && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-800 border border-orange-200">Assigned by Admin</span>
                  )}
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-600 border border-gray-200">{exam.questions.length} Questions</span>
                </div>

                <div className="space-y-3 mb-6 bg-gray-50 p-3 rounded-lg border border-gray-100">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400 font-medium">Exam Code:</span>
                    <span className="font-mono font-bold text-indigo-800">{exam.examCode || exam.code || exam.subjectCode || exam.exam_code || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400 font-medium">Password:</span>
                    <span className="font-mono text-gray-700">{exam.password || exam.examPassword || exam.exam_password || 'N/A'}</span>
                  </div>
                  <div className="pt-2 border-t border-gray-200 space-y-1">
                    <p className="text-[10px] text-gray-500 flex justify-between">
                      <span className="font-semibold">Start:</span> 
                      <span>{exam.startTime ? new Date(exam.startTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'N/A'}</span>
                    </p>
                    <p className="text-[10px] text-gray-500 flex justify-between">
                      <span className="font-semibold">End:</span> 
                      <span>{getExamEndTime(exam) ? getExamEndTime(exam).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'N/A'}</span>
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-auto">
                <button
                  onClick={() => viewExamDetails(exam._id)}
                  className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 text-xs rounded-lg hover:bg-gray-200 font-bold transition-colors"
                >
                  View
                </button>
                {title === 'Completed Exams' ? (
                  <>
                    <button
                      onClick={() => navigate(`/faculty/exam/${exam._id}/results`)}
                      className="flex-1 px-3 py-2 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 font-bold transition-colors"
                    >
                      Results
                    </button>
                    <button
                      onClick={() => evaluateExam(exam._id)}
                      className="flex-1 px-3 py-2 bg-purple-600 text-white text-xs rounded-lg hover:bg-purple-700 font-bold transition-colors"
                    >
                      Evaluate
                    </button>
                  </>
                ) : title === 'Upcoming Exams' ? (
                  <button
                    onClick={() => navigate(`/faculty/edit-exam/${exam._id}`)}
                    className="flex-1 px-3 py-2 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700 font-bold transition-colors"
                  >
                    Edit
                  </button>
                ) : (
                  <button
                    onClick={() => setMonitoringExam(exam._id)}
                    className="flex-1 px-3 py-2 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 font-bold transition-colors"
                  >
                    Monitor
                  </button>
                )}
                <button
                  onClick={() => deleteExam(exam._id)}
                  className="px-3 py-2 bg-red-50 text-red-600 text-xs rounded-lg hover:bg-red-100 font-bold transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white shadow rounded-xl p-8 text-center text-gray-400 border-2 border-dashed border-gray-200">
          No exams found in this category.
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="py-10">
        <header>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-bold leading-tight text-gray-900">Welcome, {currentUser?.name || 'Faculty'}</h1>
                <p className="text-sm text-gray-500">Role: {currentUser?.role || 'Faculty'}</p>
              </div>
              <button 
                onClick={() => refreshDashboard()} 
                disabled={isLoading}
                className={`flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-lg transition-all shadow-sm border ${isLoading ? 'bg-gray-100 text-gray-400 border-gray-200' : 'bg-white text-indigo-600 border-indigo-100 hover:bg-indigo-50'}`}
              >
                {isLoading && <span className="w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span>}
                Refresh Dashboard
              </button>
            </div>

            {!isProfileLoading && currentUser && !currentUser.canCreateExam && !currentUser.canEvaluate && !currentUser.canDeleteExam && currentUser.role === 'Faculty' && (
              <div className="mt-4 p-4 bg-red-50 border-l-4 border-red-500 text-red-700">
                <p className="font-bold">Permissions Restricted</p>
                <p className="text-sm">Contact admin to have the permissions enabled for your account.</p>
              </div>
            )}

            {currentUser && (
              <div className="mt-2 flex flex-wrap gap-2 items-center">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider mr-1">My Permissions:</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${currentUser.canCreateExam ? 'bg-green-50 text-green-700 border-green-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
                  {currentUser.canCreateExam ? '✓ Create' : '✗ Create'}
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${currentUser.canEvaluate ? 'bg-green-50 text-green-700 border-green-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
                  {currentUser.canEvaluate ? '✓ Evaluate' : '✗ Evaluate'}
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${currentUser.canDeleteExam ? 'bg-green-50 text-green-700 border-green-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
                  {currentUser.canDeleteExam ? '✓ Delete' : '✗ Delete'}
                </span>
                <button onClick={() => refreshDashboard()} className="ml-2 text-[10px] text-indigo-600 hover:underline font-bold uppercase">Refresh Permissions</button>
              </div>
            )}
          </div>
        </header>
        <main>
          <div className="max-w-7xl mx-auto sm:px-6 lg:px-8">
            <div className="px-4 py-8 sm:px-0">
              {error && <p className="text-red-500 text-center mb-4">{error}</p>}
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-semibold text-gray-900">All Exams</h2>
                {currentUser?.canCreateExam ? (
                  <Link
                    to="/faculty/create-exam"
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded"
                  >
                    Create New Exam
                  </Link>
                ) : (
                  <button 
                    onClick={() => setError('Create permission disabled. Contact admin.')}
                    className="bg-gray-400 text-white font-bold py-2 px-4 rounded cursor-not-allowed"
                  >
                    Create New Exam
                  </button>
                )}
              </div>

              {/* Exam Details Modal */}
              {selectedExam && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                  <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-3xl shadow-lg rounded-md bg-white">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-2xl font-bold">{selectedExam.subject}</h3>
                      <button onClick={() => setSelectedExam(null)} className="text-gray-400 hover:text-gray-600 text-2xl">
                        &times;
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 mb-6">
                      <p><strong>Max Marks:</strong> {selectedExam.maxMarks}</p>
                      <p><strong>Pass Marks:</strong> {selectedExam.passMarks}</p>
                      <p><strong>Duration:</strong> {selectedExam.durationMinutes} mins</p>
                      <p><strong>Evaluation:</strong> {selectedExam.evaluationMode}</p>
                      <p><strong>Method:</strong> {selectedExam.creationMethod}</p>
                      <p><strong>Questions:</strong> {selectedExam.questions.length}</p>
                      <p><strong>Exam Code:</strong> <span className="font-mono font-bold text-indigo-600">{selectedExam.examCode || selectedExam.code || selectedExam.subjectCode || selectedExam.exam_code || 'N/A'}</span></p>
                      <p><strong>Exam Password:</strong> <span className="font-mono font-bold text-gray-700">{selectedExam.password || selectedExam.examPassword || selectedExam.exam_password || 'N/A'}</span></p>
                    </div>

                    {/* Active Exam: Live Students View */}
                    {isExamActive(selectedExam) && (
                      <div className="mb-6">
                        <h4 className="text-lg font-semibold mb-3 text-green-700 flex items-center">
                          <span className="w-3 h-3 bg-green-500 rounded-full mr-2 animate-pulse"></span>
                          Live Active Students ({activeSessions.length})
                        </h4>
                        <div className="max-h-60 overflow-y-auto border rounded-lg p-4 bg-green-50">
                          {activeSessions.length > 0 ? (
                            <ul className="divide-y divide-green-200">
                              {activeSessions.map((session) => (
                                <li key={session._id} className="py-2 flex justify-between">
                                  <span className="font-medium">{session.studentID?.name}</span>
                                  <span className="text-sm text-gray-600">{session.studentID?.email}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-gray-500 italic">No students currently active.</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Completed Exam: Attended Students View */}
                    {isExamCompleted(selectedExam) && (
                      <div className="mb-6">
                        <h4 className="text-lg font-semibold mb-3 text-blue-700">
                          Attended Students ({selectedExam.submissions ? selectedExam.submissions.length : 0})
                        </h4>
                        <div className="max-h-60 overflow-y-auto border rounded-lg p-4 bg-blue-50">
                          {selectedExam.submissions && selectedExam.submissions.length > 0 ? (
                            <table className="min-w-full divide-y divide-blue-200">
                              <thead className="bg-blue-100">
                                <tr>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Submitted At</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-blue-100">
                                {selectedExam.submissions.map((sub, idx) => (
                                  <tr key={idx}>
                                    <td className="px-4 py-2 text-sm font-medium text-gray-900">{sub.studentId?.name || 'Unknown'}</td>
                                    <td className="px-4 py-2 text-sm text-gray-500">{sub.studentId?.email || 'N/A'}</td>
                                      <td className="px-4 py-2 text-sm text-gray-500">{sub.submittedAt ? new Date(sub.submittedAt).toLocaleString() : 'N/A'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <p className="text-gray-500 italic">No submissions found.</p>
                          )}
                        </div>
                      </div>
                    )}

                    <h4 className="text-lg font-semibold mb-3">Questions</h4>
                    <div className="max-h-80 overflow-y-auto border rounded-lg p-4 bg-gray-50">
                      {selectedExam.questions.length > 0 ? (
                        <ul className="divide-y divide-gray-200">
                          {selectedExam.questions.map((q, index) => (
                            <li key={q.questionID?._id || index} className="py-3">
                              <p className="font-medium text-gray-800">
                                Q{index + 1}: {q.questionID?.text || 'Question text not available.'}
                              </p>
                              <p className="text-xs text-gray-500 mt-1">
                                Marks: {q.marks}
                              </p>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-gray-500">No questions found for this exam.</p>
                      )}
                    </div>

                    <div className="mt-6 flex justify-end space-x-3">
                      {new Date(selectedExam.startTime) > currentTime && (
                        <Link
                          to={`/faculty/edit-exam/${selectedExam._id}`}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded"
                        >
                          Edit Exam
                        </Link>
                      )}
                      <button
                        onClick={() => setSelectedExam(null)}
                        className="btn-secondary"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Report Modal */}
              {reportExam && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                  <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-3xl shadow-lg rounded-md bg-white">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-2xl font-bold">Exam Report: {reportExam.subject}</h3>
                      <button onClick={() => setReportExam(null)} className="text-gray-400 hover:text-gray-600 text-2xl">
                        &times;
                      </button>
                    </div>
                    
                    <div className="mb-4">
                        <p><strong>Total Submissions:</strong> {reportExam.submissions ? reportExam.submissions.length : 0}</p>
                    </div>

                    <div className="max-h-96 overflow-y-auto border rounded-lg p-4 bg-gray-50">
                      {reportExam.submissions && reportExam.submissions.length > 0 ? (
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-100">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student Name</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Score</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {reportExam.submissions.map((sub, idx) => (
                              <tr key={idx}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                  {sub.studentId?.name || 'Unknown'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  {sub.studentId?.email || 'N/A'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  {sub.score !== undefined ? sub.score : 'Pending'} / {reportExam.maxMarks}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                  {sub.score !== undefined ? (
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${Number(sub.score) >= (reportExam.passMarks || 40) ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                      {Number(sub.score) >= (reportExam.passMarks || 40) ? 'PASS' : 'FAIL'}
                                    </span>
                                  ) : (
                                    <span className="text-gray-400 italic">N/A</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <p className="text-gray-500 text-center">No submissions yet.</p>
                      )}
                    </div>

                    <div className="mt-6 flex justify-end">
                      <button
                        onClick={() => setReportExam(null)}
                        className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {isLoading && <p className="p-6 text-center text-gray-500">Fetching exam details...</p>}
              
              {!isLoading && renderExamList(activeExams, 'Active Exams')}
              {!isLoading && renderExamList(upcomingExams, 'Upcoming Exams')}
              {!isLoading && renderExamList(completedExams, 'Completed Exams')}

            </div>
          </div>
        </main>
      </div>

      {monitoringExam && (
        <FacultyExamMonitor 
          examId={monitoringExam} 
          onClose={() => setMonitoringExam(null)} 
        />
      )}
    </div>
  );
};

export default FacultyDashboard;
