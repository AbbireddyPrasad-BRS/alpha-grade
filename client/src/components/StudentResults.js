import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const StudentResults = () => {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchResults = async () => {
      try {
        const response = await api.get('/exams/my-results');
        setResults(response.data);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to fetch results.');
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, []);

  if (loading) return <div className="p-8 text-center">Loading your results...</div>;
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>;

  return (
    <div className="min-h-screen bg-gray-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">My Exam Results</h1>
            <p className="text-gray-600 mt-1">Overview of all your submitted and evaluated exams.</p>
          </div>
          <button 
            onClick={() => navigate('/dashboard')}
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-indigo-700 transition-all shadow-md active:scale-95"
          >
            Back to Dashboard
          </button>
        </div>

        <div className="bg-white shadow-xl rounded-2xl overflow-hidden border border-gray-200">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Subject</th>
                  <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Submission Date</th>
                  <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Score</th>
                  <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Status</th>
                  <th className="px-6 py-4 text-right text-xs font-black text-gray-500 uppercase tracking-widest">Details</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {results.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center">
                        <span className="text-4xl mb-4">📊</span>
                        <p className="text-gray-500 font-medium">No exam results found yet.</p>
                        <p className="text-gray-400 text-sm">Once you complete an exam, your results will appear here.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  results.map((res) => {
                    const exam = res.examId;
                    const isEvaluated = res.isEvaluated;
                    const passMarks = exam?.passMarks || 40; // Default pass marks if missing
                    const passed = res.totalScore >= passMarks;

                    return (
                      <tr key={res._id} className="hover:bg-indigo-50/30 transition-colors group">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-bold text-indigo-700">{exam?.subject || 'Unknown Subject'}</div>
                          <div className="text-[10px] text-gray-400 font-mono">ID: {res._id.slice(-8).toUpperCase()}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-600">
                            {new Date(res.submittedAt || res.createdAt).toLocaleDateString(undefined, { 
                              year: 'numeric', 
                              month: 'short', 
                              day: 'numeric' 
                            })}
                          </div>
                          <div className="text-[10px] text-gray-400">
                            {new Date(res.submittedAt || res.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {isEvaluated ? (
                            <div className="flex items-baseline gap-1">
                              <span className="text-lg font-black text-gray-800">{res.totalScore}</span>
                              <span className="text-xs text-gray-400">/ {exam?.maxMarks || 0}</span>
                            </div>
                          ) : (
                            <span className="text-sm font-bold text-orange-500 italic">Pending...</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {isEvaluated ? (
                            <span className={`px-3 py-1 inline-flex text-[10px] font-black rounded-full border ${
                              passed 
                                ? 'bg-green-50 text-green-700 border-green-200' 
                                : 'bg-red-50 text-red-700 border-red-200'
                            }`}>
                              {passed ? 'PASSED' : 'FAILED'}
                            </span>
                          ) : (
                            <span className="px-3 py-1 inline-flex text-[10px] font-black rounded-full bg-blue-50 text-blue-700 border border-blue-200 animate-pulse">
                              EVALUATING
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <button 
                            onClick={() => navigate(`/result/${exam?._id || res.examId}`)}
                            className="text-indigo-600 hover:text-indigo-900 font-bold text-sm bg-indigo-50 px-3 py-1 rounded-md transition-colors group-hover:bg-indigo-100"
                          >
                            View Analysis
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentResults;