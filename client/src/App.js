import React, { useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import AuthPage from './components/AuthPage';
import FacultyDashboard from './components/FacultyDashboard';
import StudentDashboard from './components/StudentDashboard';
import ExamTaking from './components/ExamTaking';
import AdminDashboard from './components/AdminDashboard';
import ExamResult from './components/ExamResult';
import CreateExam from './components/CreateExam';
import FacultyExamResults from './components/FacultyExamResults';
import { SocketProvider } from './contexts/SocketContext';
import { useAuth } from './contexts/AuthContext';
import api from './services/api';
import { socket } from './socket';

// A more robust ProtectedRoute component
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex justify-center items-center h-screen">Loading...</div>;
  }

  if (!user) {
    // If not logged in, redirect to the sign-in page
    return <Navigate to="/signin" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // If logged in but with the wrong role, redirect to their dashboard
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

function App() {
  const { user, loading, logout } = useAuth();

  useEffect(() => {
    // 1. Handle Socket Authentication Errors
    const onConnectError = (err) => {
      if (err.message === 'Authentication error' || err.message === 'invalid signature') {
        logout();
      }
    };
    socket.on('connect_error', onConnectError);

    // 2. Handle API 401/403 Errors (Invalid Token)
    const interceptor = api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
          logout();
        }
        return Promise.reject(error);
      }
    );

    return () => {
      socket.off('connect_error', onConnectError);
      api.interceptors.response.eject(interceptor);
    };
  }, [logout]);

  if (loading) {
    return <div className="flex justify-center items-center h-screen">Loading...</div>;
  }

  return (
    <Router>
      <SocketProvider user={user}>
        {user && (
          <nav className="bg-white shadow sticky top-0 z-40">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between h-16">
                <div className="flex items-center">
                  <h1 className="text-xl font-bold text-gray-900">AlphaGrade</h1>
                </div>
                <div className="flex items-center">
                  <span className="text-gray-600 mr-4">Welcome, {user.name} ({user.role})</span>
                  <button onClick={logout} className="btn-secondary">
                    Logout
                  </button>
                </div>
              </div>
            </div>
          </nav>
        )}

        <Routes>
          {!user ? (
            <>
              <Route path="/signin" element={<AuthPage />} />
              <Route path="/register" element={<AuthPage />} />
              <Route path="*" element={<Navigate to="/signin" replace />} />
            </>
          ) : (
            <>
              {/* Authenticated Routes */}
              <Route path="/dashboard" element={
                user.role === 'Admin' ? <AdminDashboard /> : 
                user.role === 'Faculty' ? <FacultyDashboard /> : 
                <StudentDashboard />
              } />
              
              {/* Student-only routes */}
              <Route path="/exam/:examId" element={<ProtectedRoute allowedRoles={['Student']}><ExamTaking /></ProtectedRoute>} />
              <Route path="/exam/:examId/result" element={<ProtectedRoute allowedRoles={['Student']}><ExamResult /></ProtectedRoute>} />
              
              {/* Faculty/Admin routes */}
              <Route path="/faculty/create-exam" element={<ProtectedRoute allowedRoles={['Faculty', 'Admin']}><CreateExam /></ProtectedRoute>} />
              <Route path="/faculty/edit-exam/:examId" element={<ProtectedRoute allowedRoles={['Faculty', 'Admin']}><CreateExam /></ProtectedRoute>} />
              <Route path="/faculty/exam/:examId/results" element={<ProtectedRoute allowedRoles={['Faculty', 'Admin']}><FacultyExamResults /></ProtectedRoute>} />

              {/* Redirect root and signin to dashboard if logged in */}
              <Route path="/signin" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </>
          )}
        </Routes>
      </SocketProvider>
    </Router>
  );
}

export default App;