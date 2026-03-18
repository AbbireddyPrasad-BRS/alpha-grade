import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Login from './Login';
import Register from './Register';
import api from '../services/api';

const AuthPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const showRegister = location.pathname.includes('/register');
  const [selectedRole, setSelectedRole] = useState('Faculty');
  const [adminExists, setAdminExists] = useState(false);

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const { data } = await api.get('/auth/admin-exists');
        setAdminExists(data.exists);
      } catch (error) {
        console.error("Error checking admin existence:", error);
      }
    };
    checkAdmin();
  }, []);

  useEffect(() => {
    if (showRegister && adminExists && selectedRole === 'Admin') {
      setSelectedRole('Faculty');
    }
  }, [showRegister, adminExists, selectedRole]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-indigo-600 mb-2">AlphaGrade</h1>
          <p className="text-lg text-gray-600">Exam Management System</p>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-xl rounded-lg sm:px-10">
          <div className="flex justify-center mb-8">
            <div className="bg-gray-100 p-1 rounded-lg">
              <button type="button" onClick={() => navigate('/signin')} className={`py-2 px-6 rounded-md font-medium transition-colors ${!showRegister ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-600 hover:text-gray-800'}`}>
                Login
              </button>
              <button type="button" onClick={() => navigate('/register')} className={`py-2 px-6 rounded-md font-medium transition-colors ${showRegister ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-600 hover:text-gray-800'}`}>
                Register
              </button>
            </div>
          </div>

          <div className="flex justify-center mb-6">
            <div className="bg-gray-100 p-1 rounded-lg">
              <button type="button" onClick={() => setSelectedRole('Faculty')} className={`py-2 px-4 rounded-md font-medium transition-colors ${selectedRole === 'Faculty' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}>
                Faculty
              </button>
              <button type="button" onClick={() => setSelectedRole('Student')} className={`py-2 px-4 rounded-md font-medium transition-colors ${selectedRole === 'Student' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}>
                Student
              </button>
              <button 
                type="button" 
                onClick={() => !((showRegister && adminExists)) && setSelectedRole('Admin')} 
                disabled={showRegister && adminExists}
                className={`py-2 px-4 rounded-md font-medium transition-colors ${selectedRole === 'Admin' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'} ${showRegister && adminExists ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                Admin
              </button>
            </div>
          </div>

          {showRegister ? <Register role={selectedRole} /> : <Login role={selectedRole} />}
        </div>
      </div>
    </div>
  );
};

export default AuthPage;