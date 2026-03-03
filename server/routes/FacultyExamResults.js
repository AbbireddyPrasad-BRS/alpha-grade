import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';

const FacultyExamResults = () => {
  const { examId } = useParams();
  const navigate = useNavigate();
  const [results, setResults] = useState([]);
  const [exam, setExam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [resultsRes, examRes] = await Promise.all([
          api.get(`/exams/${examId}/results`),
          api.get(`/exams/${examId}`)
        ]);
        setResults(resultsRes.data);
        setExam(examRes.data);
      } catch (err) {
        setError('Failed to fetch results.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [examId]);

  const downloadExcel = () => {
    if (results.length === 0) return;

    // Create CSV content
    const headers = ['Student Name', 'Email', 'Enrollment No', 'Total Score', 'Status', 'Submitted At'];
    const rows = results.map(r => [
      r.studentId?.name || 'Unknown',
      r.studentId?.email || '',
      r.studentId?.enrollmentNumber || '',
      r.totalScore,
      r.status || 'Pending',
      new Date(r.submittedAt).toLocaleString()
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(e => e.join(','))
    ].join('\n');

    // Trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `results_${exam?.subject || examId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) return <div className="p-8 text-center">Loading results...</div>;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;

  return (
    <div className="max-w-7xl mx-auto py-10 px-4 sm:px-6 lg:px-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Exam Results</h1>
          {exam && <p className="text-lg text-indigo-600 font-medium">Subject: {exam.subject}</p>}
        </div>
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
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {results.length === 0 ? (
              <tr><td colSpan="5" className="px-6 py-4 text-center text-gray-500">No results found.</td></tr>
            ) : (
              results.map((result) => (
                <tr key={result._id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{result.studentId?.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{result.studentId?.email}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-bold">{result.totalScore}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      result.status === 'Pass' ? 'bg-green-100 text-green-800' : 
                      result.status === 'Fail' ? 'bg-red-100 text-red-800' : 
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {result.status || 'Pending'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(result.submittedAt).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FacultyExamResults;