import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';

const FacultyExamResults = () => {
  const { examId } = useParams();
  const navigate = useNavigate();
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedSubmission, setSelectedSubmission] = useState(null);

  useEffect(() => {
    const fetchResults = async () => {
      try {
        const { data } = await api.get(`/exams/${examId}/results`);
        setResults(data);
      } catch (err) {
        setError('Failed to fetch results.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchResults();
  }, [examId]);

  const handleReevaluate = async (studentId) => {
    if (!window.confirm("Are you sure you want to re-evaluate this student? This will overwrite existing marks.")) return;
    
    try {
      setLoading(true);
      await api.post(`/exams/${examId}/evaluate/${studentId}`, {}, { timeout: 120000 });
      
      // Refresh results
      const { data } = await api.get(`/exams/${examId}/results`);
      setResults(data);
      alert("Re-evaluation complete.");
    } catch (err) {
      console.error(err);
      setError('Failed to re-evaluate student.');
    } finally {
      setLoading(false);
    }
  };

  const downloadExcel = () => {
    if (results.length === 0) return;

    // Create CSV content
    const headers = ['Student Name', 'Email', 'Enrollment No', 'Total Score', 'Status', 'Submitted At'];
    const rows = results.map(r => {
      const passMark = r.examId?.passMarks ?? 0;
      return [
        r.studentId?.name || 'Unknown',
        r.studentId?.email || '',
        r.studentId?.enrollmentNumber || '',
        r.totalScore,
        r.totalScore >= passMark ? 'Pass' : 'Fail',
        new Date(r.submittedAt).toLocaleString()
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(e => e.join(','))
    ].join('\n');

    // Trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `exam_results_${examId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) return <div className="p-8 text-center">Loading results...</div>;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;

  return (
    <div className="max-w-7xl mx-auto py-10 px-4 sm:px-6 lg:px-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Exam Results</h1>
        <div className="flex gap-4">
          <button onClick={downloadExcel} className="btn-primary bg-green-600 hover:bg-green-700">
            Download Excel
          </button>
          <button onClick={() => navigate('/dashboard')} className="btn-secondary">
            Back to Dashboard
          </button>
        </div>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Score</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Submitted At</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Re-evaluate</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {results.length === 0 ? (
              <tr><td colSpan="5" className="px-6 py-4 text-center text-gray-500">No results found.</td></tr>
            ) : (
              results.map((result) => {
                const passMark = result.examId?.passMarks ?? 0;
                const isPassed = result.totalScore >= passMark;
                return (
                  <tr key={result._id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{result.studentId?.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{result.studentId?.email}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-bold">{result.totalScore}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${isPassed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {isPassed ? 'Pass' : 'Fail'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(result.submittedAt).toLocaleString()}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <button 
                      onClick={() => setSelectedSubmission(result)}
                      className="text-indigo-600 hover:text-indigo-900 font-medium"
                    >
                      View Details
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <button 
                      onClick={() => handleReevaluate(result.studentId._id)}
                      className="text-orange-600 hover:text-orange-900 font-medium"
                    >
                      Re-evaluate
                    </button>
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Detailed Result Modal */}
      {selectedSubmission && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
          <div className="relative bg-white rounded-lg shadow-xl max-w-4xl w-full m-4 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-6 border-b">
              <div>
                <h3 className="text-xl font-bold text-gray-900">
                  {selectedSubmission.studentId?.name || 'Student'}'s Result
                </h3>
                <p className="text-sm text-gray-500">
                  Total Score: {selectedSubmission.totalScore}
                </p>
              </div>
              <button 
                onClick={() => setSelectedSubmission(null)}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
              >
                &times;
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              <div className="space-y-6">
                {selectedSubmission.answers.map((ans, idx) => (
                  <div key={idx} className="border rounded-lg p-4 bg-gray-50">
                    <div className="flex justify-between mb-2">
                      <span className="font-bold text-gray-700">Question {idx + 1}</span>
                      <span className="text-sm font-medium bg-blue-100 text-blue-800 px-2 py-1 rounded">
                        {ans.marksObtained} / {ans.maxMarks} Marks
                      </span>
                    </div>
                    <p className="text-gray-800 mb-3 font-medium">{ans.questionText}</p>
                    <div className="bg-white p-3 rounded border mb-3">
                      <p className="text-sm text-gray-600 mb-1 font-semibold">Student Answer:</p>
                      <p className="text-gray-800 whitespace-pre-wrap">{ans.answer || "No answer provided"}</p>
                    </div>
                    <div className={`p-3 rounded border-l-4 ${ans.marksObtained > 0 ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'}`}>
                      <p className="text-sm text-gray-600 mb-1 font-semibold">AI Feedback:</p>
                      <p className="text-gray-800">{ans.feedback}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="p-6 border-t bg-gray-50 rounded-b-lg flex justify-end">
              <button 
                onClick={() => setSelectedSubmission(null)}
                className="btn-secondary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FacultyExamResults;