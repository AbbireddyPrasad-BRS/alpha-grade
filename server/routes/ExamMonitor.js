import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
// import FacultyExamMonitor from '../../components/FacultyExamMonitor';
import { useSocket } from '../../contexts/SocketContext';

const ExamMonitor = () => {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingExam, setEditingExam] = useState(null);
  const [monitoringExamId, setMonitoringExamId] = useState(null);
  const [liveStats, setLiveStats] = useState({}); // { examId: { students: { studentId: { name, status, progress, malpractices, lastSeen } } } }

  const socket = useSocket();

  const fetchExams = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const res = await api.get('/admin/exams');
      setExams(res.data);
      initializeStats(res.data);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching exams', err);
      setLoading(false);
    }
  }, [setExams, setLoading]);

  const initializeStats = (examsList) => {
    setLiveStats(prev => {
      const next = { ...prev };
      examsList.forEach(exam => {
        const currentExamStats = next[exam._id] || { students: {} };
        const updatedStudents = { ...currentExamStats.students };

        (exam.registeredStudents || []).forEach(s => {
          const sId = typeof s === 'object' ? s._id : s;
          const sName = typeof s === 'object' ? s.name : 'Student';
          
          if (!updatedStudents[sId]) {
            updatedStudents[sId] = {
              id: sId,
              name: sName,
              status: 'waiting',
              progress: 0,
              malpractices: 0,
              lastSeen: null
            };
          } else if (typeof s === 'object' && s.name && (updatedStudents[sId].name === 'Student' || updatedStudents[sId].name === 'Unknown')) {
            updatedStudents[sId].name = s.name;
          }
        });
        next[exam._id] = { ...currentExamStats, students: updatedStudents };
      });
      return next;
    });
  };

  // Fetch full details for a specific exam when monitoring starts to ensure registeredStudents are loaded
  useEffect(() => {
    if (monitoringExamId) {
      const fetchFullDetails = async () => {
        try {
          const res = await api.get(`/exams/${monitoringExamId}`);
          setExams(prev => prev.map(e => e._id === monitoringExamId ? { ...e, ...res.data } : e));
          initializeStats([res.data]);
        } catch (err) {
          console.error('Error fetching full exam details', err);
        }
      };
      fetchFullDetails();
    }
  }, [monitoringExamId]);

  useEffect(() => {
    fetchExams();
  }, [fetchExams]);

  useEffect(() => {
    if (!socket) return;

    const updateStats = (examId, studentId, progress, malpractices, status, name, lastSeen = Date.now()) => {
      if (!examId || !studentId) return;
      setLiveStats(prev => {
        const current = prev[examId] || { students: {} };
        const studentData = current.students[studentId] || { 
          id: studentId,
          name: name || 'Student',
          progress: 0, 
          malpractices: 0, 
          status: 'waiting' 
        };

        const updatedStudents = {
          ...current.students,
          [studentId]: {
            ...studentData,
            name: name || studentData.name,
            progress: progress ?? studentData.progress,
            malpractices: malpractices ?? studentData.malpractices,
            status: status ?? studentData.status,
            lastSeen: lastSeen
          }
        };

        return {
          ...prev,
          [examId]: { ...current, students: updatedStudents }
        };
      });
    };

    const handleHeartbeat = (data) => {
      const sId = data.studentId || data.studentID;
      const malp = data.focus_change_count ?? data.tabSwitches ?? data.malpractices;
      updateStats(data.examId || data.examID, sId, data.progress, malp, 'active');
    };

    const handleStartExam = (data) => {
      const sId = data.studentId || data.studentID;
      updateStats(data.examId || data.examID, sId, 0, 0, 'active');
    };

    const handleSubmission = (data) => {
      const sId = data.studentId || data.studentID;
      updateStats(data.examId || data.examID, sId, null, null, 'submitted');
    };

    const handleStudentJoined = (session) => {
      const sId = session.studentID?._id || session.studentId;
      const sName = session.studentID?.name || session.name;
      updateStats(session.examID || session.examId, sId, 0, 0, 'online', sName);
    };

    const handleWaitingList = (sessions) => {
      sessions.forEach(session => {
        const sId = session.studentID?._id || session.studentId;
        const sName = session.studentID?.name || session.name;
        updateStats(session.examID || session.examId, sId, 0, 0, 'online', sName);
      });
    };

    socket.on('student:heartbeat', handleHeartbeat);
    socket.on('student:start-exam', handleStartExam);
    socket.on('faculty:student-submitted', handleSubmission);
    socket.on('faculty:student-joined', handleStudentJoined);
    socket.on('faculty:waiting-list', handleWaitingList);

    return () => {
      socket.off('student:heartbeat', handleHeartbeat);
      socket.off('student:start-exam', handleStartExam);
      socket.off('faculty:student-submitted', handleSubmission);
      socket.off('faculty:student-joined', handleStudentJoined);
      socket.off('faculty:waiting-list', handleWaitingList);
    };
  }, [socket]);

  useEffect(() => {
    if (socket && monitoringExamId) {
      socket.emit('faculty:start-monitoring', { examId: monitoringExamId });
    }
  }, [socket, monitoringExamId]);

  // Offline detection interval
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setLiveStats(prev => {
        const next = { ...prev };
        let changed = false;
        Object.keys(next).forEach(examId => {
          Object.keys(next[examId].students).forEach(studentId => {
            const s = next[examId].students[studentId];
            if ((s.status === 'active' || s.status === 'online') && s.lastSeen && now - s.lastSeen > 60000) {
              next[examId].students[studentId] = { ...s, status: 'offline' };
              changed = true;
            }
          });
        });
        return changed ? next : prev;
      });
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleEdit = (exam) => {
    setEditingExam({
      ...exam,
      startTime: exam.startTime ? new Date(exam.startTime).toISOString().slice(0, 16) : '',
      endTime: exam.endTime ? new Date(exam.endTime).toISOString().slice(0, 16) : ''
    });
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/admin/exams/${editingExam._id}`, {
        startTime: editingExam.startTime,
        endTime: editingExam.endTime,
        status: editingExam.status
      });
      setEditingExam(null);
      fetchExams();
    } catch (err) {
      alert('Failed to update exam');
    }
  };

  const handleForceSync = () => {
    setLoading(true);
    fetchExams();
  };

  if (loading) return <div className="p-4 text-center">Loading Exams...</div>;

  const monitoringExam = exams.find(e => e._id === monitoringExamId);

  if (monitoringExamId && monitoringExam) {
    const students = Object.values(liveStats[monitoringExamId]?.students || {});
    const waitingRoom = students.filter(s => s.status === 'waiting' || s.status === 'online');
    const seatMap = students.filter(s => s.status === 'active' || s.status === 'submitted' || s.status === 'offline');

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-lg shadow-sm border">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">{monitoringExam.subject}</h2>
            <p className="text-sm text-gray-500">Monitoring Live Session</p>
          </div>
          <button 
            onClick={() => { setMonitoringExamId(null); fetchExams(); }} 
            className="w-full sm:w-auto bg-gray-800 text-white px-6 py-2 rounded-md hover:bg-gray-900 transition-colors font-semibold"
          >
            Exit Monitor
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Waiting Room */}
          <div className="lg:col-span-1 bg-gray-50 p-4 rounded-xl border border-gray-200 shadow-inner h-fit">
            <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2">
              <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
              Waiting Room ({waitingRoom.length})
            </h3>
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2">
              {waitingRoom.map(s => (
                <div key={s.id} className="p-3 bg-white rounded-lg border border-gray-200 shadow-sm flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-700 truncate">{s.name}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${s.status === 'online' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                    {s.status === 'online' ? 'In Lobby' : 'Offline'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Seat Map */}
          <div className="lg:col-span-3 bg-gray-900 rounded-xl p-8 border-t-8 border-indigo-500 shadow-2xl">
            <div className="w-full mb-12 flex flex-col items-center">
              <div className="w-3/4 h-2 bg-indigo-400 rounded-full blur-sm opacity-50 mb-2"></div>
              <p className="text-indigo-300 text-[10px] font-bold tracking-widest uppercase">Front of Exam Hall (Invigilator Desk)</p>
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-6 justify-items-center">
              {seatMap.map(s => {
                const isWarning = s.malpractices > 3;
                return (
                  <div 
                    key={s.id}
                    className={`relative w-14 h-14 rounded-t-xl border-b-4 flex flex-col items-center justify-center transition-all hover:scale-110 shadow-lg ${
                      s.status === 'submitted' ? 'bg-blue-600 border-blue-800 text-white' :
                      isWarning ? 'bg-red-600 border-red-800 animate-pulse text-white' : 
                      s.status === 'active' ? 'bg-green-600 border-green-800 text-white' : 'bg-gray-700 border-gray-800 text-gray-400'
                    }`}
                    title={`${s.name} - ${s.progress}%`}
                  >
                    <span className="text-xs font-black uppercase">
                      {s.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </span>
                    
                    <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-gray-900 ${
                      s.status === 'submitted' ? 'bg-indigo-400' : 
                      s.status === 'active' ? 'bg-emerald-400' : 'bg-gray-500'
                    }`}></div>
                    
                    <div className="absolute bottom-0 left-0 w-full h-1.5 bg-black bg-opacity-40 rounded-b-none overflow-hidden">
                      <div className="h-full bg-green-400 transition-all duration-500" style={{ width: `${s.progress}%` }}></div>
                    </div>

                    {isWarning && (
                      <div className="absolute -top-6 bg-red-600 text-[8px] px-1 rounded animate-bounce">
                        {s.malpractices}⚠️
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {seatMap.length === 0 && (
              <div className="py-20 text-center text-gray-500">
                <p className="text-lg">No students have started the exam yet.</p>
                <p className="text-sm mt-2 italic">Seats will appear here as students begin.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h3 className="text-xl font-bold text-gray-800">Exam Monitoring & Troubleshooting</h3>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <button onClick={handleForceSync} className="text-sm bg-indigo-600 text-white hover:bg-indigo-700 px-4 py-1 rounded font-bold shadow-sm">
            Force System Sync
          </button>
          <button onClick={fetchExams} className="text-sm bg-gray-200 hover:bg-gray-300 px-3 py-1 rounded">Refresh List</button>
        </div>
      </div>
      
      {editingExam && (
        <div className="bg-indigo-50 p-6 rounded-lg border border-indigo-200 shadow-sm">
          <h4 className="font-bold text-indigo-900 mb-4">Troubleshoot Exam: {editingExam.subject}</h4>
          <form onSubmit={handleUpdate} className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Start Time</label>
              <input 
                type="datetime-local" 
                className="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 p-2 border"
                value={editingExam.startTime}
                onChange={(e) => setEditingExam({...editingExam, startTime: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">End Time</label>
              <input 
                type="datetime-local" 
                className="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 p-2 border"
                value={editingExam.endTime}
                onChange={(e) => setEditingExam({...editingExam, endTime: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Status Override</label>
              <select 
                className="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 p-2 border"
                value={editingExam.status}
                onChange={(e) => setEditingExam({...editingExam, status: e.target.value})}
              >
                <option value="upcoming">Upcoming</option>
                <option value="open">Open (Active)</option>
                <option value="closed">Closed (Completed)</option>
              </select>
            </div>
            <div className="sm:col-span-3 flex justify-end space-x-3">
              <button 
                type="button" 
                onClick={() => setEditingExam(null)} 
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700"
              >
                Update Exam
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white shadow-md rounded-lg overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Exam Details</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Faculty</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Schedule</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Credentials</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Live Monitoring</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {exams.length === 0 ? (
              <tr><td colSpan="5" className="px-6 py-10 text-center text-gray-500">No exams found in the system.</td></tr>
            ) : (
              exams.map(exam => {
                const stats = liveStats[exam._id] || { students: {} };
                const studentList = Object.values(stats.students);
                const activeCount = studentList.filter(s => s.status === 'active').length;
                const malpractices = studentList.reduce((sum, s) => sum + s.malpractices, 0);
                const totalProgress = studentList.reduce((sum, s) => sum + s.progress, 0);
                const avgProgress = activeCount > 0 ? Math.round(totalProgress / activeCount) : 0;

                return (
                <tr key={exam._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="text-sm font-bold text-gray-900">{exam.subject}</div>
                    <div className="text-xs text-gray-500">ID: {exam._id}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">{exam.facultyID?.name || 'Unknown'}</div>
                    <div className="text-xs text-gray-500">{exam.facultyID?.email}</div>
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-600">
                    <div><span className="font-semibold">Start:</span> {new Date(exam.startTime).toLocaleString()}</div>
                    <div><span className="font-semibold">End:</span> {new Date(exam.endTime).toLocaleString()}</div>
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-600">
                    <div><span className="font-semibold">Exam Code:</span> <span className="font-mono font-bold text-indigo-600">{exam.examCode || 'N/A'}</span></div>
                    <div><span className="font-semibold">Pass:</span> <span className="font-mono">{exam.password || 'N/A'}</span></div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      exam.status === 'open' ? 'bg-green-100 text-green-800' : 
                      exam.status === 'upcoming' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {exam.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${activeCount > 0 ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`}></span>
                        <span className="font-bold text-gray-700">{activeCount} Students Online</span>
                      </div>
                      {activeCount > 0 && (
                        <>
                          <div className="text-red-600 font-bold">⚠️ {malpractices} Malpractices</div>
                          <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                            <div className="bg-indigo-600 h-1.5 rounded-full" style={{ width: `${avgProgress}%` }}></div>
                          </div>
                          <div className="text-[10px] text-gray-500 text-right">{avgProgress}% Avg Progress</div>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium">
                    <div className="flex flex-col space-y-2">
                      <button 
                        onClick={() => setMonitoringExamId(exam._id)}
                        className="text-green-600 hover:text-green-900 bg-green-50 px-3 py-1 rounded text-center"
                      >
                        Monitor
                      </button>
                      <button 
                        onClick={() => handleEdit(exam)}
                        className="text-indigo-600 hover:text-indigo-900 bg-indigo-50 px-3 py-1 rounded text-center"
                      >
                        Troubleshoot
                      </button>
                    </div>
                  </td>
                </tr>
              )})
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ExamMonitor;