import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api'; // Using the new centralized api service
import { useAuth } from '../contexts/AuthContext';

const CreateExam = () => {
  const navigate = useNavigate();
  const { examId } = useParams(); // For editing
  const { user } = useAuth();
  const isEditing = !!examId;

  const [formData, setFormData] = useState({
    subject: '',
    maxMarks: 30,
    passMarks: 15,
    durationMinutes: 60,
    evaluationMode: 'AI Based Evaluation',
    creationMethod: 'AI',
    numberOfQuestions: 0, // NEW: number of questions
    topics: [{ topic: '', weightage: 50 }], // For AI
    questions: [], // For Manual
    startTime: '',
    facultyID: '',
    examCode: '',
    password: '',
  });
  
  const [aiTopicsInput, setAiTopicsInput] = useState('');
  const [rubricBreakdown, setRubricBreakdown] = useState({}); // Changed from array to object
  const [showRubricModal, setShowRubricModal] = useState(false);
  const [rubricTopic, setRubricTopic] = useState('');
  const [rubricMarks, setRubricMarks] = useState('');
  const [currentRubricQuestionIndex, setCurrentRubricQuestionIndex] = useState(0);
  const [applyRubricToAll, setApplyRubricToAll] = useState(false);
  const [generatedQuestions, setGeneratedQuestions] = useState([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [faculties, setFaculties] = useState([]);

  useEffect(() => {
    if (user?.role === 'Admin') {
      const fetchFaculties = async () => {
        try {
          const { data } = await api.get('/exams/faculties');
          setFaculties(data || []);
        } catch (e) {
          console.error("Failed to fetch faculties", e);
        }
      };
      fetchFaculties();
    }
  }, [user]);

  useEffect(() => {
    if (isEditing) {
      const fetchExamData = async () => {
        setIsLoading(true);
        try {
          const { data } = await api.get(`/exams/${examId}`);
          
          let formattedStartTime = '';
          if (data.startTime) {
            // Properly format the UTC date from server into a local string for the datetime-local input
            const d = new Date(data.startTime);
            const pad = (n) => n.toString().padStart(2, '0');
            formattedStartTime = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
          }

          // Map backend questions to form format
          const mappedQuestions = data.questions 
            ? data.questions.map(q => ({
                question: q.questionID?.text || '',
                maxMarks: q.marks,
                difficulty: q.questionID?.difficulty || 'Medium',
                subject: q.questionID?.domain || '',
                modelAnswer: q.questionID?.modelAnswer || ''
              })) : [];

          setFormData({
            subject: data.subject,
            maxMarks: data.maxMarks,
            passMarks: data.passMarks,
            durationMinutes: data.durationMinutes,
            evaluationMode: data.evaluationMode,
            creationMethod: data.creationMethod,
            numberOfQuestions: data.numberOfQuestions,
            topics: [], // Reset topics as we use aiTopicsInput now
            questions: mappedQuestions,
            startTime: formattedStartTime,
            facultyID: data.facultyID?._id || data.facultyID || '',
            examCode: data.examCode || data.code || data.subjectCode || data.exam_code || '',
            password: data.password || data.examPassword || data.exam_password || '',
          });
          
          if (data.creationMethod === 'AI' && data.topics) {
            setAiTopicsInput(data.topics.map(t => t.topic).join(', '));
          }

          if (data.rubricText) {
            try {
              const parsedRubric = JSON.parse(data.rubricText);
              if (typeof parsedRubric === 'object' && parsedRubric !== null) {
                setRubricBreakdown(parsedRubric);
              } else {
                setRubricBreakdown({});
              }
            } catch (e) {
              console.warn("Could not parse rubricText from DB, initializing as empty.");
              setRubricBreakdown({});
            }
          } else {
            setRubricBreakdown({});
          }
        } catch (err) {
          setError('Failed to load exam data.');
        } finally {
          setIsLoading(false);
        }
      };
      fetchExamData();
    }
  }, [isEditing, examId]);

  // Persistence: Load from localStorage
  useEffect(() => {
    if (!isEditing) {
      const saved = localStorage.getItem('examFormData');
      if (saved) {
        try {
          setFormData(prev => ({ ...prev, ...JSON.parse(saved) }));
        } catch (e) { console.error("Failed to parse saved form data"); }
      }
    }
  }, [isEditing]);

  // Persistence: Save to localStorage
  useEffect(() => {
    if (!isEditing) {
      localStorage.setItem('examFormData', JSON.stringify(formData));
    }
  }, [formData, isEditing]);

  // // Check Llama 3 connection status
  // useEffect(() => {
  //   const checkLlama = async () => {
  //     try {
  //       const res = await fetch('http://localhost:11434/api/tags');
  //       if (res.ok) {
  //         setLlamaStatus('connected');
  //         console.log('llama3 connected');
  //       } else {
  //         setLlamaStatus('disconnected');
  //         console.log('llama3 not connected');
  //       }
  //     } catch (err) {
  //       setLlamaStatus('disconnected');
  //       console.log('llama3 not connected');
  //     }
  //   };
  //   checkLlama();
  // }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    // Validate Subject
    if (!formData.subject.trim()) {
      setError('Subject is required.');
      setIsLoading(false);
      return;
    }

    // Validate Start Time
    if (!formData.startTime) {
      setError('Start Date & Time is required.');
      setIsLoading(false);
      return;
    }

    // Validate Faculty Selection for Admin
    if (user?.role === 'Admin' && !formData.facultyID) {
      setError('Please assign a faculty member for this exam.');
      setIsLoading(false);
      return;
    }

    // Validate positive values
    if (Number(formData.maxMarks) <= 0) {
      setError('Max Marks must be greater than 0.');
      setIsLoading(false);
      return;
    }
    if (Number(formData.passMarks) <= 0) {
      setError('Pass Marks must be greater than 0.');
      setIsLoading(false);
      return;
    }
    if (Number(formData.durationMinutes) <= 0) {
      setError('Duration must be greater than 0.');
      setIsLoading(false);
      return;
    }
    if (Number(formData.numberOfQuestions) <= 0) {
      setError('Number of Questions must be greater than 0.');
      setIsLoading(false);
      return;
    }

    // Validate Pass Marks < Max Marks
    if (Number(formData.passMarks) >= Number(formData.maxMarks)) {
      setError('Pass Marks must be less than Max Marks.');
      setIsLoading(false);
      return;
    }

    // Validate Rubric configuration
    if (formData.evaluationMode === 'Rubric Based Evaluation') {
      for (let i = 0; i < formData.questions.length; i++) {
        const question = formData.questions[i];
        const questionMaxMarks = Number(question.maxMarks) || 0;
        const rubricForQuestion = rubricBreakdown[i] || [];

        if (rubricForQuestion.length === 0) {
          setError(`Please configure the rubric breakdown for Question ${i + 1}.`);
          setIsLoading(false);
          return;
        }

        const rubricSum = rubricForQuestion.reduce((sum, item) => sum + Number(item.marks), 0);
        if (rubricSum !== questionMaxMarks) {
          setError(`Rubric marks for Question ${i + 1} (Total: ${rubricSum}) do not match the question's total marks (${questionMaxMarks}).`);
          setIsLoading(false);
          return;
        }
      }
    }

    // Validation for AI method now checks if questions are selected
    if (formData.creationMethod === 'AI') {
      if (formData.questions.length === 0) {
        setError('Please generate and select at least one question.');
        setIsLoading(false);
        return;
      }
    }

    // Manual validation: require exactly numberOfQuestions questions
    if (formData.creationMethod === 'Manual') {
      if (!Array.isArray(formData.questions) || formData.questions.length === 0) {
        setError('Please add at least one question for manual entry.');
        setIsLoading(false);
        return;
      }
      if (formData.questions.length !== Number(formData.numberOfQuestions)) {
        setError(`Please add exactly ${formData.numberOfQuestions} questions (you have added ${formData.questions.length}).`);
        setIsLoading(false);
        return;
      }
      for (let i = 0; i < formData.questions.length; i++) {
        if (!formData.questions[i].question.trim()) {
          setError(`Question ${i + 1} text is required.`);
          setIsLoading(false);
          return;
        }
      }
    }

    // Validate Sum of Marks (Applies to both AI and Manual)
    // Ensure questions exist before checking sum (handled by previous checks, but safe to keep)
    const totalQuestionMarks = formData.questions.reduce((sum, q) => sum + (Number(q.maxMarks) || 0), 0);
    if (formData.questions.length > 0 && totalQuestionMarks !== Number(formData.maxMarks)) {
      setError(`Total of question marks (${totalQuestionMarks}) must equal Max Marks (${formData.maxMarks}).`);
      setIsLoading(false);
      return;
    }

   try {
      const payload = new FormData();
      payload.append('subject', formData.subject);
      payload.append('maxMarks', String(formData.maxMarks));
      payload.append('passMarks', String(formData.passMarks));
      payload.append('durationMinutes', String(formData.durationMinutes));
      payload.append('evaluationMode', formData.evaluationMode);
      payload.append('creationMethod', 'Manual'); // Always manual from server's perspective now
      payload.append('numberOfQuestions', String(formData.numberOfQuestions));
      payload.append('questions', JSON.stringify(formData.questions.map(q => ({
        question: q.question,
        maxMarks: Number(q.maxMarks),
        difficulty: q.difficulty,
        subject: q.subject || formData.subject,
        modelAnswer: q.modelAnswer
      }))));
      if (formData.startTime) {
        // Convert the local selection to a standardized UTC ISO string for the database
        const utcStartTime = new Date(formData.startTime).toISOString();
        payload.append('startTime', utcStartTime);
      }
      if (user?.role === 'Admin' && formData.facultyID) {
        payload.append('facultyID', formData.facultyID);
      }
      if (formData.examCode) {
        const cleanCode = formData.examCode.trim().toUpperCase();
        payload.append('examCode', cleanCode);
        payload.append('code', cleanCode); // Backward compatibility
      }
      if (formData.password) {
        const cleanPass = formData.password.trim();
        payload.append('password', cleanPass);
        payload.append('examPassword', cleanPass); // Backward compatibility
      }
      if (formData.evaluationMode === 'Rubric Based Evaluation') {
        payload.append('rubricText', JSON.stringify(rubricBreakdown));
      }

      const config = {
        headers: { 'Content-Type': 'multipart/form-data' }
      };

      if (isEditing) {
        await api.put(`/exams/${examId}`, payload, config);
        alert('Exam updated successfully!');
      } else {
        await api.post('/exams', payload, config);
        alert('Exam created successfully!');
        localStorage.removeItem('examFormData');
      }
      // Redirect after a short delay to allow the user to see the message
      setTimeout(() => {
        navigate('/dashboard');
      }, 500);
    } catch (err) {
      // Server now returns JSON { message: ... } so show that if present
      setError(err.response?.data?.message || 'An error occurred.');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handlers for Manual questions
  const handleQuestionChange = (index, field, value) => {
    setFormData(prev => {
      const newQuestions = [...prev.questions];
      newQuestions[index] = {
        ...newQuestions[index],
        [field]: field === 'maxMarks' ? Math.max(0, parseInt(value, 10) || 0) : value
      };
      // ensure subject is present
      if (!newQuestions[index].subject) newQuestions[index].subject = prev.subject || '';
      return { ...prev, questions: newQuestions };
    });
  };

  const addQuestionManual = () => {
  const max = Number(formData.numberOfQuestions) || 0;
  const current = formData.questions.length || 0;
  if (max > 0 && current >= max) {
    // Optionally show an inline message instead of alert
    setError(`You can add at most ${max} questions.`);
    return;
  }
  setFormData(prev => ({...prev, questions: [...prev.questions, {
    question: '',
    maxMarks: 0,
    subject: prev.subject || '',
    difficulty: 'Medium', // Use capitalized value to match schema
    modelAnswer: '' // Add modelAnswer field
  }]}));
};

  const removeQuestionManual = (index) => {
    const newQuestions = formData.questions.filter((_, i) => i !== index);
    setFormData(prev => ({...prev, questions: newQuestions}));
  };

  // --- AI Integration ---

  const generateQuestionsWithAI = async () => {
    if (!aiTopicsInput.trim()) {
      setError('Please enter topics.');
      return;
    }
    
    setIsLoading(true);
    setError('');
    setGeneratedQuestions([]);

    try {
      const { data } = await api.post('/exams/generate-questions', {
        topics: aiTopicsInput.split(',').map(t => t.trim()).filter(t => t),
        count: formData.numberOfQuestions || 5,
        difficulty: 'Mixed',
        domain: formData.subject
      });

      if (Array.isArray(data)) {
        setGeneratedQuestions(data);
      } else {
        throw new Error('AI response was not a valid list of questions.');
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || err.message || 'Error generating questions with AI.');
    } finally {
      setIsLoading(false);
    }
  };

  const generateManualAnswer = async (index) => {
    const q = formData.questions[index];
    if (!q.question) {
      setError('Please enter the question text first.');
      return;
    }

    setIsLoading(true);
    setError('');

    // Set loading indication in the field
    handleQuestionChange(index, 'modelAnswer', 'Generating answer...');

    try {
      const { data } = await api.post('/exams/generate-answer', {
        questionText: q.question
      });

      const answer = data.modelAnswer ? data.modelAnswer.trim() : '';
      handleQuestionChange(index, 'modelAnswer', answer);
    } catch (err) {
      console.error(err);
      handleQuestionChange(index, 'modelAnswer', '');
      setError('Failed to generate answer with AI.');
    } finally {
      setIsLoading(false);
    }
  };

  const addToSelected = (question, index) => {
    // Check if we exceeded number of questions
    if (formData.questions.length >= formData.numberOfQuestions) {
      setError(`You can only select ${formData.numberOfQuestions} questions.`);
      return;
    }
    
    setFormData(prev => ({
      ...prev,
      questions: [...prev.questions, { ...question, maxMarks: 0 }]
    }));
    
    // Remove from generated list
    const newGenerated = [...generatedQuestions];
    newGenerated.splice(index, 1);
    setGeneratedQuestions(newGenerated);
  };

  const handleAddRubricEntry = () => {
    if (rubricTopic && rubricMarks && rubricMarks > 0) {
      const currentEntries = rubricBreakdown[currentRubricQuestionIndex] || [];
      const newEntry = { topic: rubricTopic, marks: Number(rubricMarks) };
      
      setRubricBreakdown({
        ...rubricBreakdown,
        [currentRubricQuestionIndex]: [...currentEntries, newEntry]
      });

      setRubricTopic('');
      setRubricMarks('');
    }
  };

  const handleRemoveRubricEntry = (entryIndex) => {
    const currentEntries = rubricBreakdown[currentRubricQuestionIndex] || [];
    const updatedEntries = currentEntries.filter((_, i) => i !== entryIndex);
    setRubricBreakdown({
      ...rubricBreakdown,
      [currentRubricQuestionIndex]: updatedEntries
    });
  };

  const handleApplyToAllChange = (e) => {
    const isChecked = e.target.checked;
    setApplyRubricToAll(isChecked);
    if (isChecked && rubricBreakdown[0] && rubricBreakdown[0].length > 0) {
      const firstRubric = JSON.parse(JSON.stringify(rubricBreakdown[0])); // Deep copy
      const newBreakdown = {};
      for (let i = 0; i < formData.numberOfQuestions; i++) {
        newBreakdown[i] = JSON.parse(JSON.stringify(firstRubric)); // Deep copy each
      }
      setRubricBreakdown(newBreakdown);
    }
  };

  if (isLoading && isEditing) return <p>Loading exam data...</p>;

  return (
    <div className="max-w-4xl mx-auto py-10 px-4 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">
        {isEditing ? 'Edit Exam' : 'Create New Exam'}
      </h1>
      <div className="bg-white shadow-lg rounded-lg">
        <form onSubmit={handleSubmit} className="p-8">
          {error && <p className="text-red-500 text-center mb-4">{error}</p>}
          
          {user?.role === 'Admin' && (
            <div className="mb-6 bg-indigo-50 p-4 rounded-lg border border-indigo-100">
              <label htmlFor="facultyID" className="block text-sm font-bold text-indigo-900 mb-2">Assign to Faculty</label>
              <select
                id="facultyID"
                value={formData.facultyID}
                onChange={e => setFormData({...formData, facultyID: e.target.value})}
                className="input-style w-full border-indigo-300 focus:ring-indigo-500"
                required
              >
                <option value="">-- Select Faculty --</option>
                {faculties.map(f => <option key={f._id} value={f._id}>{f.name} ({f.email})</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Subject, Marks, Duration etc. with labels */}
            <div>
              <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
              <input id="subject" name="subject" type="text" placeholder="e.g., Physics" value={formData.subject} onChange={e => setFormData({...formData, subject: e.target.value})} className="input-style" required />
            </div>

            <div>
              <label htmlFor="maxMarks" className="block text-sm font-medium text-gray-700 mb-1">Max Marks</label>
              <input id="maxMarks" name="maxMarks" type="number" min="1" placeholder="100" value={formData.maxMarks} onChange={e => setFormData({...formData, maxMarks: Math.max(0, parseInt(e.target.value) || 0)})} className="input-style" required />
            </div>

            <div>
              <label htmlFor="passMarks" className="block text-sm font-medium text-gray-700 mb-1">Pass Marks</label>
              <input id="passMarks" name="passMarks" type="number" min="0" placeholder="40" value={formData.passMarks} onChange={e => setFormData({...formData, passMarks: Math.max(0, parseInt(e.target.value) || 0)})} className="input-style" required />
            </div>

            <div>
              <label htmlFor="numberOfQuestions" className="block text-sm font-medium text-gray-700 mb-1">Number of Questions</label>
              <input
                id="numberOfQuestions"
                name="numberOfQuestions"
                type="number"
                min={1}
                value={formData.numberOfQuestions}
                onChange={e => setFormData({...formData, numberOfQuestions: Math.max(0, parseInt(e.target.value) || 0)})}
                className="input-style"
                required
              />
            </div>

            <div>
              <label htmlFor="startTime" className="block text-sm font-medium text-gray-700 mb-1">Start Date & Time</label>
              <input
                id="startTime"
                name="startTime"
                type="datetime-local"
                value={formData.startTime}
                onChange={e => setFormData({...formData, startTime: e.target.value})}
                className="input-style"
                required
              />
            </div>

            <div>
              <label htmlFor="durationMinutes" className="block text-sm font-medium text-gray-700 mb-1">Duration (Minutes)</label>
              <input id="durationMinutes" name="durationMinutes" type="number" min="1" placeholder="60" value={formData.durationMinutes} onChange={e => setFormData({...formData, durationMinutes: Math.max(0, parseInt(e.target.value) || 0)})} className="input-style" required />
            </div>
            
            <div>
              <label htmlFor="evaluationMode" className="block text-sm font-medium text-gray-700 mb-1">Evaluation Mode</label>
              <select id="evaluationMode" value={formData.evaluationMode} onChange={e => setFormData({...formData, evaluationMode: e.target.value})} className="input-style">
                <option value="AI Based Evaluation">AI Based Evaluation</option>
                <option value="Rubric Based Evaluation">Rubric Based Evaluation</option>
              </select>
            </div>
            
            <div>
              <label htmlFor="creationMethod" className="block text-sm font-medium text-gray-700 mb-1">Creation Method</label>
              <select id="creationMethod" value={formData.creationMethod} onChange={e => setFormData({...formData, creationMethod: e.target.value})} className="input-style">
                <option value="AI">Generate with AI</option>
                <option value="Manual">Manual Entry</option>
              </select>
            </div>

            <div>
              <label htmlFor="examCode" className="block text-sm font-medium text-gray-700 mb-1">Exam/Subject Code</label>
              <input
                id="examCode"
                name="examCode"
                type="text"
                placeholder="e.g., PHYS101"
                value={formData.examCode}
                onChange={e => setFormData({...formData, examCode: e.target.value.toUpperCase()})}
                className="input-style"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Exam Password</label>
              <input
                id="password"
                name="password"
                type="text"
                placeholder="e.g., secret123"
                value={formData.password}
                onChange={e => setFormData({...formData, password: e.target.value})}
                className="input-style"
                required
              />
            </div>
          </div>

          <hr className="my-8" />

          {/* Conditional UI for AI vs Manual */}
          {formData.creationMethod === 'AI' ? (
            <div>
              <h2 className="text-xl font-semibold mb-4">AI Question Generation</h2>
              
              <div className="mb-6">
                <label htmlFor="aiTopics" className="block text-sm font-medium text-gray-700 mb-1">
                  Topics (separated by commas)
                </label>
                <textarea
                  id="aiTopics"
                  rows={3}
                  className="input-style w-full"
                  placeholder="e.g. Thermodynamics, Newton's Laws, Optics"
                  value={aiTopicsInput}
                  onChange={(e) => setAiTopicsInput(e.target.value)}
                />
              </div>

              <div className="flex gap-4 mb-8">
                <button 
                  type="button" 
                  onClick={generateQuestionsWithAI} 
                  className="btn-primary bg-purple-600 hover:bg-purple-700"
                  disabled={isLoading}
                >
                  {isLoading ? 'Generating...' : (generatedQuestions.length > 0 ? 'Regenerate Questions' : 'Generate Questions')}
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Container 1: Selected Questions */}
                <div className="border rounded-lg p-4 bg-gray-50 min-h-[400px]">
                  <h3 className="font-bold text-lg mb-3 text-green-700">Selected Questions ({formData.questions.length}/{formData.numberOfQuestions})</h3>
                  {formData.questions.length === 0 ? (
                    <p className="text-gray-400 italic">No questions selected yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {formData.questions.map((q, idx) => (
                        <div key={idx} className="bg-white p-3 rounded shadow-sm border border-green-200 relative">
                          <button type="button" onClick={() => removeQuestionManual(idx)} className="absolute top-2 right-2 text-red-500 hover:text-red-700 font-bold">&times;</button>
                          <p className="font-medium text-sm pr-6 mb-2">{q.question}</p>
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              <label htmlFor={`mark-${idx}`} className="text-xs font-medium text-gray-700">Marks:</label>
                              <input
                                id={`mark-${idx}`}
                                type="number"
                                className="w-16 p-1 text-sm border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500"
                                value={q.maxMarks}
                                onChange={(e) => handleQuestionChange(idx, 'maxMarks', e.target.value)}
                                min="0"
                              />
                            </div>
                            <span className="text-xs text-gray-500">Diff: {q.difficulty}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Container 2: Generated Questions */}
                <div className="border rounded-lg p-4 bg-gray-50 min-h-[400px]">
                  <h3 className="font-bold text-lg mb-3 text-blue-700">Generated Questions</h3>
                  {generatedQuestions.length === 0 ? (
                    <p className="text-gray-400 italic">Generated questions will appear here.</p>
                  ) : (
                    <div className="space-y-3">
                      {generatedQuestions.map((q, idx) => (
                        <div key={idx} className="bg-white p-3 rounded shadow-sm border border-blue-200 relative group">
                          <button 
                            type="button" 
                            onClick={() => addToSelected(q, idx)} 
                            className="absolute top-2 right-2 bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-bold hover:bg-blue-200"
                          >
                            + Add
                          </button>
                          <p className="font-medium text-sm pr-12">{q.question}</p>
                          <div className="text-xs text-gray-500 mt-1 flex gap-2">
                            <span>Diff: {q.difficulty}</span>
                          </div>
                          <p className="text-xs text-gray-400 mt-1 truncate">Ans: {q.modelAnswer}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div>
              <h2 className="text-xl font-semibold mb-4">Manual Question Entry</h2>
              <p className="text-sm text-gray-600 mb-4">Add questions, their marks and difficulty. Total marks must equal Max Marks.</p>

              {formData.questions.length === 0 && (
                <div className="mb-4">
                  <p className="text-gray-500">No questions added yet. Click “+ Add Question” to begin.</p>
                </div>
              )}

              {formData.questions.map((q, index) => (
                <div key={index} className="mb-6 border rounded-lg p-4">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-medium">Question {index + 1}</h3>
                    <button type="button" onClick={() => removeQuestionManual(index)} className="text-red-600 hover:text-red-800">Remove</button>
                  </div>

                  <label htmlFor={`question-text-${index}`} className="block text-sm font-medium text-gray-700 mb-1">Question Text</label>
                  <textarea
                    id={`question-text-${index}`}
                    value={q.question}
                    onChange={e => handleQuestionChange(index, 'question', e.target.value)}
                    className="input-style w-full mb-3"
                    rows={3}
                    placeholder="Enter the question text"
                    required
                  />

                  <label htmlFor={`question-answer-${index}`} className="block text-sm font-medium text-gray-700 mb-1 mt-3">Model Answer (Optional)</label>
                  <div className="flex gap-2 mb-3">
                    <textarea
                      id={`question-answer-${index}`}
                      value={q.modelAnswer}
                      onChange={e => handleQuestionChange(index, 'modelAnswer', e.target.value)}
                      className="input-style w-full"
                      rows={2}
                      placeholder="Enter the correct answer or evaluation guideline"
                    />
                    <button
                      type="button"
                      onClick={() => generateManualAnswer(index)}
                      className="px-3 py-2 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 text-sm font-medium h-fit whitespace-nowrap"
                      title="Generate Answer with AI"
                    >
                      Auto-Generate
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label htmlFor={`question-marks-${index}`} className="block text-sm font-medium text-gray-700 mb-1">Marks</label>
                      <input
                        id={`question-marks-${index}`}
                        type="number"
                        value={q.maxMarks}
                        onChange={e => handleQuestionChange(index, 'maxMarks', e.target.value)}
                        className="input-style w-full"
                        min={0}
                        required
                      />
                    </div>

                    <div>
                      <label htmlFor={`question-difficulty-${index}`} className="block text-sm font-medium text-gray-700 mb-1">Difficulty</label>
                      <select
                        id={`question-difficulty-${index}`}
                        value={q.difficulty}
                        onChange={e => handleQuestionChange(index, 'difficulty', e.target.value)}
                        className="input-style w-full"
                        required
                      >
                        <option value="Easy">Easy</option>
                        <option value="Medium">Medium</option>
                        <option value="Hard">Hard</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor={`question-subject-${index}`} className="block text-sm font-medium text-gray-700 mb-1">Subject (optional)</label>
                      <input
                        id={`question-subject-${index}`}
                        type="text"
                        value={q.subject || formData.subject}
                        onChange={e => handleQuestionChange(index, 'subject', e.target.value)}
                        className="input-style w-full"
                        placeholder="Subject (will default to exam subject)"
                      />
                    </div>
                  </div>
                </div>
              ))}

              <div className="mb-6">
                <button
                  type="button"
                  onClick={addQuestionManual}
                  className={`btn-secondary-sm ${formData.questions.length >= Number(formData.numberOfQuestions) ? 'opacity-60 cursor-not-allowed' : ''}`}
                  disabled={formData.questions.length >= Number(formData.numberOfQuestions)}
                >
                  + Add Question
                </button>
              </div>

              <div className="mb-4 text-sm text-gray-600">
                <strong>Total question marks:</strong> {formData.questions.reduce((s, q) => s + (Number(q.maxMarks) || 0), 0)} / {formData.maxMarks}
              </div>
            </div>
          )}
          
          {/* Rubric Configuration Section */}
          {formData.evaluationMode === 'Rubric Based Evaluation' && (
            <>
              <hr className="my-8" />
              <div>
                <h2 className="text-xl font-semibold mb-2">Rubric Configuration</h2>
                <p className="text-sm text-gray-600 mb-4">
                  Define the marking breakdown for each question. The sum of rubric marks must match the total marks for the question.
                </p>
                <button
                  type="button"
                  onClick={() => setShowRubricModal(true)}
                  className="btn-secondary"
                  disabled={formData.questions.length === 0 || Number(formData.numberOfQuestions) === 0}
                >
                  Configure Rubric Breakdowns
                </button>
                {(formData.questions.length === 0 || Number(formData.numberOfQuestions) === 0) && (
                  <p className="text-xs text-red-500 mt-1">Please add questions before configuring rubrics.</p>
                )}
              </div>
            </>
          )}

          <div className="mt-8 flex justify-end gap-4">
            <button type="button" onClick={() => navigate('/dashboard')} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={isLoading} className="btn-primary">
              {isLoading ? 'Saving...' : (isEditing ? 'Update Exam' : 'Create Exam')}
            </button>
          </div>
        </form>
      </div>

      {/* Rubric Modal */}
      {showRubricModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
          <div className="relative bg-white rounded-lg shadow-xl max-w-3xl w-full m-4 p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-900">Rubric Breakdown</h3>
              <button onClick={() => setShowRubricModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
            
            {Number(formData.numberOfQuestions) > 0 ? (
              <>
                <div className="border-b border-gray-200 mb-4">
                  <nav className="-mb-px flex space-x-4 overflow-x-auto" aria-label="Tabs">
                    {[...Array(Number(formData.numberOfQuestions)).keys()].map(index => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => setCurrentRubricQuestionIndex(index)}
                        className={`${
                          currentRubricQuestionIndex === index
                            ? 'border-indigo-500 text-indigo-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        } whitespace-nowrap py-3 px-4 border-b-2 font-medium text-sm`}
                      >
                        Q{index + 1}
                      </button>
                    ))}
                  </nav>
                </div>

                {(() => {
                  const questionMaxMarks = Number(formData.questions[currentRubricQuestionIndex]?.maxMarks) || 0;
                  const currentRubricSum = (rubricBreakdown[currentRubricQuestionIndex] || []).reduce((sum, item) => sum + Number(item.marks), 0);
                  return (
                    <div className="flex justify-between items-center mb-4 p-3 bg-gray-100 rounded-lg">
                        <h4 className="font-semibold text-lg text-gray-800">Configuration for Question {currentRubricQuestionIndex + 1}</h4>
                        <span className={`font-bold text-lg px-3 py-1 rounded ${currentRubricSum !== questionMaxMarks ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                            Total: {currentRubricSum} / {questionMaxMarks}
                        </span>
                    </div>
                  );
                })()}

                {currentRubricQuestionIndex === 0 && (
                  <div className="flex items-center mb-4 bg-indigo-50 p-3 rounded-lg">
                    <input
                      id="apply-to-all"
                      type="checkbox"
                      className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                      checked={applyRubricToAll}
                      onChange={handleApplyToAllChange}
                    />
                    <label htmlFor="apply-to-all" className="ml-2 block text-sm text-gray-900">
                      Apply this rubric to all questions (This will overwrite other questions' rubrics).
                    </label>
                  </div>
                )}

                <div className="mb-4 space-y-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Topic (e.g., Definition)"
                      className="input-style flex-grow"
                      value={rubricTopic}
                      onChange={(e) => setRubricTopic(e.target.value)}
                    />
                    <input
                      type="number"
                      placeholder="Marks"
                      className="input-style w-24"
                      value={rubricMarks}
                      onChange={(e) => setRubricMarks(e.target.value)}
                      min="0"
                    />
                    <button type="button" onClick={handleAddRubricEntry} className="btn-primary bg-green-600 hover:bg-green-700 whitespace-nowrap">Add</button>
                  </div>
                </div>

                <div className="max-h-60 overflow-y-auto border rounded-lg p-2 bg-gray-50 mb-4">
                  {(rubricBreakdown[currentRubricQuestionIndex] || []).length === 0 ? (
                    <p className="text-gray-500 text-center text-sm">No breakdown items for Q{currentRubricQuestionIndex + 1}.</p>
                  ) : (
                    <ul className="space-y-2">
                      {(rubricBreakdown[currentRubricQuestionIndex] || []).map((item, idx) => (
                        <li key={idx} className="flex justify-between items-center bg-white p-2 rounded border shadow-sm">
                          <span className="font-medium text-gray-800">{item.topic}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded">{item.marks} Marks</span>
                            <button type="button" onClick={() => handleRemoveRubricEntry(idx)} className="text-red-500 hover:text-red-700 font-bold text-lg">&times;</button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            ) : (
              <p className="text-center text-gray-600 py-8">Please set the "Number of Questions" in the main form first.</p>
            )}

            <div className="flex justify-end">
              <button type="button" onClick={() => setShowRubricModal(false)} className="btn-primary">Save & Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreateExam;