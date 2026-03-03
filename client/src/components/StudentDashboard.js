import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';

const StudentDashboard = () => {
  const [exams, setExams] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchCode, setSearchCode] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [joiningExam, setJoiningExam] = useState(null);
  const [joinPassword, setJoinPassword] = useState('');
  const [joinError, setJoinError] = useState('');
  const [selectedResult, setSelectedResult] = useState(null);
  const [selectedExamDetails, setSelectedExamDetails] = useState(null);
  const navigate = useNavigate();
  const { user } = useAuth();
  const socket = useSocket();

  const fetchExams = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const [examsRes, resultsRes] = await Promise.all([
        api.get('/exams'),
        api.get('/exams/my-results')
      ]);
      setExams(examsRes.data);
      setResults(resultsRes.data);
    } catch (err) {
      console.error('Error fetching exams:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExams(true);

    if (socket) {
      socket.on('exams:list-updated', fetchExams);
      socket.on('results:updated', fetchExams);
      socket.on('admin:exam-updated', fetchExams);

      return () => {
        socket.off('exams:list-updated', fetchExams);
        socket.off('results:updated', fetchExams);
        socket.off('admin:exam-updated', fetchExams);
      };
    }
  }, [socket, fetchExams]);

  useEffect(() => {
    if (joiningExam) {
      setJoinError('');
      setJoinPassword('');
    }
  }, [joiningExam]);

  // Update current time every second to keep classifications accurate and real-time
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getExamEndTime = (exam) => {
    if (exam.endTime) return new Date(exam.endTime);
    if (exam.startTime && exam.durationMinutes) {
      return new Date(new Date(exam.startTime).getTime() + exam.durationMinutes * 60000);
    }
    return null;
  };

  const getExamStatusInfo = (exam, hasSubmitted) => {
    const now = currentTime;
    const start = new Date(exam.startTime);
    const end = getExamEndTime(exam);

    if (hasSubmitted) return { label: 'SUBMITTED', className: 'bg-green-50 text-green-700 border-green-100' };
    if (exam.status === 'closed') return { label: 'CLOSED', className: 'bg-red-50 text-red-700 border-red-100' };
    if (start && now < start) return { label: 'UPCOMING', className: 'bg-blue-50 text-blue-700 border-blue-100' };
    if (end && now >= end) return { label: 'COMPLETED', className: 'bg-gray-50 text-gray-600 border-gray-100' };
    return { label: 'ACTIVE', className: 'bg-indigo-50 text-indigo-700 border-indigo-100' };
  };

  // Classification Logic
  const submissionMap = new Map(results.map(r => [String(r.examId?._id || r.examId), r]));

  // Get IDs of exams already in the 'exams' list to avoid duplicates when merging with results
  const examIdsInList = new Set(exams.map(e => e._id.toString()));

  // Create virtual exam objects for results that aren't in the available exams list (e.g. archived/closed)
  const resultsAsExams = results
    .filter(r => r.examId && !examIdsInList.has(String(r.examId._id || r.examId)))
    .map(r => ({
      ...(r.examId || {}),
      _id: r.examId?._id || r.examId,
      subject: r.examId?.subject || r.subject || 'Completed Exam',
      status: 'closed',
      hasSubmitted: true,
      isEvaluated: r.isEvaluated || false
    }));

  const allExamsForClassification = [...exams, ...resultsAsExams];

  const activeExams = allExamsForClassification.filter(exam => {
    if (submissionMap.has(String(exam._id))) return false;
    const start = exam.startTime ? new Date(exam.startTime) : null;
    const end = getExamEndTime(exam);
    if (exam.status === 'closed') return false;
    if (!start || isNaN(start.getTime())) return exam.status === 'open';
    return start <= currentTime && (!end || isNaN(end.getTime()) || end > currentTime);
  }).map(exam => ({ ...exam, hasSubmitted: false, isEvaluated: false }));

  const upcomingExams = allExamsForClassification.filter(exam => {
    if (submissionMap.has(exam._id.toString())) return false;
    const start = exam.startTime ? new Date(exam.startTime) : null;
    return start && start > currentTime && exam.status !== 'closed';
  }).map(exam => ({ ...exam, hasSubmitted: false, isEvaluated: false }));

  const completedExams = allExamsForClassification.filter(exam => {
    const hasSubmitted = submissionMap.has(exam._id.toString());
    if (hasSubmitted) return true;
    if (exam.status === 'closed') return true;
    const end = getExamEndTime(exam);
    return end && !isNaN(end.getTime()) && end <= currentTime;
  }).sort((a, b) => {
    const subA = submissionMap.get(a._id.toString());
    const subB = submissionMap.get(b._id.toString());
    
    const timeA = subA ? new Date(subA.submittedAt || subA.createdAt) : (getExamEndTime(a) || new Date(0));
    const timeB = subB ? new Date(subB.submittedAt || subB.createdAt) : (getExamEndTime(b) || new Date(0));
    return (timeB?.getTime() || 0) - (timeA?.getTime() || 0);
  }).map(exam => {
    const result = submissionMap.get(exam._id.toString());
    return { 
      ...exam, 
      hasSubmitted: !!result,
      isEvaluated: result?.isEvaluated || false
    };
  });

  // Search Logic
  const searchedExams = searchCode.trim() 
    ? allExamsForClassification.filter(e => {
        const code = (e.examCode || e.code || e.subjectCode || e.exam_code || '').toUpperCase();
        const subject = (e.subject || '').toUpperCase();
        const query = searchCode.toUpperCase();
        return code.includes(query) || subject.includes(query);
      })
    : [];

  const handleJoinExam = async (examId, password) => {
    try {
      setJoinError('');
      const { data } = await api.post('/exams/access', { 
        examId,
        password
      });
      setJoiningExam(null);
      setJoinPassword('');
      setJoinError('');
      navigate(`/exam/${data._id}`);
    } catch (err) {
      // Specifically handle 400 to prevent global logout interceptors from triggering
      if (err.response?.status === 400) {
        setJoinError(err.response.data.message || 'Incorrect exam password.');
      } else {
        setJoinError(err.response?.data?.message || 'Failed to join exam.');
      }
    }
  };

  const handleViewResult = async (examId) => {
    try {
      const { data } = await api.get(`/exams/${examId}/result`);
      setSelectedResult(data);
    } catch (err) {
      const result = submissionMap.get(String(examId));
      if (result) setSelectedResult(result);
      else alert('Failed to load result details.');
    }
  };

  const scrollToCompleted = () => {
    const section = document.getElementById('completed-exams-section');
    if (section) section.scrollIntoView({ behavior: 'smooth' });
  };

  if (loading) return <div className="p-8 text-center">Loading Dashboard...</div>;

  return (
    <div className="max-w-7xl mx-auto py-10 px-4 sm:px-6 lg:px-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Welcome, {user?.name || 'Student'}</h1>
          <button onClick={() => fetchExams(true)} className="text-xs text-indigo-600 font-bold hover:underline mt-1">Refresh Dashboard</button>
        </div>
        <div className="flex items-center space-x-2">
          {showSearch ? (
            <div className="flex items-center bg-white border rounded-md shadow-sm overflow-hidden">
              <input 
                type="text"
                placeholder="Enter Exam ID/NAME"
                className="px-4 py-2 outline-none text-sm w-40 uppercase"
                value={searchCode}
                onChange={(e) => setSearchCode(e.target.value)}
                autoFocus
              />
              <button 
                onClick={() => { setShowSearch(false); setSearchCode(''); }}
                className="bg-gray-100 px-3 py-2 text-gray-500 hover:text-gray-700"
                type="button"
              >
                &times;
              </button>
            </div>
          ) : (
            <button 
              onClick={() => setShowSearch(true)}
              type="button"
              className="bg-indigo-600 text-white px-6 py-2 rounded-md font-semibold hover:bg-indigo-700 transition-colors shadow-md"
            >
              Search Exams
            </button>
          )}
        </div>
      </div>

      <div className="space-y-12">
        {/* Search Results Section */}
        {searchedExams.length > 0 && (
          <section className="bg-indigo-50 p-6 rounded-xl border-2 border-indigo-200">
            <h2 className="text-xl font-bold text-indigo-900 mb-4 flex items-center">
              <span className="mr-2">🔍</span> Search Results for: "{searchCode}"
            </h2>
            <div className="flex overflow-x-auto pb-6 gap-6 snap-x">
              {searchedExams.map(exam => {
                const result = submissionMap.get(exam._id.toString());
                return (
                  <ExamCard 
                    key={exam._id} 
                    exam={exam} 
                    hasSubmitted={!!result} 
                    isEvaluated={result?.isEvaluated || false}
                    navigate={navigate} 
                    getExamStatusInfo={getExamStatusInfo} 
                    getExamEndTime={getExamEndTime} 
                    onJoin={setJoiningExam}
                    onViewResult={handleViewResult}
                    onShowDetails={setSelectedExamDetails}
                  />
                );
              })}
            </div>
          </section>
        )}

        {/* Active Exams */}
        <section>
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
            <span className="w-3 h-3 bg-green-500 rounded-full mr-2 animate-pulse"></span>
            Active Exams (Ongoing) ({activeExams.length})
          </h2>
          {activeExams.length > 0 ? (
            <div className="flex overflow-x-auto pb-6 gap-6 snap-x">
              {activeExams.map(exam => (
                <ExamCard 
                  key={exam._id} 
                  exam={exam} 
                  hasSubmitted={exam.hasSubmitted} 
                  isEvaluated={exam.isEvaluated} 
                  navigate={navigate} 
                  getExamStatusInfo={getExamStatusInfo} 
                  getExamEndTime={getExamEndTime} 
                  onJoin={setJoiningExam}
                  onViewResult={handleViewResult}
                  onShowDetails={setSelectedExamDetails}
                />
              ))}
            </div>
          ) : (
            <div className="bg-white shadow rounded-xl p-8 text-center text-gray-400 border-2 border-dashed border-gray-200">No exams are currently active.</div>
          )}
        </section>

        {/* Upcoming Exams */}
        <section>
          <h2 className="text-xl font-bold text-gray-800 mb-4">Upcoming Exams ({upcomingExams.length})</h2>
          {upcomingExams.length > 0 ? (
            <div className="flex overflow-x-auto pb-6 gap-6 snap-x">
              {upcomingExams.map(exam => (
                <ExamCard 
                  key={exam._id} 
                  exam={exam} 
                  hasSubmitted={exam.hasSubmitted} 
                  isEvaluated={exam.isEvaluated} 
                  navigate={navigate} 
                  getExamStatusInfo={getExamStatusInfo} 
                  getExamEndTime={getExamEndTime} 
                  onJoin={setJoiningExam}
                  onViewResult={handleViewResult}
                  onShowDetails={setSelectedExamDetails}
                />
              ))}
            </div>
          ) : (
            <div className="bg-white shadow rounded-xl p-8 text-center text-gray-400 border-2 border-dashed border-gray-200">No upcoming exams scheduled.</div>
          )}
        </section>

        {/* Completed Exams */}
        <section id="completed-exams-section">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Completed Exams ({completedExams.length})</h2>
          {completedExams.length > 0 ? (
            <div className="flex overflow-x-auto pb-6 gap-6 snap-x">
              {completedExams.map(exam => (
                <ExamCard 
                  key={exam._id} 
                  exam={exam} 
                  isCompleted={true} 
                  hasSubmitted={exam.hasSubmitted} 
                  isEvaluated={exam.isEvaluated} 
                  navigate={navigate} 
                  getExamStatusInfo={getExamStatusInfo} 
                  getExamEndTime={getExamEndTime} 
                  onJoin={setJoiningExam}
                  onViewResult={handleViewResult}
                  onShowDetails={setSelectedExamDetails}
                />
              ))}
            </div>
          ) : (
            <div className="bg-white shadow rounded-xl p-8 text-center text-gray-400 border-2 border-dashed border-gray-200">No completed exams found.</div>
          )}
        </section>

        <section className="col-span-full mt-10">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button 
              onClick={scrollToCompleted}
              type="button"
              className="p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow flex items-center space-x-4 border border-gray-100"
            >
              <span className="text-2xl">📊</span>
              <div className="text-left">
                <p className="font-bold text-gray-900">View Results</p>
                <p className="text-xs text-gray-500">Check your performance in past exams</p>
              </div>
            </button>
          </div>
        </section>
      </div>

      {/* Detailed Result Modal */}
      {selectedResult && (
        <ResultDetailModal 
          result={selectedResult} 
          onClose={() => setSelectedResult(null)} 
        />
      )}

      {/* Exam Detail Modal */}
      {selectedExamDetails && (
        <ExamDetailModal 
          exam={selectedExamDetails} 
          onClose={() => setSelectedExamDetails(null)} 
          getExamEndTime={getExamEndTime}
        />
      )}

      {/* Join Exam Password Modal */}
      {joiningExam && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-fadeIn">
            <div className="bg-indigo-700 p-6 text-white">
              <h2 className="text-2xl font-black">Join Exam</h2>
              <p className="text-indigo-100 text-sm">Please enter the exam password to proceed.</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-2">
                <p className="text-sm text-gray-600"><strong>Subject:</strong> {joiningExam.subject}</p>
                <p className="text-sm text-gray-600"><strong>Exam Code:</strong> {joiningExam.examCode || joiningExam.code || joiningExam.subjectCode || joiningExam.exam_code}</p>
              </div>
              <div>
                <label className="block text-xs font-black text-gray-400 uppercase mb-1 tracking-widest">Exam Password</label>
                <input 
                  type="password"
                  placeholder="Enter Password"
                  className="w-full p-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                  value={joinPassword}
                  onChange={(e) => setJoinPassword(e.target.value)}
                  autoFocus
                />
              </div>
              {joinError && <p className="text-red-500 text-xs font-bold text-center">{joinError}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setJoiningExam(null); setJoinPassword(''); setJoinError(''); }} className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-colors">Cancel</button>
                <button onClick={() => handleJoinExam(joiningExam._id, joinPassword)} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all active:scale-95">Verify & Join</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ResultDetailModal = ({ result, onClose }) => {
  const passMarks = result.examId?.passMarks || 40;
  const isPassed = result.totalScore >= passMarks;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-fadeIn">
        <div className="bg-indigo-700 p-6 text-white flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-black">{result.examId?.subject || result.subject} - Results</h2>
            <p className="text-indigo-100 text-sm">Submitted on {new Date(result.submittedAt || result.createdAt).toLocaleString()}</p>
          </div>
          <button onClick={onClose} className="text-3xl font-bold hover:text-indigo-200 transition-colors">&times;</button>
        </div>
        
        <div className="p-6 bg-indigo-50 border-b flex justify-around items-center">
          <div className="text-center">
            <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Total Score</p>
            <div className="flex items-center justify-center gap-3">
              <p className="text-3xl font-black text-indigo-700">{result.totalScore} / {result.examId?.maxMarks || 'N/A'}</p>
              {result.isEvaluated && (
                <span className={`px-3 py-1 rounded-full text-[10px] font-black border ${
                  isPassed 
                    ? 'bg-green-100 text-green-700 border-green-200' 
                    : 'bg-red-100 text-red-700 border-red-200'
                }`}>
                  {isPassed ? 'PASS' : 'FAIL'}
                </span>
              )}
            </div>
          </div>
          <div className="text-center">
            <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Status</p>
            <p className={`text-lg font-bold ${result.isEvaluated ? 'text-green-600' : 'text-orange-500'}`}>
              {result.isEvaluated ? 'Evaluated by AI (Llama 3)' : 'Evaluation Pending'}
            </p>
          </div>
        </div>

        <div className="flex-grow overflow-y-auto p-6 space-y-8 bg-gray-50">
          {result.answers.map((ans, idx) => (
            <div key={idx} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <div className="bg-gray-50 p-4 border-b flex justify-between items-center">
                <h4 className="font-bold text-gray-700">Question {idx + 1}</h4>
                <span className="bg-white px-3 py-1 rounded-full border text-sm font-bold text-indigo-600">
                  Marks: {ans.marksObtained} / {ans.maxMarks}
                </span>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <p className="text-xs font-black text-gray-400 uppercase mb-1">Question</p>
                  <p className="text-gray-800 font-medium">{ans.questionText}</p>
                </div>
                <div className="bg-indigo-50/30 p-4 rounded-lg border border-indigo-100">
                  <p className="text-xs font-black text-indigo-400 uppercase mb-1">Your Answer</p>
                  <p className="text-gray-700 whitespace-pre-wrap">{ans.answer}</p>
                </div>
                {ans.feedback && (
                  <div className="bg-green-50 p-4 rounded-lg border border-green-100">
                    <p className="text-xs font-black text-green-500 uppercase mb-1">AI Feedback</p>
                    <p className="text-gray-700 italic">"{ans.feedback}"</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        
        <div className="p-4 bg-white border-t flex justify-end">
          <button 
            onClick={onClose}
            className="px-8 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
          >
            Close Results
          </button>
        </div>
      </div>
    </div>
  );
};

const ExamDetailModal = ({ exam, onClose, getExamEndTime }) => {
  const endTime = getExamEndTime(exam);
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-fadeIn">
        <div className="bg-indigo-700 p-6 text-white">
          <h2 className="text-2xl font-black">Exam Details</h2>
          <p className="text-indigo-100 text-sm">{exam.subject}</p>
        </div>
        <div className="p-6 space-y-4">
          <div className="space-y-3 bg-gray-50 p-4 rounded-xl border border-gray-200">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Exam Code:</span>
              <span className="font-mono font-bold text-indigo-800">{exam.examCode || exam.code || exam.subjectCode || 'N/A'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Duration:</span>
              <span className="font-bold text-gray-700">{exam.durationMinutes} mins</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Max Marks:</span>
              <span className="font-bold text-gray-700">{exam.maxMarks}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Pass Marks:</span>
              <span className="font-bold text-gray-700">{exam.passMarks ?? 'N/A'}</span>
            </div>
            <div className="pt-2 border-t border-gray-200 space-y-1">
              <p className="text-xs text-gray-500 flex justify-between">
                <span className="font-semibold">Start Time:</span> 
                <span>{new Date(exam.startTime).toLocaleString()}</span>
              </p>
              <p className="text-xs text-gray-500 flex justify-between">
                <span className="font-semibold">End Time:</span> 
                <span>{endTime ? endTime.toLocaleString() : 'N/A'}</span>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all active:scale-95">Close</button>
        </div>
      </div>
    </div>
  );
};

const ExamCard = ({ exam, isCompleted, hasSubmitted, isEvaluated, navigate, getExamStatusInfo, getExamEndTime, onJoin, onViewResult, onShowDetails }) => {
  const statusInfo = getExamStatusInfo(exam, hasSubmitted);
  return (
  <div 
    className={`min-w-[320px] max-w-[320px] bg-white shadow-md rounded-xl border border-gray-200 p-6 flex flex-col justify-between hover:shadow-xl transition-all duration-300 snap-start ${(isCompleted || statusInfo.label === 'COMPLETED' || statusInfo.label === 'CLOSED') && !hasSubmitted ? 'opacity-75 grayscale' : ''}`}
  >
    <div className="flex-grow">
      <div className="flex justify-between items-start mb-3">
        <h4 className="text-lg font-bold text-indigo-700 truncate flex-grow mr-2" title={exam.subject}>
          {exam.subject}
        </h4>
        <div className="flex flex-col items-end gap-1">
          <span className={`px-2 py-1 text-[10px] font-black rounded-md uppercase whitespace-nowrap border ${statusInfo.className}`}>
            {getExamStatusInfo(exam, hasSubmitted).label}
          </span>
          {isEvaluated && (
            <span className="px-2 py-0.5 text-[9px] font-bold bg-green-600 text-white rounded-full shadow-sm">
              Results Released
            </span>
          )}
        </div>
      </div>
      
      <div className="space-y-3 mb-6 bg-gray-50 p-3 rounded-lg border border-gray-100">
        <div className="flex justify-between text-xs">
          <span className="text-gray-400 font-medium">Exam Code:</span>
          <span className="font-mono font-bold text-indigo-800">{exam.examCode || exam.code || exam.subjectCode || exam.exam_code || 'N/A'}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-400 font-medium">Duration:</span>
          <span className="font-bold text-gray-700">{exam.durationMinutes} mins</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-400 font-medium">Total Marks:</span>
          <span className="font-bold text-gray-700">{exam.maxMarks}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-400 font-medium">Pass Marks:</span>
          <span className="font-bold text-gray-700">{exam.passMarks ?? 'N/A'}</span>
        </div>
        <div className="pt-2 border-t border-gray-200 space-y-1">
          <p className="text-[10px] text-gray-500 flex justify-between">
            <span className="font-semibold">{isCompleted ? 'Ended:' : 'Starts:'}</span> 
            <span>{isCompleted ? getExamEndTime(exam)?.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : new Date(exam.startTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
          </p>
        </div>
      </div>
    </div>

    <div className="mt-auto">
      {statusInfo.label === 'SUBMITTED' ? (
        <button 
          type="button"
          onClick={() => onViewResult(exam._id)}
          className="w-full py-2 rounded-lg font-bold transition-colors border bg-indigo-600 text-white hover:bg-indigo-700 border-indigo-600"
        >
          View Result
        </button>
      ) : statusInfo.label === 'ACTIVE' ? (
        <button 
          type="button"
          onClick={() => onJoin(exam)}
          className="w-full py-2 rounded-lg font-bold transition-colors border bg-gray-100 text-indigo-700 hover:bg-indigo-50 border-indigo-100"
        >
          Join Exam
        </button>
      ) : (
        <button 
          type="button"
          onClick={() => onShowDetails(exam)}
          className="w-full py-2 rounded-lg font-bold transition-colors border bg-gray-100 text-indigo-700 hover:bg-indigo-50 border-indigo-100"
        >
          View Details {(!hasSubmitted && (statusInfo.label === 'COMPLETED' || statusInfo.label === 'CLOSED')) && '(Absent)'}
        </button>
      )}
    </div>
  </div>
  );
};

export default StudentDashboard;
