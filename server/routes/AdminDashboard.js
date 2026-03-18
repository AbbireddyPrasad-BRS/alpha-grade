import React, { useState, useEffect } from 'react';
import UserManagement from '../components/admin/UserManagement';
import ExamMonitor from '../components/admin/ExamMonitor';
import api from '../services/api';

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('users');
  const [stats, setStats] = useState({
    students: 0,
    faculty: 0,
    activeExams: 0,
    submissions: 0
  });

  const fetchDashboardStats = async () => {
    try {
      // Fetch exams to calculate active count and total submissions
      const examRes = await api.get('/admin/exams');
      const exams = examRes.data || [];
      
      // Fetch users to calculate student and faculty counts
      const userRes = await api.get('/admin/users');
      const users = userRes.data || [];

      setStats({
        students: users.filter(u => u.role === 'Student').length,
        faculty: users.filter(u => u.role === 'Faculty').length,
        activeExams: exams.filter(e => e.status === 'open').length,
        submissions: exams.reduce((acc, e) => acc + (e.submissions?.length || 0), 0)
      });
    } catch (err) {
      console.error('Failed to fetch dashboard stats', err);
    }
  };

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const navItems = [
    { id: 'users', label: 'User Management', icon: '👥' },
    { id: 'exams', label: 'Exam Monitoring', icon: '📝' },
    { id: 'results', label: 'Results & Evaluation', icon: '📊' },
  ];

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-indigo-700 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between py-4 md:h-16 gap-4">
            <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-8 w-full">
              <span className="text-xl font-bold whitespace-nowrap">AlphaGrade Admin</span>
              <div className="flex items-baseline space-x-2 overflow-x-auto pb-2 md:pb-0 w-full no-scrollbar">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                      activeTab === item.id ? 'bg-indigo-900 text-white' : 'text-indigo-100 hover:bg-indigo-600'
                    }`}
                  >
                    {item.icon} {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-shrink-0">
              <button 
                onClick={() => setActiveTab('exams')}
                className="w-full md:w-auto bg-red-500 hover:bg-red-600 px-4 py-2 rounded text-sm font-bold whitespace-nowrap"
              >
                System Troubleshooting
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* Summary Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-blue-500">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Total Students</div>
              <div className="text-2xl font-black text-gray-900">{stats.students}</div>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-purple-500">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Total Faculty</div>
              <div className="text-2xl font-black text-gray-900">{stats.faculty}</div>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-green-500">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Active Exams</div>
              <div className="text-2xl font-black text-gray-900">{stats.activeExams}</div>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-orange-500">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wider" title="Total exam papers submitted across all subjects">Total Submissions</div>
              <div className="text-2xl font-black text-gray-900">{stats.submissions}</div>
            </div>
          </div>

          {activeTab === 'users' && <UserManagement />}
          {activeTab === 'exams' && (
            <ExamMonitor />
          )}
          {activeTab === 'results' && (
            <div className="bg-white p-6 rounded-lg shadow text-center text-gray-500">Results Center Component Placeholder</div>
          )}
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;