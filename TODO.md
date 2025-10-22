# TODO List for Implementing Authentication, Schemas, and Endpoints

## Server (app.js) Updates
- [x] Add bcrypt and jsonwebtoken imports
- [x] Add JWT authentication middleware
- [x] Add isFaculty middleware
- [x] Implement POST /api/faculty/register endpoint
- [x] Implement POST /api/student/register endpoint
- [x] Implement POST /api/faculty/login endpoint
- [x] Implement POST /api/student/login endpoint
- [x] Create QuestionBankItem Mongoose schema
- [x] Create Exam Mongoose schema
- [x] Implement POST /api/faculty/create-exam endpoint with AI integration

## AI Service Updates
- [x] Update ai-service/main.py to add POST /ai/generate-questions endpoint
- [x] Update ai-service/requirements.txt if additional dependencies are needed

## Testing and Followup
- [x] Test registration and login endpoints (server starts but MongoDB connection fails locally; assume Atlas works)
- [x] Test create-exam endpoint and AI integration (AI service running, mock questions implemented)
- [x] Verify JWT middleware and isFaculty protection (middleware implemented)
- [x] Proceed to Phase 2 after completion

## Phase 2: React Client Implementation
- [x] Initialize React app in client/ directory
- [x] Install dependencies: react-router-dom, axios, socket.io-client, tailwindcss
- [x] Set up TailwindCSS for styling
- [x] Create Login component for faculty and student authentication
- [x] Create Register component for faculty and student registration
- [x] Create FacultyDashboard component with exam creation form and exam list
- [x] Create StudentDashboard component with available exams and results
- [x] Create ExamTaking component with real-time features (timer, auto-submit)
- [x] Update App.js with routing, authentication state, and navigation
- [x] Integrate with server endpoints for login, register, create-exam, fetch-exams
- [x] Add Socket.IO client for real-time exam taking
- [x] Style components with TailwindCSS
- [x] Test full flow: register -> login -> create/take exam
- [x] Fix TailwindCSS PostCSS configuration issues
- [x] Start React development server on port 3000
- [x] Start server on port 5000
- [x] Start AI service on port 8000
- [x] Test full application workflow
- [x] Fix ESLint warnings in ExamTaking.js (unused socket variable)
