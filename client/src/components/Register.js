import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { registerUser } from '../services/api'; // Import the new api service function
import { useAuth } from '../contexts/AuthContext';

const Register = ({ role }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // Include the role in the data sent to the unified endpoint
      const userData = { 
        ...formData, 
        role,
        ...(role === 'Faculty' ? { 
          canCreateExam: false, 
          canEvaluate: false, 
          canDeleteExam: false,
        } : {
          canTakeExam: false
        })
      };
      const { data } = await registerUser(userData);
      
      setSuccess('Registration successful! Logging you in...');

      // Automatically log the user in after successful registration
      setTimeout(() => {
        localStorage.setItem('token', data.token);
        login(data.user); // This will update context and redirect to dashboard
      }, 1000);
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // When switching roles, reset form and messages
  useEffect(() => {
    setFormData({ name: '', email: '', password: '' });
    setError('');
    setSuccess('');
  }, [role]);

  return (
    <div>
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">
          Register as {role}
        </h2>
        <p className="text-gray-600 mt-1">Create your account to get started</p>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
            Full Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            className="appearance-none relative block w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            placeholder="Enter your full name"
            value={formData.name}
            onChange={handleChange}
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
            Email Address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="appearance-none relative block w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            placeholder="Enter your email"
            value={formData.email}
            onChange={handleChange}
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            className="appearance-none relative block w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            placeholder="Create a password"
            value={formData.password}
            onChange={handleChange}
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md text-sm">
            {success}
          </div>
        )}

        <div>
          <button
            type="submit"
            disabled={loading}
            className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </div>
      </form>

      <div className="text-sm text-center mt-6">
        <p className="text-gray-600">
          Already have an account?{' '}
          <Link to="/signin" className="font-medium text-indigo-600 hover:text-indigo-500 focus:outline-none">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Register;
