import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSocket } from '../contexts/SocketContext';
import api from '../services/api';

const ExamLobby = () => {
  const { examId } = useParams();
  const navigate = useNavigate();
  const socket = useSocket();
  const [exam, setExam] = useState(null);
  const [status, setStatus] = useState('Connecting to waiting room...');

  useEffect(() => {
    // Fetch exam details to display
    const fetchExamData = async () => {
        try {
          const { data } = await api.get(`/exams/${examId}`);
          if (data) {
            setExam(data);
          } else {
            setStatus('Exam not found.');
          }
        } catch (error) {
          console.error("Lobby fetch error:", error);
          setStatus('Failed to load exam details. Please try joining again.');
        }
      };
      fetchExamData();
  }, [examId]); 

  useEffect(() => {
    // Connect to socket immediately if we have the exam metadata
    // The waiting room is for waiting BEFORE the exam starts
    if (socket && exam && exam._id) {
      // Join the lobby and notify the backend
      socket.emit('student:join-lobby', { examId });
      setStatus('You are in the waiting room. Please wait for the faculty to admit you.');

      // Listen for admission
      const handleAdmission = () => {
        setStatus('You have been admitted! Starting the exam...');
        setTimeout(() => navigate(`/exam/${examId}`), 2000);
      };

      const handleKicked = () => {
        setStatus('You have been removed from the waiting room by the faculty.');
        // Redirect back to dashboard after a delay
        setTimeout(() => navigate('/dashboard', { state: { message: 'Removed from lobby.' } }), 3000);
      };

      socket.on('student:admitted', handleAdmission);
      socket.on('student:kicked', handleKicked);

      return () => {
        socket.off('student:admitted', handleAdmission);
        socket.off('student:kicked', handleKicked);
      };
    }
  }, [socket, examId, navigate, exam]); 

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <div className="max-w-2xl w-full bg-white p-8 rounded-lg shadow-lg text-center">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">
          Exam Lobby
        </h1>
        <h2 className="text-xl text-indigo-600 font-semibold mb-6">{exam?.subject}</h2>
        <p className="text-gray-600 text-lg mb-8">{status}</p>
        <div className="animate-pulse text-gray-400">Waiting...</div>
      </div>
    </div>
  );
};

export default ExamLobby;