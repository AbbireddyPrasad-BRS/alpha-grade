import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const StudentExamAccess = () => {
  const [examCode, setExamCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/exams/access', { examCode, password });
      // Redirect directly to the exam room
      navigate(`/exam/${data._id}`);
    } catch (err) {
      // Specifically handle 400 to prevent global logout interceptors from triggering
      if (err.response?.status === 400) {
        setError(err.response.data.message || 'Incorrect exam password.');
      } else {
        setError(err.response?.data?.message || 'Invalid credentials. Please check Exam ID.');
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-lg shadow-md">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Student Exam Login
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Enter the credentials provided by your invigilator
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <input
                type="text"
                required
                className="appearance-none rounded-none rounded-t-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Exam ID (Code)"
                value={examCode}
                onChange={(e) => setExamCode(e.target.value.toUpperCase())}
              />
              <input
                type="password"
                required
                className="appearance-none rounded-none rounded-b-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Exam Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && <div className="text-red-500 text-sm text-center font-medium">{error}</div>}

          <div>
            <button
              type="submit"
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Join Exam
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default StudentExamAccess;