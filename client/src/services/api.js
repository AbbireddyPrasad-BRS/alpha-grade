import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
});

// Interceptor to add the auth token to every request
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// --- Auth Service ---
export const registerUser = (userData) => api.post('/auth/register', userData);
export const loginUser = (credentials) => api.post('/auth/login', credentials);

// --- Exam Service ---
export const createExam = (examData) => api.post('/exams', examData);
export const getMyExams = () => api.get('/exams/my-exams');
export const getExamById = (examId) => api.get(`/exams/${examId}`);
export const submitExam = (examId, answers) => api.post(`/exams/${examId}/submit`, { answers });

export const getStudentResults = () => api.get('/exams/my-results');
// You can add updateExam and deleteExam here as well, following the new API structure.

export default api;
