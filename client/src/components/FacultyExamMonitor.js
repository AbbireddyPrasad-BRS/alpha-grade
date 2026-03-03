import React, { useEffect, useState } from 'react';
import { useSocket } from '../contexts/SocketContext';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const FacultyExamMonitor = ({ examId, onClose }) => {
  const socket = useSocket();
  const [waitingStudents, setWaitingStudents] = useState([]);
  const [activeStudents, setActiveStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [exam, setExam] = useState(null);
  const [error, setError] = useState('');
  const { user } = useAuth();

  const selectedStudent = [...activeStudents, ...waitingStudents].find(s => s._id === selectedStudentId);

  useEffect(() => {
    // Fetch initial exam details
    const fetchExamDetails = async () => {
      try {
        const { data } = await api.get(`/exams/${examId}`);
        setExam(data);
      } catch (err) {
        setError('Failed to load exam details.');
      }
    };

    fetchExamDetails();

    if (socket) {
      // Notify the backend that faculty is monitoring this exam
      socket.emit('faculty:start-monitoring', { examId });

      const handleStudentJoined = (session) => {
        setWaitingStudents((prev) => {
          if (prev.find(s => s._id === session._id)) return prev;
          return [...prev, { ...session, lastSeen: Date.now() }];
        });
      };

      const handleWaitingList = (sessions) => {
        const now = Date.now();
        setWaitingStudents(sessions.map(s => ({ ...s, lastSeen: now })));
      };

      const handleStudentKicked = ({ sessionId }) => {
        setWaitingStudents((prev) => prev.filter(s => s._id !== sessionId));
      };

      const handleActiveList = (sessions) => {
        const now = Date.now();
        setActiveStudents(sessions.map(s => ({ ...s, lastSeen: now })));
      };

      const handleStudentStatusUpdate = (updatedSession) => {
        const now = Date.now();
        const sessionWithTime = { ...updatedSession, lastSeen: now };
        
        // Update existing entries in both lists while merging monitoring data
        const mergeUpdate = (s) => s._id === updatedSession._id ? { ...s, ...updatedSession, monitoringData: { ...(s.monitoringData || {}), ...(updatedSession.monitoringData || {}) }, lastSeen: now } : s;
        setActiveStudents(prev => prev.map(mergeUpdate));
        setWaitingStudents(prev => prev.map(mergeUpdate));

        // Ensure student is in the correct list based on status
        if (updatedSession.status === 'waiting') {
          setWaitingStudents(prev => prev.find(s => s._id === updatedSession._id) ? prev : [...prev, sessionWithTime]);
          setActiveStudents(prev => prev.filter(s => s._id !== updatedSession._id));
        } else if (['in-progress', 'admitted', 'submitted', 'terminated'].includes(updatedSession.status)) {
          setActiveStudents(prev => prev.find(s => s._id === updatedSession._id) ? prev : [...prev, sessionWithTime]);
          setWaitingStudents(prev => prev.filter(s => s._id !== updatedSession._id));
        }
      };

      const handleStudentSubmitted = ({ studentId, sessionId }) => {
        const now = Date.now();
        const update = (s) => (s._id === sessionId || (s.studentID && (s.studentID._id === studentId || s.studentID === studentId)))
          ? { ...s, status: 'submitted', progress: 100, lastSeen: now }
          : s;
        setActiveStudents(prev => prev.map(update));
        setWaitingStudents(prev => prev.map(update));
      };

      const handleHeartbeat = (data) => {
        const sId = data.studentId || data.studentID;
        if (!sId) return;
        const now = Date.now();
        const updateSession = (s) => {
          const isMatch = s._id === sId || (s.studentID && (s.studentID._id === sId || s.studentID === sId));
          if (!isMatch) return s;
          const focusCount = data.focus_change_count ?? data.tabSwitches ?? data.malpractices ?? s.monitoringData?.focus_change_count ?? s.tabSwitches;
          return { 
            ...s, 
            progress: data.progress ?? s.progress,
            monitoringData: { 
              ...(s.monitoringData || {}), 
              focus_change_count: focusCount,
              lastHeartbeat: now
            },
            tabSwitches: focusCount,
            lastSeen: now 
          };
        };
        setActiveStudents((prev) => prev.map(updateSession));
        setWaitingStudents((prev) => prev.map(updateSession));
      };

      socket.on('faculty:student-joined', handleStudentJoined);
      socket.on('faculty:waiting-list', handleWaitingList);
      socket.on('faculty:student-kicked', handleStudentKicked);
      socket.on('faculty:active-list', handleActiveList);
      socket.on('faculty:student-status-update', handleStudentStatusUpdate);
      socket.on('student:heartbeat', handleHeartbeat);
      socket.on('faculty:student-submitted', handleStudentSubmitted);

      // Clean up the listener when the component unmounts
      return () => {
        socket.off('faculty:student-joined', handleStudentJoined);
        socket.off('faculty:waiting-list', handleWaitingList);
        socket.off('faculty:student-kicked', handleStudentKicked);
        socket.off('faculty:active-list', handleActiveList);
        socket.off('faculty:student-status-update', handleStudentStatusUpdate);
        socket.off('student:heartbeat', handleHeartbeat);
        socket.off('faculty:student-submitted', handleStudentSubmitted);
      };
    }
  }, [socket, examId]); // This dependency array is correct, the issue was elsewhere. Re-running on purpose if examId changes.

  const isOnline = (session) => {
    if (!session) return false;
    // Prioritize local lastSeen, then fallback to heartbeat timestamps
    if (session.lastSeen && (Date.now() - session.lastSeen) < 60000) return true;
    const heartbeat = session.lastHeartbeat || session.monitoringData?.lastHeartbeat || session.updatedAt || session.createdAt;
    if (!heartbeat) return false;
    const lastTime = new Date(heartbeat).getTime();
    const now = Date.now();
    return (now - lastTime) < 60000 || lastTime > now;
  };

  const getSeatStatus = (session) => {
    if (session.status === 'submitted') return 'submitted';
    if (session.status === 'terminated') return 'terminated';
    if (!isOnline(session)) return 'offline';
    if ((session.monitoringData?.focus_change_count || 0) > 3) return 'warning';
    return 'active';
  };

  const statusConfig = {
    active: { color: 'bg-green-500', label: 'Active', icon: '👤' },
    warning: { color: 'bg-orange-500 animate-pulse', label: 'Warning', icon: '⚠️' },
    offline: { color: 'bg-gray-400', label: 'Offline', icon: '💤' },
    submitted: { color: 'bg-blue-500', label: 'Submitted', icon: '✅' },
    terminated: { color: 'bg-red-600', label: 'Terminated', icon: '🚫' },
  };

  const handleKickStudent = (sessionId) => {
    if (socket && window.confirm('Are you sure you want to remove this student from the waiting room?')) {
      socket.emit('faculty:kick-student', { sessionId });
    }
  };

  const handleTerminateStudent = (sessionId) => {
    if (socket && window.confirm('Are you sure you want to terminate the exam for this student? This will force submit their current progress.')) {
      socket.emit('faculty:terminate-student', { sessionId });
    }
  };

  const handleStartExam = () => {
    if (socket && window.confirm('This will start the exam for all students in the waiting room. Are you sure?')) {
      socket.emit('faculty:start-exam', { examId });
    }
  };

  const handleForceSubmitAll = () => {
    if (socket && window.confirm('CRITICAL: This will force submit the exam for ALL students immediately. Continue?')) {
      socket.emit('admin:force-submit-all', { examId });
    }
  };

  const handleExtendTime = (minutes) => {
    if (socket && window.confirm(`Extend exam time by ${minutes} minutes for all students?`)) {
      socket.emit('admin:extend-time', { examId, minutes });
    }
  };

  const handleSync = async () => {
    try {
      const { data } = await api.get(`/exams/${examId}/sessions`);
      const now = Date.now();
      setWaitingStudents(data.filter(s => s.status === 'waiting').map(s => ({ ...s, lastSeen: now })));
      setActiveStudents(data.filter(s => ['in-progress', 'admitted', 'submitted', 'terminated'].includes(s.status)).map(s => ({ ...s, lastSeen: now })));
    } catch (err) {
      setError('Manual sync failed.');
    }
  };

  const handleBroadcast = () => {
    if (socket && broadcastMsg.trim()) {
      socket.emit('faculty:broadcast-message', { examId, message: broadcastMsg });
      setBroadcastMsg('');
      alert('Message broadcasted to all students.');
    }
  };

  // Force re-render to update "Online" status indicators
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 5000);
    return () => clearInterval(interval);
  }, []);

  if (!exam) {
    return <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50"><div className="text-white">Loading Exam Monitor...</div></div>;
  }

  return (
    <div className="fixed inset-0 bg-slate-900 bg-opacity-95 overflow-y-auto h-full w-full z-50 backdrop-blur-sm p-4 md:p-10">
      <div className="relative mx-auto p-0 border-4 border-slate-700 w-full max-w-6xl shadow-2xl rounded-2xl bg-slate-50 overflow-hidden">
        {/* Header Section */}
        <div className="bg-white border-b-2 border-slate-200 p-6 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="bg-indigo-600 p-3 rounded-lg text-white shadow-lg">
              <span className="text-2xl">🖥️</span>
            </div>
            <div>
              <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Exam Control Center</h3>
              <p className="text-slate-500 font-bold text-sm uppercase tracking-wider">{exam.subject} • {exam.examCode || 'N/A'}</p>
            </div>
          </div>
          <button onClick={onClose} className="bg-slate-100 hover:bg-red-100 text-slate-400 hover:text-red-600 p-2 rounded-full transition-all text-2xl font-bold w-12 h-12 flex items-center justify-center border-2 border-transparent hover:border-red-200">&times;</button>
        </div>

        <div className="p-6">
          {/* Controls Bar */}
          <div className="flex flex-col lg:flex-row justify-between items-center mb-8 gap-4 bg-white p-4 rounded-xl border-2 border-slate-200 shadow-sm">
            <div className="w-full lg:w-1/2 flex gap-2">
            <input 
              type="text" 
              placeholder="Type a broadcast message to all students..." 
              className="flex-grow px-4 py-2 bg-slate-50 border-2 border-slate-200 rounded-lg focus:border-indigo-500 outline-none font-medium transition-all"
              value={broadcastMsg}
              onChange={(e) => setBroadcastMsg(e.target.value)}
            />
            <button 
              onClick={handleBroadcast}
              className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm font-black hover:bg-indigo-700 uppercase tracking-widest shadow-md active:transform active:scale-95 transition-all"
            >
              Broadcast
            </button>
          </div>
            <div className="flex gap-3 w-full lg:w-auto justify-end">
              <button
                onClick={handleSync}
                className="bg-slate-200 text-slate-700 px-5 py-2 rounded-lg text-sm font-black hover:bg-slate-300 uppercase tracking-widest transition-all"
                title="Sync with Database"
              >
                Sync Data
              </button>
              <button
                onClick={handleStartExam}
                className="bg-green-600 text-white px-6 py-2 rounded-lg text-sm font-black hover:bg-green-700 uppercase tracking-widest shadow-md transition-all"
              >
                Start Exam for All
              </button>
            </div>
          </div>

        {user?.role === 'Admin' && (
          <div className="mb-8 p-4 bg-red-50 border-2 border-red-200 rounded-xl flex flex-wrap justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="animate-pulse text-red-600">🛡️</span>
              <span className="text-xs font-black text-red-800 uppercase tracking-widest">Admin Override Panel:</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleExtendTime(5)} className="bg-white border-2 border-orange-400 text-orange-600 px-4 py-1.5 rounded-lg text-[10px] font-black hover:bg-orange-50 uppercase tracking-tighter transition-all">
                +5 Mins
              </button>
              <button onClick={handleForceSubmitAll} className="bg-red-600 text-white px-4 py-1.5 rounded-lg text-[10px] font-black hover:bg-red-700 uppercase tracking-tighter shadow-sm transition-all">
                Force Submit All
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-red-500 text-center mb-4">{error}</p>}

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
          {/* Live Monitoring Seat Map */}
          <div className="xl:col-span-3 bg-slate-200 rounded-3xl p-8 border-4 border-slate-300 shadow-inner relative">
            {/* Front of Room Indicator */}
            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-slate-800 text-white px-10 py-2 rounded-full border-4 border-slate-200 shadow-xl z-10">
              <span className="text-xs font-black uppercase tracking-[0.3em]">Front / Proctor Desk</span>
            </div>

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 mt-4 gap-4">
              <h4 className="text-xl font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                <span className="w-3 h-8 bg-indigo-600 rounded-full"></span>
                Exam Hall Map
              </h4>
              <div className="flex flex-wrap gap-3">
                {Object.entries(statusConfig).map(([key, cfg]) => (
                  <div key={key} className="flex items-center gap-1.5 bg-white/80 backdrop-blur-sm px-3 py-1.5 rounded-full border border-slate-300 text-[9px] font-black text-slate-600 shadow-sm uppercase">
                    <span className={`w-3 h-3 rounded-sm ${cfg.color.split(' ')[0]}`}></span>
                    {cfg.label}
                  </div>
                ))}
              </div>
            </div>

            {activeStudents.length > 0 ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-6">
                {activeStudents.map((session) => {
                  const status = getSeatStatus(session);
                  const config = statusConfig[status];
                  return (
                    <button
                      key={session._id}
                      onClick={() => setSelectedStudentId(session._id)}
                      className={`aspect-square rounded-2xl flex flex-col items-center justify-center transition-all transform hover:scale-110 active:scale-95 shadow-lg border-b-8 border-black/20 group relative ${config.color}`}
                    >
                      <span className="text-2xl mb-1 drop-shadow-md">{config.icon}</span>
                      <span className="text-[11px] font-black text-white leading-none drop-shadow-sm">
                        {session.studentID.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                      </span>
                      <div className="absolute -top-2 -right-2 bg-white text-slate-900 text-[9px] font-black px-2 py-0.5 rounded-full border-2 border-slate-200 shadow-md">
                        {session.status === 'submitted' ? 100 : (session.progress || 0)}%
                      </div>
                      {/* Tooltip on hover */}
                      <div className="absolute bottom-full mb-2 hidden group-hover:block z-10 bg-gray-900 text-white text-[10px] py-1 px-2 rounded whitespace-nowrap pointer-events-none">
                        {session.studentID.name}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-24 border-4 border-dashed border-slate-300 rounded-3xl bg-slate-100/50">
                <p className="text-slate-400 font-black uppercase tracking-widest text-sm italic">The exam hall is currently empty.</p>
              </div>
            )}
          </div>

          {/* Waiting Room Section */}
          <div className="xl:col-span-1 bg-white rounded-3xl p-6 border-2 border-slate-200 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <h4 className="text-sm font-black text-slate-700 uppercase tracking-widest">Lobby ({waitingStudents.length})</h4>
              <span className="bg-indigo-100 text-indigo-600 text-[10px] font-black px-2 py-1 rounded-md uppercase">Waiting</span>
            </div>
            {waitingStudents.length > 0 ? (
              <div className="space-y-3 overflow-y-auto max-h-[600px] pr-2 custom-scrollbar">
                {waitingStudents.map((session) => (
                  <div key={session._id} className="bg-slate-50 p-4 rounded-xl border-2 border-slate-100 shadow-sm flex justify-between items-center group hover:border-indigo-200 transition-all">
                    <div className="truncate mr-2">
                      <p className="font-black text-xs text-slate-800 truncate uppercase tracking-tight">{session.studentID.name}</p>
                      <p className="text-[9px] font-bold text-slate-400 truncate">{session.studentID.email}</p>
                    </div>
                    <button
                      onClick={() => handleKickStudent(session._id)}
                      className="px-3 py-1.5 bg-white text-red-500 border border-red-100 text-[9px] font-black rounded-lg hover:bg-red-500 hover:text-white uppercase transition-all shadow-sm"
                    >
                      Kick
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-300 text-center py-10 text-xs font-bold italic uppercase tracking-widest">Lobby is clear.</p>
            )}
          </div>
        </div>
        </div>
      </div>

      {/* Detailed Performance Modal */}
      {selectedStudent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="bg-indigo-600 p-4 text-white flex justify-between items-center">
              <h4 className="font-bold">Live Performance: {selectedStudent.studentID.name}</h4>
              <button onClick={() => setSelectedStudentId(null)} className="text-2xl">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-500">Status</span>
                <span className={`font-bold ${selectedStudent.status === 'submitted' ? 'text-blue-600' : isOnline(selectedStudent) ? 'text-green-600' : 'text-red-600'}`}>
                  {selectedStudent.status === 'submitted' ? 'Submitted' : isOnline(selectedStudent) ? 'Active' : 'Disconnected'}
                </span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-500">Progress</span>
                <span className="font-bold">{selectedStudent.status === 'submitted' ? 100 : (selectedStudent.progress ?? 0)}% Completed</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-500">Tab Switches</span>
                <span className={`font-bold ${(selectedStudent.tabSwitches ?? selectedStudent.monitoringData?.focus_change_count ?? 0) > 2 ? 'text-red-600' : 'text-gray-800'}`}>
                  {selectedStudent.tabSwitches ?? selectedStudent.monitoringData?.focus_change_count ?? 0}
                </span>
              </div>
              <button 
                onClick={() => { handleTerminateStudent(selectedStudent._id); setSelectedStudentId(null); }}
                className="w-full py-2 bg-red-50 text-red-600 rounded font-bold hover:bg-red-100 transition-colors"
              >
                Terminate Exam for Student
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FacultyExamMonitor;