import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Register from './components/Register';
import FacultyDashboard from './components/FacultyDashboard';
import StudentDashboard from './components/StudentDashboard';
import ExamTaking from './components/ExamTaking';

function App() {
  const [user, setUser] = useState(null);
  const [showRegister, setShowRegister] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      // Verify token and set user
      // For simplicity, we'll assume the token is valid
      const role = JSON.parse(atob(token.split('.')[1])).role;
      setUser({ role });
    }
  }, []);

  const handleLogin = (role) => {
    setUser({ role });
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  const handleRegister = () => {
    setShowRegister(false);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            AlphaGrade
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Exam Management System
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
            <div className="flex justify-center space-x-4 mb-6">
              <button
                onClick={() => setShowRegister(false)}
                className={`py-2 px-4 rounded-md ${!showRegister ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700'}`}
              >
                Login
              </button>
              <button
                onClick={() => setShowRegister(true)}
                className={`py-2 px-4 rounded-md ${showRegister ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700'}`}
              >
                Register
              </button>
            </div>

            {showRegister ? (
              <div>
                <div className="flex justify-center space-x-4 mb-6">
                  <button
                    onClick={() => setShowRegister(true)}
                    className="py-2 px-4 rounded-md bg-indigo-600 text-white"
                  >
                    Faculty
                  </button>
                  <button
                    onClick={() => setShowRegister(true)}
                    className="py-2 px-4 rounded-md bg-indigo-600 text-white"
                  >
                    Student
                  </button>
                </div>
                <Register onRegister={handleRegister} role="faculty" />
              </div>
            ) : (
              <div>
                <div className="flex justify-center space-x-4 mb-6">
                  <button
                    onClick={() => setShowRegister(false)}
                    className="py-2 px-4 rounded-md bg-indigo-600 text-white"
                  >
                    Faculty Login
                  </button>
                  <button
                    onClick={() => setShowRegister(false)}
                    className="py-2 px-4 rounded-md bg-indigo-600 text-white"
                  >
                    Student Login
                  </button>
                </div>
                <Login onLogin={handleLogin} role="faculty" />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <div className="min-h-screen bg-gray-100">
        <nav className="bg-white shadow">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex">
                <div className="flex-shrink-0 flex items-center">
                  <h1 className="text-xl font-bold text-gray-900">AlphaGrade</h1>
                </div>
              </div>
              <div className="flex items-center">
                <button
                  onClick={handleLogout}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </nav>

        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" />} />
          <Route
            path="/dashboard"
            element={
              user.role === 'faculty' ? <FacultyDashboard /> : <StudentDashboard />
            }
          />
          <Route path="/exam/:examId" element={<ExamTaking />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
