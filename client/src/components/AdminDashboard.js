import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';
import FacultyExamMonitor from './FacultyExamMonitor';

const PermissionToggle = ({ label, value, onChange }) => (
  <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200 shadow-sm hover:border-indigo-200 transition-all group">
    <span className="text-sm font-bold text-gray-700 group-hover:text-indigo-700 transition-colors">{label}</span>
    <div className="flex bg-gray-100 rounded-lg p-1 border border-gray-200">
      <button 
        type="button"
        onClick={() => onChange(true)}
        className={`px-4 py-1.5 text-[10px] font-black rounded-md transition-all duration-200 ${value ? 'bg-green-600 text-white shadow-md transform scale-105' : 'text-gray-400 hover:text-gray-600'}`}
      >
        ENABLED
      </button>
      <button 
        type="button"
        onClick={() => onChange(false)}
        className={`px-4 py-1.5 text-[10px] font-black rounded-md transition-all duration-200 ${!value ? 'bg-red-600 text-white shadow-md transform scale-105' : 'text-gray-400 hover:text-gray-600'}`}
      >
        DISABLED
      </button>
    </div>
  </div>
);

const AdminDashboard = () => {
  const [exams, setExams] = useState([]);
  const [users, setUsers] = useState({ faculty: [], students: [], admins: [] });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('exams'); // 'exams', 'users', 'results', 'questions', 'health'
  const [results, setResults] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [selectedExam, setSelectedExam] = useState(null);
  const [health, setHealth] = useState(null);
  const [activities, setActivities] = useState([]);
  const [monitoringExamId, setMonitoringExamId] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editFormData, setEditFormData] = useState({ 
    name: '', email: '', department: '', enrollmentNumber: '',
    canCreateExam: false, canEvaluate: false, canTakeExam: false,
    canDeleteExam: false
  });
  const [currentTime, setCurrentTime] = useState(new Date());
  const navigate = useNavigate();
  const socket = useSocket();
  const { user } = useAuth();

  const fetchExams = useCallback(async () => {
    try {
      // Use the endpoint that returns ALL exams for admins
      const { data } = await api.get('/exams/my-exams');
      setExams(data || []);
    } catch (error) {
      console.error("Error fetching exams", error);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/users');
      setUsers({ faculty: Array.isArray(data.faculty) ? data.faculty : [], students: Array.isArray(data.students) ? data.students : [], admins: Array.isArray(data.admins) ? data.admins : [] });
    } catch (error) {
      console.error("Error fetching users", error);
    }
  }, []);

  const fetchResults = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/results/overall');
      setResults(data || []);
    } catch (error) {
      console.error("Error fetching results", error);
    }
  }, []);

  const fetchQuestions = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/questions');
      setQuestions(data || []);
    } catch (error) {
      console.error("Error fetching questions", error);
    }
  }, []);

  const fetchHealth = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/health');
      setHealth(data);
    } catch (error) {
      console.error("Error fetching health", error);
    }
  }, []);

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      await Promise.all([fetchExams(), fetchUsers(), fetchResults(), fetchQuestions(), fetchHealth()]);
    } catch (error) {
      console.error("Error fetching dashboard data", error);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [fetchExams, fetchUsers, fetchResults, fetchQuestions, fetchHealth]);

  useEffect(() => {
    // Only show full-page loading on the very first load
    fetchData(exams.length === 0 && users.faculty.length === 0);
    
    // Listen for real-time updates
    if (socket) {
      socket.on('exams:list-updated', fetchExams);
      socket.on('users:list-updated', fetchUsers);
      socket.on('results:updated', fetchResults);
      
      socket.on('admin:activity-broadcast', (activity) => {
        setActivities(prev => [activity, ...prev].slice(0, 10)); // Keep last 10
      });
      
      return () => {
        socket.off('exams:list-updated', fetchExams);
        socket.off('users:list-updated', fetchUsers);
        socket.off('results:updated', fetchResults);
        socket.off('admin:activity-broadcast');
      };
    }
  }, [socket, fetchData, exams.length, users.faculty.length, fetchExams, fetchUsers, fetchResults]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleMonitorExam = (examId) => {
    setMonitoringExamId(examId);
  };

  const viewExamDetails = async (examId) => {
    try {
      const { data } = await api.get(`/exams/${examId}`);
      // Print credentials to terminal (console) as requested
      console.log('--- Exam Details Opened ---');
      console.log('Subject:', data.subject);
      console.log('Exam Code:', data.examCode || data.code || data.subjectCode || 'N/A');
      console.log('Password:', data.password || data.examPassword || 'N/A');
      setSelectedExam(data);
    } catch (err) {
      console.error('Failed to fetch exam details', err);
      alert('Failed to fetch exam details');
    }
  };

  const handleDeleteExam = async (examId) => {
    if (window.confirm('Are you sure you want to delete this exam? This action cannot be undone.')) {
      try {
        await api.delete(`/exams/${examId}`);
        if (socket) {
          socket.emit('admin:exam-updated');
        }
        fetchData(false);
      } catch (error) {
        console.error("Error deleting exam", error);
        alert("Failed to delete exam.");
      }
    }
  };

  const handleToggleDeletion = async (examId, currentStatus) => {
    try {
      // Use the admin-specific route for partial updates to avoid data corruption
      await api.put(`/admin/exams/${examId}`, { allowDeletion: !currentStatus });
      if (socket) {
        socket.emit('admin:exam-updated');
      }
      fetchExams();
    } catch (error) {
      console.error("Error toggling exam deletion", error);
      alert("Failed to update exam deletion status.");
    }
  };

  const handleDeleteUser = async (userId, role) => {
    if (window.confirm(`Are you sure you want to delete this ${role}? This action cannot be undone.`)) {
      try {
        await api.delete(`/auth/users/${userId}?role=${role}`);
        fetchData(false); // Refresh the dashboard data after deletion
      } catch (error) {
        console.error("Error deleting user", error);
        alert("Failed to delete user.");
      }
    }
  };

  const handleEditUser = (user) => {
    setEditingUser(user);
    setEditFormData({
      name: user.name || '',
      email: user.email || '',
      department: user.department || '',
      enrollmentNumber: user.enrollmentNumber || '',
      canCreateExam: !!user.canCreateExam,
      canEvaluate: !!user.canEvaluate,
      canTakeExam: !!user.canTakeExam,
      canDeleteExam: !!user.canDeleteExam
    });
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      // Include the role in the payload to ensure the backend updates the correct model/collection
      await api.put(`/auth/users/${editingUser._id}`, { ...editFormData, role: editingUser.role });
      if (socket) {
        socket.emit('admin:user-updated');
      }
      setShowEditModal(false);
      setEditingUser(null);
      fetchData(false); // Refresh data to show updates
    } catch (error) {
      console.error("Error updating user", error);
      alert("Failed to update user.");
    }
  };

  const evaluateExam = async (examId) => {
    if (!window.confirm('Start AI evaluation for this exam? This process uses Llama 3 to grade student answers. It may take some time.')) return;
    
    try {
      setLoading(true);
      const response = await api.post(`/exams/${examId}/evaluate`, {}, { timeout: 120000 });
      alert(response.data.message);
      fetchExams();
    } catch (err) {
      console.error('Evaluation failed', err);
      const msg = err.response?.data?.message || 'Failed to start evaluation. Ensure Llama 3 is running.';
      alert(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteQuestion = async (id) => {
    if (window.confirm('Delete this question from the global bank?')) {
      try {
        await api.delete(`/admin/questions/${id}`);
        fetchQuestions();
      } catch (error) {
        alert("Failed to delete question.");
      }
    }
  };

  const downloadResultsCSV = () => {
    if (results.length === 0) return;
    const headers = ['Student', 'Email', 'Exam', 'Score', 'Max Marks', 'Status', 'Date'];
    const rows = results.map(r => [
      r.studentId?.name || 'Unknown',
      r.studentId?.email || '',
      r.examId?.subject || 'N/A',
      r.totalScore,
      r.examId?.maxMarks || 0,
      r.totalScore >= (r.examId?.passMarks || 0) ? 'PASS' : 'FAIL',
      new Date(r.submittedAt).toLocaleDateString()
    ]);

    const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `system_results_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getExamEndTime = (exam) => {
    if (exam.endTime) return new Date(exam.endTime);
    if (exam.startTime && exam.durationMinutes) {
      return new Date(new Date(exam.startTime).getTime() + exam.durationMinutes * 60000);
    }
    return null;
  };

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

  const upcomingExams = exams.filter(exam => exam.startTime && new Date(exam.startTime) > currentTime);
  const activeExams = exams.filter(exam => {
    const start = exam.startTime ? new Date(exam.startTime) : null;
    const end = getExamEndTime(exam);
    if (!start) return exam.status === 'open';
    return start <= currentTime && (!end || end > currentTime);
  });
  const completedExams = exams.filter(exam => {
    const end = getExamEndTime(exam);
    return (end && end <= currentTime) || exam.status === 'closed';
  }).sort((a, b) => getExamEndTime(b) - getExamEndTime(a));

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
                  <h4 className="text-lg font-bold text-indigo-700 truncate flex-grow mr-2" title={exam.subject || exam.title}>
                    {exam.subject || exam.title}
                  </h4>
                  <span className={`px-2 py-1 text-[10px] font-black rounded-md uppercase whitespace-nowrap border ${getExamStatusInfo(exam).className}`}>
                    {getExamStatusInfo(exam).label}
                  </span>
                </div>
                
                <p className="text-xs text-gray-500 mb-4 flex items-center">
                  <span className="mr-1">👨‍🏫</span> 
                  <span className="truncate">by {exam.facultyID?.name || 'Unknown'}</span>
                </p>

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
                <button onClick={() => viewExamDetails(exam._id)} className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 text-xs rounded-lg hover:bg-gray-200 font-bold transition-colors">View</button>
                {title !== 'Completed Exams' && (
                  <button onClick={() => navigate(`/faculty/edit-exam/${exam._id}`)} className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 text-xs rounded-lg hover:bg-gray-200 font-bold transition-colors">Edit</button>
                )}
                {title !== 'Completed Exams' && (
                  <button onClick={() => handleMonitorExam(exam._id)} className="flex-1 px-3 py-2 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700 font-bold transition-colors">Monitor</button>
                )}
                <button 
                  onClick={() => handleToggleDeletion(exam._id, exam.allowDeletion)}
                  className={`flex-1 px-3 py-2 text-xs rounded-lg font-bold transition-colors border ${exam.allowDeletion ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'}`}
                >
                  {exam.allowDeletion ? '🔓 Unlocked' : '🔒 Locked'}
                </button>
                {title === 'Completed Exams' && (
                  <>
                    <button onClick={() => navigate(`/faculty/exam/${exam._id}/results`)} className="flex-1 px-3 py-2 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 font-bold transition-colors">Results</button>
                    <button onClick={() => evaluateExam(exam._id)} className="flex-1 px-3 py-2 bg-purple-600 text-white text-xs rounded-lg hover:bg-purple-700 font-bold transition-colors">Evaluate</button>
                  </>
                )}
                <button onClick={() => handleDeleteExam(exam._id)} className="px-3 py-2 bg-red-50 text-red-600 text-xs rounded-lg hover:bg-red-100 font-bold transition-colors">Delete</button>
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

  if (loading) return <div className="flex justify-center items-center h-screen">Loading Admin Dashboard...</div>;

  if (monitoringExamId) {
    return <FacultyExamMonitor examId={monitoringExamId} onClose={() => setMonitoringExamId(null)} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Welcome, {user?.name || 'Admin'}</h1>
          <p className="mt-2 text-gray-600">Manage application workflow, users, and exams.</p>
          
          {/* System Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
            <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-indigo-500">
              <p className="text-xs font-bold text-gray-500 uppercase">Total Students</p>
              <p className="text-2xl font-bold text-gray-800">{users.students.length}</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-green-500">
              <p className="text-xs font-bold text-gray-500 uppercase">Active Exams</p>
              <p className="text-2xl font-bold text-gray-800">{exams.filter(e => e.status === 'open').length}</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-blue-500">
              <p className="text-xs font-bold text-gray-500 uppercase">Total Faculty</p>
              <p className="text-2xl font-bold text-gray-800">{users.faculty.length}</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-purple-500">
              <p className="text-xs font-bold text-gray-500 uppercase">Submissions</p>
              <p className="text-2xl font-bold text-gray-800">{results.length}</p>
            </div>
          </div>

          {/* Live Activity Feed */}
          {activities.length > 0 && (
            <div className="mt-6 bg-indigo-900 text-indigo-100 p-3 rounded-lg shadow-inner text-xs flex flex-col sm:flex-row items-start sm:items-center gap-3 overflow-hidden">
              <span className="font-bold bg-indigo-700 px-2 py-1 rounded animate-pulse whitespace-nowrap">LIVE FEED</span>
              <div className="flex gap-6 animate-marquee whitespace-nowrap overflow-x-auto w-full pb-1 sm:pb-0 no-scrollbar">
                {activities.map((act, i) => (
                  <span key={i}>
                    <span className="opacity-60">[{act.time}]</span> {act.message}
                  </span>
                ))}
              </div>
            </div>
          )}

          <button onClick={fetchData} className="mt-4 text-sm text-indigo-600 hover:text-indigo-800 underline">
            Refresh Data
          </button>
        </div>

        <div className="border-b border-gray-200 mb-6 overflow-x-auto custom-scrollbar">
          <nav className="-mb-px flex space-x-4 sm:space-x-8 min-w-max pb-1">
            <button onClick={() => setActiveTab('exams')} className={`${activeTab === 'exams' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'} whitespace-nowrap py-4 px-1 border-b-2 font-medium`}>
              Exam Management
            </button>
            <button onClick={() => setActiveTab('users')} className={`${activeTab === 'users' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'} whitespace-nowrap py-4 px-1 border-b-2 font-medium`}>
              User Management
            </button>
            <button onClick={() => setActiveTab('results')} className={`${activeTab === 'results' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'} whitespace-nowrap py-4 px-1 border-b-2 font-medium`}>
              Results & Evaluation
            </button>
            <button onClick={() => setActiveTab('questions')} className={`${activeTab === 'questions' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'} whitespace-nowrap py-4 px-1 border-b-2 font-medium`}>
              Question Bank
            </button>
            <button onClick={() => setActiveTab('health')} className={`${activeTab === 'health' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'} whitespace-nowrap py-4 px-1 border-b-2 font-medium`}>
              System Health
            </button>
          </nav>
        </div>

        {activeTab === 'exams' && (
          <div className="space-y-8">
            <div className="flex justify-end">
              <button
                onClick={() => navigate('/faculty/create-exam')}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded shadow"
              >
                + Create New Exam
              </button>
            </div>
            
            {exams.length === 0 ? <p className="text-gray-500">No exams found.</p> : (
              <>
                {renderExamList(activeExams, 'Active Exams')}
                {renderExamList(upcomingExams, 'Upcoming Exams')}
                {renderExamList(completedExams, 'Completed Exams')}
              </>
            )}
          </div>
        )}

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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-gray-600 mb-6 bg-gray-50 p-4 rounded-lg">
                <p><strong>Max Marks:</strong> {selectedExam.maxMarks}</p>
                <p><strong>Pass Marks:</strong> {selectedExam.passMarks}</p>
                <p><strong>Duration:</strong> {selectedExam.durationMinutes} mins</p>
                <p><strong>Evaluation:</strong> {selectedExam.evaluationMode}</p>
                <p><strong>Method:</strong> {selectedExam.creationMethod}</p>
                <p><strong>Questions:</strong> {selectedExam.questions.length}</p>
                <p><strong>Exam Code:</strong> <span className="font-mono font-bold text-indigo-600">{selectedExam.examCode || selectedExam.code || selectedExam.subjectCode || selectedExam.exam_code || 'N/A'}</span></p>
                <p><strong>Exam Password:</strong> <span className="font-mono font-bold text-gray-700">{selectedExam.password || selectedExam.examPassword || selectedExam.exam_password || 'N/A'}</span></p>
              </div>

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
                  <button
                    onClick={() => {
                      navigate(`/faculty/edit-exam/${selectedExam._id}`);
                      setSelectedExam(null);
                    }}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded"
                  >
                    Edit Exam
                  </button>
                )}
                <button
                  onClick={() => setSelectedExam(null)}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 font-bold"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="space-y-8">
            {/* Faculty Section */}
            <div className="bg-white shadow overflow-hidden sm:rounded-lg">
              <div className="px-4 py-5 border-b border-gray-200 bg-indigo-50">
                <h3 className="text-lg font-medium text-indigo-900">Active Faculty Members ({users.faculty.length})</h3>
              </div>
              <ul className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
                {users.faculty.map(user => (
                  <li key={user._id} className="px-4 py-4 flex flex-col sm:flex-row justify-between sm:items-center gap-4 hover:bg-gray-50">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{user.name}</p>
                      <p className="text-sm text-gray-500">{user.email}</p>
                      <p className="text-xs text-gray-400">System ID: {user._id}</p>
                    </div>
                    <div className="flex items-center space-x-4 self-start sm:self-auto">
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-indigo-100 text-indigo-800">
                        {user.department || 'Faculty'}
                      </span>
                      <button onClick={() => handleEditUser(user)} className="text-indigo-600 hover:text-indigo-900 text-sm font-medium">Edit</button>
                      <button onClick={() => handleDeleteUser(user._id, 'Faculty')} className="text-red-600 hover:text-red-900 text-sm font-medium">Delete</button>
                    </div>
                  </li>
                ))}
                {users.faculty.length === 0 && <li className="px-4 py-4 text-gray-500 text-sm">No faculty registered.</li>}
              </ul>
            </div>

            {/* Students Section */}
            <div className="bg-white shadow overflow-hidden sm:rounded-lg">
              <div className="px-4 py-5 border-b border-gray-200 bg-green-50">
                <h3 className="text-lg font-medium text-green-900">Active Students ({users.students.length})</h3>
              </div>
              <ul className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
                {users.students.map(user => (
                  <li key={user._id} className="px-4 py-4 flex flex-col sm:flex-row justify-between sm:items-center gap-4 hover:bg-gray-50">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{user.name}</p>
                      <p className="text-sm text-gray-500">{user.email}</p>
                      <p className="text-xs text-gray-400">System ID: {user._id}</p>
                    </div>
                    <div className="flex items-center flex-wrap gap-2 sm:gap-4 self-start sm:self-auto">
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                        Student
                      </span>
                      {user.enrollmentNumber && <span className="text-xs text-gray-500">ID: {user.enrollmentNumber}</span>}
                      <button onClick={() => handleEditUser(user)} className="text-indigo-600 hover:text-indigo-900 text-sm font-medium ml-2">Edit</button>
                      <button onClick={() => handleDeleteUser(user._id, 'Student')} className="text-red-600 hover:text-red-900 text-sm font-medium ml-2">Delete</button>
                    </div>
                  </li>
                ))}
                {users.students.length === 0 && <li className="px-4 py-4 text-gray-500 text-sm">No students registered.</li>}
              </ul>
            </div>
          </div>
        )}

        {activeTab === 'results' && (
          <div className="bg-white shadow overflow-hidden sm:rounded-lg">
            <div className="px-4 py-5 border-b border-gray-200 bg-purple-50 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
              <h3 className="text-lg font-medium text-purple-900">System-wide Results</h3>
              <button 
                onClick={downloadResultsCSV}
                className="w-full sm:w-auto text-xs bg-green-600 text-white px-4 py-2 rounded font-bold hover:bg-green-700 shadow-sm"
              >
                Download CSV Report
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase">Student</th>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase">Exam</th>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase">Score</th>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase">Date</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {results.length === 0 ? (
                    <tr><td colSpan="5" className="px-3 sm:px-6 py-10 text-center text-gray-500 text-sm">No submissions found in the system.</td></tr>
                  ) : (
                    results.map((res) => (
                      <tr key={res._id} className="hover:bg-gray-50">
                        <td className="px-3 sm:px-6 py-2 sm:py-4 text-xs sm:text-sm font-medium text-gray-900">{res.studentId?.name || 'Unknown'}</td>
                        <td className="px-3 sm:px-6 py-2 sm:py-4 text-xs sm:text-sm text-gray-500">{res.examId?.subject || 'N/A'}</td>
                        <td className="px-3 sm:px-6 py-2 sm:py-4 text-xs sm:text-sm font-bold text-gray-900">{res.totalScore} / {res.examId?.maxMarks || 0}</td>
                        <td className="px-3 sm:px-6 py-2 sm:py-4">
                          <span className={`px-2 py-1 text-[10px] sm:text-xs font-bold rounded-full ${res.totalScore >= (res.examId?.passMarks || 0) ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {res.totalScore >= (res.examId?.passMarks || 0) ? 'PASS' : 'FAIL'}
                          </span>
                        </td>
                        <td className="px-3 sm:px-6 py-2 sm:py-4 text-xs sm:text-sm text-gray-500">{new Date(res.submittedAt).toLocaleDateString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'questions' && (
          <div className="bg-white shadow sm:rounded-lg overflow-hidden">
            <div className="px-4 py-5 border-b border-gray-200 bg-blue-50">
              <h3 className="text-lg font-medium text-blue-900">Global Question Bank ({questions.length})</h3>
            </div>
            <ul className="divide-y divide-gray-200 max-h-[600px] overflow-y-auto">
              {questions.map(q => (
                <li key={q._id} className="p-4 hover:bg-gray-50 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                  <div className="flex-grow pr-0 sm:pr-4">
                    <p className="text-sm font-medium text-gray-900">{q.text}</p>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                      <span className="bg-gray-100 px-2 py-1 rounded">Domain: <strong>{q.domain}</strong></span>
                      <span className="bg-gray-100 px-2 py-1 rounded">Marks: <strong>{q.marks}</strong></span>
                      <span className="bg-gray-100 px-2 py-1 rounded">Difficulty: <strong>{q.difficulty}</strong></span>
                    </div>
                  </div>
                  <button onClick={() => handleDeleteQuestion(q._id)} className="self-end sm:self-auto text-red-600 hover:text-red-900 text-sm font-bold">Delete</button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {activeTab === 'health' && health && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-lg shadow border">
              <h3 className="text-lg font-bold mb-4">Service Connectivity</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                  <span>Database (MongoDB)</span>
                  <span className={`font-bold ${health.database === 'Connected' ? 'text-green-600' : 'text-red-600'}`}>{health.database}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                  <span>AI Service (Ollama)</span>
                  <span className={`font-bold ${health.aiService.includes('Connected') ? 'text-green-600' : 'text-red-600'}`}>{health.aiService}</span>
                </div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-lg shadow border">
              <h3 className="text-lg font-bold mb-4">System Performance</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                  <span>Server Uptime</span>
                  <span className="font-mono">{Math.floor(health.uptime / 3600)}h {Math.floor((health.uptime % 3600) / 60)}m</span>
                </div>
                <div className="mt-4">
                  <button 
                    onClick={fetchHealth}
                    className="w-full py-2 bg-indigo-600 text-white rounded font-bold hover:bg-indigo-700"
                  >
                    Run Diagnostic Check
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Edit User Modal */}
        {showEditModal && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
            <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full m-4 p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gray-900">Edit User</h3>
                <button onClick={() => setShowEditModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
              </div>
              <form onSubmit={handleEditSubmit}>
                <div className="mb-4">
                  <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="edit-name">Name</label>
                  <input
                    id="edit-name"
                    type="text"
                    value={editFormData.name}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="edit-email">Email</label>
                  <input
                    id="edit-email"
                    type="email"
                    value={editFormData.email}
                    onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                    required
                  />
                </div>
                {editingUser?.role === 'Faculty' && (
                  <div className="mb-6">
                    <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="edit-department">Department</label>
                    <input
                      id="edit-department"
                      type="text"
                      value={editFormData.department}
                      onChange={(e) => setEditFormData({ ...editFormData, department: e.target.value })}
                      className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                      placeholder="e.g. Computer Science"
                    />
                  </div>
                )}
                {editingUser?.role === 'Student' && (
                  <div className="mb-4">
                    <label className="block text-gray-700 text-sm font-bold mb-2">Enrollment Number</label>
                    <input
                      type="text"
                      value={editFormData.enrollmentNumber}
                      onChange={(e) => setEditFormData({ ...editFormData, enrollmentNumber: e.target.value })}
                      className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700"
                    />
                  </div>
                )}
                <div className="mb-6 space-y-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
                  <p className="text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-200 pb-2 mb-2">Access Control Permissions</p>
                  {editingUser?.role === 'Faculty' && (
                    <div className="space-y-3">
                      <PermissionToggle 
                        label="Create Exams" 
                        value={editFormData.canCreateExam} 
                        onChange={(val) => setEditFormData(prev => ({ ...prev, canCreateExam: val }))} 
                      />
                      <PermissionToggle 
                        label="Evaluate Submissions" 
                        value={editFormData.canEvaluate} 
                        onChange={(val) => setEditFormData(prev => ({ ...prev, canEvaluate: val }))} 
                      />
                      <PermissionToggle 
                        label="Delete Exams" 
                        value={editFormData.canDeleteExam} 
                        onChange={(val) => setEditFormData(prev => ({ ...prev, canDeleteExam: val }))} 
                      />
                    </div>
                  )}
                  {editingUser?.role === 'Student' && (
                    <PermissionToggle 
                      label="Write/Take Exams" 
                      value={editFormData.canTakeExam} 
                      onChange={(val) => setEditFormData(prev => ({ ...prev, canTakeExam: val }))} 
                    />
                  )}
                </div>
                <div className="flex justify-end">
                  <button type="button" onClick={() => setShowEditModal(false)} className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded mr-2">Cancel</button>
                  <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded">Save Changes</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
