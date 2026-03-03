import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import StudentResults from './StudentResults';
import { getStudentResults, getExams } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

const StudentDashboard = () => {
  const [activeTab, setActiveTab] = useState('exams');
  const [exams, setExams] = useState([]);
  const [results, setResults] = useState([]);
  const [loadingExams, setLoadingExams] = useState(false);
  const [loadingResults, setLoadingResults] = useState(false);
  const [examsError, setExamsError] = useState('');
  const [resultsError, setResultsError] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());
  const { user } = useAuth();
  const navigate = useNavigate();

  const fetchStudentResults = useCallback(async () => {
    setLoadingResults(true);
    setResultsError('');
    try {
      const { data } = await getStudentResults();
      setResults(Array.isArray(data) ? data : []);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to load results.';
      setResultsError(msg);
    } finally {
      setLoadingResults(false);
    }
  }, []);

  const fetchExams = useCallback(async () => {
    setLoadingExams(true);
    setExamsError('');
    try {
      const { data } = await getExams();
      setExams(Array.isArray(data) ? data : []);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to load exams.';
      setExamsError(msg);
    } finally {
      setLoadingExams(false);
    }
  }, []);

  useEffect(() => {
    fetchExams();
    fetchStudentResults();

    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, [fetchExams, fetchStudentResults]);

  const getExamEndTime = (exam) => {
    if (exam.endTime) return new Date(exam.endTime);
    const start = exam.actualStartTime || exam.startTime;
    if (start && exam.durationMinutes) {
      return new Date(new Date(start).getTime() + exam.durationMinutes * 60000);
    }
    return null;
  };

  const submissionMap = new Map(results.map(r => [String(r.examId?._id || r.examId || ""), r]));

  // Get IDs of exams already in the 'exams' list to avoid duplicates
  const examIdsInList = new Set(exams.map(e => e._id.toString()));

  // Create virtual exam objects for results that aren't in the available exams list (e.g. archived/closed)
  const resultsAsExams = results
    .filter(r => r.examId && !examIdsInList.has(String(r.examId._id || r.examId)))
    .map(r => {
      const examData = typeof r.examId === 'object' ? r.examId : {};
      return {
        ...examData,
        _id: r.examId?._id || r.examId,
        subject: r.examId?.subject || r.subject || 'Completed Exam',
        status: r.examId?.status || 'closed',
      };
    });

  const allExamsForClassification = [...exams, ...resultsAsExams];

  const activeExams = allExamsForClassification.filter(exam => {
    const examIdStr = exam._id?.toString() || "";
    if (submissionMap.has(examIdStr)) return false;
    
    if (exam.actualStartTime || exam.status === 'open') {
      const end = getExamEndTime(exam);
      return !end || end > currentTime;
    }

    const start = exam.startTime ? new Date(exam.startTime) : null;
    const end = getExamEndTime(exam);
    if (!start) return false;
    return start <= currentTime && (!end || end > currentTime);
  });

  const upcomingExams = allExamsForClassification.filter(exam => {
    const examIdStr = exam._id?.toString() || "";
    if (submissionMap.has(examIdStr)) return false;
    return exam.startTime && new Date(exam.startTime) > currentTime && exam.status !== 'closed' && exam.status !== 'open';
  });

  const completedExams = allExamsForClassification.filter(exam => {
    const examIdStr = exam._id?.toString() || "";
    if (submissionMap.has(examIdStr)) return true;
    if (exam.status === 'closed') return true;
    const end = getExamEndTime(exam);
    return end && end <= currentTime;
  });

  const getStatusStyles = (status) => {
    switch (status) {
      case 'ACTIVE': return 'bg-indigo-50 text-indigo-700 border-indigo-100';
      case 'UPCOMING': return 'bg-blue-50 text-blue-700 border-blue-100';
      case 'SUBMITTED': return 'bg-green-50 text-green-700 border-green-100';
      case 'COMPLETED': return 'bg-gray-50 text-gray-600 border-gray-100';
      case 'CLOSED': return 'bg-red-50 text-red-700 border-red-100';
      default: return 'bg-gray-50 text-gray-600 border-gray-100';
    }
  };

  const handleJoinExam = (examId) => {
    if (user && (user.canTakeExam === false || user.canTakeExam === 'false')) {
      alert("You have no permission to write the exam, contact faculty member.");
      return;
    }
    navigate(`/exam-lobby/${examId}`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-indigo-700 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <span className="text-xl font-black tracking-tight">AlphaGrade</span>
              <div className="ml-10 flex items-baseline space-x-4">
                <button
                  type="button"
                  onClick={() => setActiveTab('exams')}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                    activeTab === 'exams' ? 'bg-white text-indigo-700 shadow-sm' : 'text-indigo-100 hover:bg-indigo-600'
                  }`}
                >
                  📝 Available Exams
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('results')}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                    activeTab === 'results' ? 'bg-white text-indigo-700 shadow-sm' : 'text-indigo-100 hover:bg-indigo-600'
                  }`}
                >
                  📊 My Results
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="transition-all duration-300">
          {activeTab === 'exams' ? (
            <div className="space-y-10">
              <section>
                <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
                  <span className="w-3 h-3 bg-green-500 rounded-full mr-2 animate-pulse"></span>
                  Active Exams
                </h2>
                {loadingExams ? (
                  <p className="text-gray-500">Loading...</p>
                ) : activeExams.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {activeExams.map(exam => (
                      <ExamCard key={exam._id} exam={exam} status="ACTIVE" styles={getStatusStyles("ACTIVE")} onJoin={handleJoinExam} />
                    ))}
                  </div>
                ) : (
                  <div className="bg-white p-8 rounded-xl border border-dashed border-gray-300 text-center text-gray-500">
                    No active exams at the moment.
                  </div>
                )}
              </section>

              <section>
                <h2 className="text-xl font-bold text-gray-800 mb-4">Upcoming Exams</h2>
                {upcomingExams.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {upcomingExams.map(exam => (
                      <ExamCard key={exam._id} exam={exam} status="UPCOMING" styles={getStatusStyles("UPCOMING")} onJoin={handleJoinExam} />
                    ))}
                  </div>
                ) : (
                  <div className="bg-white p-8 rounded-xl border border-dashed border-gray-300 text-center text-gray-500">
                    No upcoming exams scheduled.
                  </div>
                )}
              </section>

              <section>
                <h2 className="text-xl font-bold text-gray-800 mb-4">Completed / Submitted</h2>
                {completedExams.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {completedExams.map(exam => {
                      const result = submissionMap.get(exam._id?.toString());
                      const isSubmitted = !!result;
                      const status = isSubmitted ? "SUBMITTED" : "COMPLETED";
                      return (
                        <ExamCard 
                          key={exam._id} 
                          exam={exam} 
                          status={status} 
                          styles={getStatusStyles(status)}
                          onJoin={handleJoinExam}
                          result={result}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-white p-8 rounded-xl border border-dashed border-gray-300 text-center text-gray-500">
                    No completed exams found.
                  </div>
                )}
              </section>
            </div>
          ) : (
            <div className="animate-fadeIn">
              <StudentResults 
                results={results}
                loading={loadingResults}
                error={resultsError}
                onRefresh={fetchStudentResults}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

const ExamCard = ({ exam, status, styles, onJoin, result }) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow flex flex-col justify-between">
    <div>
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-lg font-bold text-gray-900 truncate mr-2" title={exam.subject}>{exam.subject}</h3>
        <span className={`px-2 py-1 text-[10px] font-black rounded-md border ${styles}`}>
          {status}
        </span>
      </div>
      <div className="space-y-2 text-sm text-gray-600 mb-6">
        <div className="flex justify-between">
          <span className="text-gray-400">Exam Code:</span>
          <span className="font-medium">{exam.examCode || 'N/A'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Start:</span>
          <span className="font-medium">{exam.startTime ? new Date(exam.startTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'N/A'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Duration:</span>
          <span className="font-medium">{exam.durationMinutes} mins</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Max Marks:</span>
          <span className="font-medium">{exam.maxMarks}</span>
        </div>
      </div>
    </div>
    {status === 'ACTIVE' && (
      <button 
        onClick={() => onJoin(exam._id)}
        className="w-full py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-colors"
      >
        Join Exam
      </button>
    )}
    {status === 'SUBMITTED' && (
      <div className="w-full py-2 bg-green-50 text-green-700 rounded-lg font-bold text-center text-sm border border-green-100 flex flex-col items-center">
        <span className="uppercase tracking-wider">Submitted</span>
        {result?.isEvaluated && (
          <span className={`text-[10px] mt-2 px-3 py-0.5 rounded-full border font-black ${
            Number(result.totalScore || 0) >= (exam.passMarks || result.passMarks || 40) 
            ? 'bg-green-100 text-green-800 border-green-200' 
            : 'bg-red-100 text-red-800 border-red-200'
          }`}>
            {Number(result.totalScore || 0) >= (exam.passMarks || result.passMarks || 40) ? 'PASS' : 'FAIL'} 
            <span className="ml-1 opacity-60">({result.totalScore.toFixed(1)}/{exam.maxMarks})</span>
          </span>
        )}
      </div>
    )}
  </div>
);

export default StudentDashboard;