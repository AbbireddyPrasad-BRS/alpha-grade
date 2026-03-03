# TODO: Shift to Descriptive Exams

## Backend Schema Updates
- [x] Update questionBankItemSchema in server/app.js: Remove options, answer; add maxMarks (Number)

## Backend Endpoint Updates
- [x] Update create-exam endpoint in server/app.js: Handle creationMethod; for manual, accept questions array with question and maxMarks; for AI, handle file upload and call new AI endpoint

## AI Service Updates
- [x] Modify /ai/generate-questions in ai-service/main.py to generate descriptive questions (no options/answer, add maxMarks based on difficulty)
- [x] Update /ai/generate-questions-from-file in ai-service/main.py to generate 10 descriptive questions from syllabus, assign marks

## Frontend Updates
- [x] Update FacultyDashboard.js: Add manual form with dynamic inputs for questions and marks
- [x] Update FacultyDashboard.js: Add file input for AI creation method
- [x] Update FacultyDashboard.js: After AI generation, show questions for selection/replacement, assign marks to match total max marks

## Testing
- [ ] Test manual exam creation flow
- [ ] Test AI exam creation flow with file upload
- [ ] Test question selection and mark assignment
- [ ] Test exam taking for descriptive questions
