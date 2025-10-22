import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import io from 'socket.io-client';
import axios from 'axios';

const ExamTaking = () => {
  const { examId } = useParams();
  const [exam, setExam] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(3600); // 1 hour in seconds
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    fetchExam();
    // const newSocket = io('http://localhost:5000');
    // setSocket(newSocket);

    // return () => newSocket.close();
  }, [examId]);

  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      submitExam();
    }
  }, [timeLeft]);

  const fetchExam = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`http://localhost:5000/api/student/exam/${examId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setExam(response.data);
    } catch (err) {
      console.error('Failed to fetch exam', err);
    }
  };

  const handleAnswerChange = (questionIndex, answer) => {
    setAnswers({ ...answers, [questionIndex]: answer });
  };

  const submitExam = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`http://localhost:5000/api/student/submit-exam/${examId}`, { answers }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert('Exam submitted successfully!');
      window.location.href = '/dashboard';
    } catch (err) {
      console.error('Failed to submit exam', err);
    }
  };

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!exam) return <div>Loading...</div>;

  const question = exam.questions[currentQuestion];

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="py-10">
        <header>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center">
              <h1 className="text-3xl font-bold leading-tight text-gray-900">{exam.title}</h1>
              <div className="text-xl font-semibold text-red-600">
                Time Left: {formatTime(timeLeft)}
              </div>
            </div>
          </div>
        </header>
        <main>
          <div className="max-w-7xl mx-auto sm:px-6 lg:px-8">
            <div className="px-4 py-8 sm:px-0">
              <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <div className="mb-4">
                    <span className="text-sm text-gray-500">Question {currentQuestion + 1} of {exam.questions.length}</span>
                  </div>
                  <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">{question.question}</h3>
                  <div className="space-y-2">
                    {question.options.map((option, index) => (
                      <div key={index} className="flex items-center">
                        <input
                          id={`option-${index}`}
                          name={`question-${currentQuestion}`}
                          type="radio"
                          className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300"
                          value={option}
                          checked={answers[currentQuestion] === option}
                          onChange={() => handleAnswerChange(currentQuestion, option)}
                        />
                        <label htmlFor={`option-${index}`} className="ml-3 block text-sm font-medium text-gray-700">
                          {option}
                        </label>
                      </div>
                    ))}
                  </div>
                  <div className="mt-6 flex justify-between">
                    <button
                      onClick={() => setCurrentQuestion(Math.max(0, currentQuestion - 1))}
                      disabled={currentQuestion === 0}
                      className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded disabled:opacity-50"
                    >
                      Previous
                    </button>
                    {currentQuestion < exam.questions.length - 1 ? (
                      <button
                        onClick={() => setCurrentQuestion(currentQuestion + 1)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded"
                      >
                        Next
                      </button>
                    ) : (
                      <button
                        onClick={submitExam}
                        className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
                      >
                        Submit Exam
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default ExamTaking;
