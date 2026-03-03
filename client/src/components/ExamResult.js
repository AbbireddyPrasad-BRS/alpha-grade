import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';

const ExamResult = () => {
  const { examId } = useParams();
  const navigate = useNavigate();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchResult = async () => {
      try {
        const response = await api.get(`/exams/${examId}/result`);
        setResult(response.data);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to fetch results.');
      } finally {
        setLoading(false);
      }
    };

    fetchResult();
  }, [examId]);

  if (loading) return <div className="p-8 text-center">Loading results...</div>;
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>;
  if (!result) return <div className="p-8 text-center">No result found.</div>;

  const { examId: examDetails, totalScore, isEvaluated, answers } = result;
  // Handle case where examDetails might be just an ID or populated object
  const subject = examDetails?.subject || 'Exam Result';
  const maxMarks = examDetails?.maxMarks || 0;
  const passMarks = examDetails?.passMarks || 0;
  
  const passed = totalScore >= passMarks;

  return (
    <div className="min-h-screen bg-gray-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow-lg rounded-lg overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-indigo-600 text-white">
            <h1 className="text-2xl font-bold">{subject} - Results</h1>
            <button onClick={() => navigate('/dashboard')} className="text-sm bg-indigo-500 hover:bg-indigo-700 px-3 py-1 rounded">
              Back to Dashboard
            </button>
          </div>
          
          <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-gray-500 text-sm">Total Score</p>
              <div className="flex items-center justify-center gap-2">
                <p className="text-3xl font-bold text-gray-800">
                  {isEvaluated ? totalScore : 'Pending'} 
                  <span className="text-sm text-gray-400 font-normal"> / {maxMarks}</span>
                </p>
                {isEvaluated && (
                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${passed ? 'bg-green-100 text-green-800 border-green-200' : 'bg-red-100 text-red-800 border-red-200'}`}>
                    {passed ? 'PASS' : 'FAIL'}
                  </span>
                )}
              </div>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-gray-500 text-sm">Status</p>
              <p className={`text-xl font-bold ${isEvaluated ? (passed ? 'text-green-600' : 'text-red-600') : 'text-yellow-600'}`}>
                {isEvaluated ? (passed ? 'PASSED' : 'FAILED') : 'Evaluation in Progress'}
              </p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-gray-500 text-sm">Questions Attempted</p>
              <p className="text-xl font-bold text-gray-800">{answers.length}</p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {answers.map((ans, index) => (
            <div key={index} className="bg-white shadow rounded-lg overflow-hidden border border-gray-200">
              <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex justify-between">
                <h3 className="font-semibold text-gray-800">Question {index + 1}</h3>
                <span className="text-sm font-medium text-gray-600">
                  {isEvaluated ? `${ans.marksObtained} / ${ans.maxMarks} Marks` : `${ans.maxMarks} Marks`}
                </span>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <p className="text-gray-900 font-medium mb-2">{ans.questionText}</p>
                </div>
                
                <div className="bg-blue-50 p-4 rounded-md border-l-4 border-blue-400">
                  <p className="text-xs text-blue-500 font-bold uppercase mb-1">Your Answer</p>
                  <p className="text-gray-800 whitespace-pre-wrap">{ans.answer || <span className="italic text-gray-400">No answer provided</span>}</p>
                </div>

                {isEvaluated && (
                  <div className={`p-4 rounded-md border-l-4 ${ans.marksObtained > 0 ? 'bg-green-50 border-green-400' : 'bg-red-50 border-red-400'}`}>
                    <p className={`text-xs font-bold uppercase mb-1 ${ans.marksObtained > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      Feedback
                    </p>
                    <p className="text-gray-700">{ans.feedback || "No feedback provided."}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ExamResult;