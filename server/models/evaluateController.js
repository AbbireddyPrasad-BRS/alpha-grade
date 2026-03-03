const Exam = require('./Exam');
const StudentResponse = require('./StudentResponse');
const ollama = require('ollama').default;

/**
 * Shared logic to evaluate a set of answers against an exam definition
 */
const performAiEvaluation = async (exam, answers) => {
    let totalScore = 0;
    const processedAnswers = [];

    for (const a of answers) {
        const qDef = exam.questions.find(q => 
            (q._id && q._id.toString() === a.questionID) || 
            (q.questionID?._id && q.questionID._id.toString() === a.questionID) || 
            (q.questionID?.toString() === a.questionID)
        );
        
        const questionText = qDef?.questionID?.text || 'Question text unavailable';
        const referenceAnswer = qDef?.questionID?.modelAnswer || '';
        const rubric = qDef?.questionID?.rubric || '';
        const studentAnswer = a.answer || a.submittedAnswer || '';
        const maxMarks = qDef?.marks || 0;

        let marksObtained = 0;
        let feedback = 'AI Evaluation failed';

        // Skip AI evaluation for empty answers to save resources and prevent AI confusion
        if (!studentAnswer.trim()) {
            processedAnswers.push({
                questionID: a.questionID,
                questionText,
                answer: studentAnswer,
                maxMarks,
                marksObtained: 0,
                feedback: 'No answer provided.'
            });
            continue;
        }

        // Small delay to prevent overwhelming the local AI service
        await new Promise(resolve => setTimeout(resolve, 500));

        try {
            const response = await ollama.chat({
                model: 'llama3',
                messages: [
                    { 
                        role: 'system', 
                        content: `You are an extremely strict, pedantic academic evaluator. Your primary goal is to maintain high academic standards by identifying even minor inaccuracies, omissions, or lack of depth.

                        Strict Evaluation Rules:
                        1. Technical Accuracy: The answer must align perfectly with the Reference Answer. Deduct marks for any factual errors or vague terminology.
                        2. Depth vs. Marks (Length Requirement):
                           - 2-3 Marks: Requires at least 3-5 concise, accurate sentences.
                           - 5 Marks: Requires at least 2-3 detailed paragraphs with specific examples.
                           - 8-10 Marks: Requires a comprehensive, multi-paragraph explanation covering all aspects of the topic in depth.
                        3. Length Penalty: Strictly penalize short answers. If a high-mark question (5+ marks) is answered with only a few sentences, cap the maximum possible score at 40% of the total marks, even if the content is technically correct.
                        4. Rubric Adherence: If a specific rubric is provided, follow it with absolute precision.
                        5. Tone: Be critical. If the student provides a "minimum effort" answer, reflect that in a low score and critical feedback.
                        6. Technical keywords provided as the answer instead of the required detailed explanation should be marked with zero marks, as they indicate a lack of understanding.
                        
                        You MUST respond ONLY with a JSON object: {"score": number, "feedback": "string"}.` 
                    },
                    { 
                        role: 'user', 
                        content: `Question: ${questionText}
                        Max Marks: ${maxMarks}
                        Reference Model Answer: ${referenceAnswer || 'Not provided. Evaluate based on general technical accuracy.'}
                        Specific Rubric: ${rubric || 'None provided. Use the strict depth-to-marks ratio rules.'}
                        
                        Student's Submitted Answer: "${studentAnswer}"
                        
                        Evaluate strictly based on the rules provided.` 
                    }
                ],
                format: 'json',
            });

            const result = JSON.parse(response.message.content);

            // Ensure marksObtained is a valid number
            const rawScore = result.score;
            marksObtained = typeof rawScore === 'number' ? rawScore : parseFloat(rawScore);
            if (isNaN(marksObtained) || marksObtained > maxMarks) marksObtained = 0;
            
            feedback = result.feedback || 'No feedback provided by AI.';
        } catch (err) {
            const errorDetail = err.message || 'Local AI inference failed.';
            console.error(`❌ AI Evaluation failed for question ${a.questionID}:`, errorDetail);
            feedback = `Manual review required. AI service error: ${errorDetail}`;
        }

        processedAnswers.push({
            questionID: a.questionID,
            questionText,
            answer: studentAnswer,
            maxMarks,
            marksObtained,
            feedback
        });
        totalScore += marksObtained;
    }

    return { totalScore, processedAnswers };
};

/**
 * Save student answers without final submission/evaluation
 */
exports.saveAnswers = async (req, res) => {
    try {
        const { answers, monitoringData } = req.body;
        const examId = req.params.id;
        const studentId = req.user._id;

        let submission = await StudentResponse.findOne({ examId, studentId });
        if (submission && submission.isEvaluated) {
            return res.status(400).json({ message: 'Exam already submitted' });
        }

        if (!submission) {
            submission = new StudentResponse({ examId, studentId, answers, monitoringData });
        } else {
            submission.answers = answers;
            submission.monitoringData = monitoringData;
        }

        await submission.save();
        res.json({ message: 'Answers saved successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * Final exam submission with AI evaluation
 */
exports.submitExam = async (req, res) => {
    try {
        const { answers, monitoringData } = req.body;
        const examId = req.params.id;
        const studentId = req.user._id;

        const exam = await Exam.findById(examId);
        if (!exam) return res.status(404).json({ message: 'Exam not found' });

        // Check if already submitted
        let submission = await StudentResponse.findOne({ examId, studentId });
        if (submission && submission.isEvaluated) {
            return res.status(400).json({ message: 'Exam already submitted and evaluated' });
        }

        if (!submission) {
            submission = new StudentResponse({
                examId,
                studentId,
                answers,
                totalScore: 0,
                isEvaluated: false,
                status: 'Pending',
                monitoringData
            });
        } else {
            submission.answers = answers;
            submission.totalScore = 0;
            submission.isEvaluated = false;
            submission.status = 'Pending';
            submission.monitoringData = monitoringData;
        }

        await submission.save();
        res.json({ message: 'Exam submitted successfully. Waiting for faculty evaluation.' });
    } catch (error) {
        console.error('Submission error:', error);
        res.status(500).json({ message: error.message });
    }
};

exports.evaluateExam = async (req, res) => {
    try {
        const exam = await Exam.findById(req.params.id).populate('questions.questionID');
        if (!exam) return res.status(404).json({ message: 'Exam not found' });

        const submissions = await StudentResponse.find({ examId: exam._id, isEvaluated: false });
        
        if (submissions.length === 0) {
            return res.json({ message: 'Results already released or no new submissions to evaluate.' });
        }
        
        for (const sub of submissions) {
            const { totalScore, processedAnswers } = await performAiEvaluation(exam, sub.answers);
            sub.answers = processedAnswers;
            sub.totalScore = totalScore;
            sub.isEvaluated = true;
            sub.status = totalScore >= (exam.passMarks || 0) ? 'Pass' : 'Fail';
            await sub.save();

            // Update score in Exam submissions array
            const subIndex = exam.submissions.findIndex(s => s.studentId.toString() === sub.studentId.toString());
            if (subIndex !== -1) {
                exam.submissions[subIndex].score = totalScore;
                exam.submissions[subIndex].status = sub.status;
            }
        }
        
        await exam.save();
        res.json({ message: `Successfully evaluated ${submissions.length} submissions.` });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.reevaluateStudent = async (req, res) => {
    try {
        const { id: examId, studentId } = req.params;
        const exam = await Exam.findById(examId).populate('questions.questionID');
        const sub = await StudentResponse.findOne({ examId, studentId });
        
        if (!sub) return res.status(404).json({ message: 'Submission not found' });

        const { totalScore, processedAnswers } = await performAiEvaluation(exam, sub.answers);
        sub.answers = processedAnswers;
        sub.totalScore = totalScore;
        sub.isEvaluated = true;
        sub.status = totalScore >= (exam.passMarks || 0) ? 'Pass' : 'Fail';
        await sub.save();

        // Sync back to Exam model submissions array
        const subIndex = exam.submissions.findIndex(s => s.studentId.toString() === studentId.toString());
        if (subIndex !== -1) {
            exam.submissions[subIndex].score = totalScore;
            exam.submissions[subIndex].status = sub.status;
            await exam.save();
        }

        res.json({ message: 'Re-evaluation complete', totalScore, feedback: sub.answers.map(a => a.feedback) });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getExamResults = async (req, res) => {
    try {
        const results = await StudentResponse.find({ examId: req.params.id })
            .populate('examId', 'passMarks subject')
            .populate('studentId', 'name email enrollmentNumber')
            .sort({ totalScore: -1 });
        res.json(results);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * AI Question Generation for Exam Creation
 */
exports.generateAiQuestions = async (req, res) => {
    try {
        const { topics, count, difficulty, domain } = req.body;
        
        const response = await ollama.chat({
            model: 'llama3',
            messages: [
                {
                    role: 'system',
                    content: `You are an expert academic examiner. Generate ${count || 5} descriptive questions for an exam. 
                    The questions should be based on the following topics: ${Array.isArray(topics) ? topics.join(', ') : topics}.
                    Difficulty level: ${difficulty || 'Medium'}.
                    Domain: ${domain || 'General'}.

                    Instructions:
                    1. Questions must be descriptive and follow a format like: "Explain about [Topic] in detail with examples".
                    2. Examples of desired question style:
                       - Topic: "conditional statement" -> Question: "Explain about conditional statements in Python and Java with examples?"
                       - Topic: "Newton's laws" -> Question: "Explain about Newton's laws of motion in detail with examples."
                    3. Assign appropriate marks to each question (typically between 2 and 10).
                    4. Provide a high-quality model answer for each question.
                    
                    You MUST respond ONLY with a JSON array of objects. Each object must strictly follow this structure:
                    {
                        "text": "The question text",
                        "marks": number,
                        "difficulty": "${difficulty || 'Medium'}",
                        "domain": "${domain || 'General'}",
                        "modelAnswer": "A detailed, accurate reference answer"
                    }`
                }
            ],
            format: 'json',
        });

        const questions = JSON.parse(response.message.content);
        res.json(questions);
    } catch (error) {
        console.error('❌ AI Question Generation failed:', error);
        res.status(500).json({ message: 'Failed to generate questions: ' + error.message });
    }
};

/**
 * AI Model Answer Generation for Manual Question Creation
 */
exports.generateModelAnswer = async (req, res) => {
    try {
        const { questionText } = req.body;
        
        const response = await ollama.chat({
            model: 'llama3',
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert subject matter specialist. Generate an accurate, detailed, and comprehensive model answer for the provided question. The answer should serve as a high-quality reference for academic grading, covering all key points and technical details.'
                },
                {
                    role: 'user',
                    content: `Question: ${questionText}`
                }
            ]
        });

        res.json({ modelAnswer: response.message.content });
    } catch (error) {
        console.error('❌ AI Model Answer Generation failed:', error);
        res.status(500).json({ message: 'Failed to generate model answer: ' + error.message });
    }
};

// Export helper for use in routes/exams.js submit route
exports.performAiEvaluation = performAiEvaluation;