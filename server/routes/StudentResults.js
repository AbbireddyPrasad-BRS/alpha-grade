import React, { useState, useMemo } from 'react';

const StudentResults = ({ results, loading, error, onRefresh }) => {
  const [selectedResult, setSelectedResult] = useState(null);

  const sortedResults = useMemo(() => {
    if (!Array.isArray(results)) return [];
    return [...results].sort((a, b) => 
      new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0)
    );
  }, [results]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-extrabold text-gray-900">Exam Performance History</h3>
        <button 
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onRefresh();
          }}
          className="text-xs bg-indigo-100 text-indigo-700 hover:bg-indigo-200 px-4 py-2 rounded-lg font-bold transition-colors"
        >
          🔄 Refresh
        </button>
      </div>

      {loading && <div className="p-12 text-center text-indigo-600 font-medium animate-pulse">Loading your results...</div>}
      
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-center">
          {error}
        </div>
      )}
      
      {!loading && !error && (
        <div className="bg-white shadow-xl rounded-xl overflow-hidden border border-gray-200 animate-fadeIn">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subject</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Score</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {!sortedResults || sortedResults.length === 0 ? (
              <tr><td colSpan="4" className="px-6 py-12 text-center text-gray-500 italic">No exam submissions found in your record.</td></tr>
            ) : (
              sortedResults.map((result) => (
                <tr key={result._id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="text-sm font-black text-gray-900">{result.examId?.subject || result.subject || 'Unknown Subject'}</div>
                    <div className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mt-1">Date: {result.submittedAt || result.createdAt ? new Date(result.submittedAt || result.createdAt).toLocaleDateString() : 'N/A'}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-bold text-indigo-600">
                        {result.isEvaluated ? `${Number(result.totalScore || 0).toFixed(1)} / ${result.examId?.maxMarks || '?'}` : 'Pending Evaluation'}
                      </div>
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                        !result.isEvaluated ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
                        Number(result.totalScore || 0) >= (result.examId?.passMarks || result.passMarks || 40) ? 'bg-green-100 text-green-800 border-green-200' : 'bg-red-100 text-red-800 border-red-200'
                      }`}>
                        {!result.isEvaluated ? 'PENDING' : Number(result.totalScore || 0) >= (result.examId?.passMarks || result.passMarks || 40) ? 'PASS' : 'FAIL'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {result.isEvaluated ? (
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        Number(result.totalScore || 0) >= (result.examId?.passMarks || result.passMarks || 40) 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                      }`}>
                        {Number(result.totalScore || 0) >= (result.examId?.passMarks || result.passMarks || 40) ? 'PASS' : 'FAIL'}
                      </span>
                    ) : (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800 animate-pulse">
                        EVALUATING
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <button 
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        setSelectedResult(result);
                      }}
                      className="bg-indigo-600 text-white px-3 py-1 rounded text-xs font-bold hover:bg-indigo-700 transition-colors"
                    >
                      View Responses
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      )}

      {selectedResult && (
        <div className="fixed inset-0 bg-black bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b flex justify-between items-center bg-gray-900 text-white">
              <h2 className="text-xl font-black">Detailed Responses: {selectedResult.examId?.subject || selectedResult.subject}</h2>
              <button 
                type="button"
                onClick={() => setSelectedResult(null)} 
                className="text-gray-400 hover:text-gray-600 text-3xl font-light">&times;</button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white border p-4 rounded-lg shadow-sm">
                <div className="text-center border-r last:border-0">
                  <p className="text-[10px] text-gray-400 uppercase font-black">Obtained Marks</p>
                  <div className="flex items-center justify-center gap-2">
                    <p className="text-2xl font-black text-indigo-600">{Number(selectedResult.totalScore || 0).toFixed(1)} / {selectedResult.examId?.maxMarks || '?'}</p>
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                      !selectedResult.isEvaluated ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
                      Number(selectedResult.totalScore || 0) >= (selectedResult.examId?.passMarks || selectedResult.passMarks || 40) ? 'bg-green-100 text-green-800 border-green-200' : 'bg-red-100 text-red-800 border-red-200'
                    }`}>
                      {!selectedResult.isEvaluated ? 'PENDING' : Number(selectedResult.totalScore || 0) >= (selectedResult.examId?.passMarks || selectedResult.passMarks || 40) ? 'PASS' : 'FAIL'}
                    </span>
                  </div>
                </div>
                <div className="text-center border-r last:border-0">
                  <p className="text-xs text-gray-500 uppercase font-bold">Status</p>
                  <p className={`text-2xl font-black ${Number(selectedResult.totalScore || 0) >= (selectedResult.examId?.passMarks || selectedResult.passMarks || 40) ? 'text-green-600' : 'text-red-600'}`}>
                    {Number(selectedResult.totalScore || 0) >= (selectedResult.examId?.passMarks || selectedResult.passMarks || 40) ? 'PASS' : 'FAIL'}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500 uppercase font-bold">Submission Time</p>
                  <p className="text-sm font-medium text-gray-700 mt-2">{selectedResult.submittedAt || selectedResult.createdAt ? new Date(selectedResult.submittedAt || selectedResult.createdAt).toLocaleString() : 'N/A'}</p>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-black text-gray-800 text-lg border-l-4 border-indigo-600 pl-3">Question-wise Breakdown</h4>
                {selectedResult.answers?.map((ans, idx) => (
                  <div key={idx} className="p-5 border rounded-xl bg-gray-50 hover:bg-white transition-colors border-gray-200">
                    <p className="font-bold text-gray-900 mb-3">Q{idx + 1}: {ans.questionText}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                      <div className="bg-white p-3 rounded border">
                        <p className="text-gray-500 font-bold mb-1 uppercase text-[10px]">Your Answer:</p>
                        <p className="text-gray-800 italic leading-relaxed">{ans.answer}</p>
                      </div>
                      <div className="bg-indigo-50 p-3 rounded border border-indigo-100">
                        <div className="flex justify-between items-center mb-2">
                          <p className="text-indigo-900 font-bold uppercase text-[10px]">AI Evaluation:</p>
                          <span className="bg-indigo-600 text-white px-2 py-0.5 rounded text-xs font-bold">{ans.marksObtained} / {ans.maxMarks}</span>
                        </div>
                        <p className="text-indigo-800 leading-relaxed">{ans.feedback || 'No feedback provided.'}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentResults;