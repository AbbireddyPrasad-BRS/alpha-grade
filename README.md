# AlphaGrade - Intelligent Exam Management & Evaluation System

## Project Structure
```
AlphaGrade/
├── client/          # React Frontend
├── server/          # Node.js + Express + Socket.IO Backend
└── ai-service/      # Python + FastAPI Microservice for AI inference
```

## Technology Stack
- **Frontend**: React (Vite or CRA), TailwindCSS or Chakra UI, socket.io-client
- **Backend**: Node.js, Express.js, MongoDB, Mongoose, Socket.IO, JWT
- **AI Service**: Python + FastAPI, llama-cpp-python or Ollama for Llama 3

## How to Run

### Prerequisites
- Node.js (v16+)
- Python (3.11+)
- MongoDB (local or Atlas)
- Docker (optional)

### Running the Services

1. **Server (Express + Socket.IO)**:
   - Navigate to `server/` directory
   - Install dependencies: `npm install`
   - Start the server: `npm start` or `node app.js`
   - Server runs on http://localhost:5000

2. **AI Service (FastAPI)**:
   - Navigate to `ai-service/` directory
   - Install dependencies: `pip install -r requirements.txt`
   - Start the service: `uvicorn main:app --reload`
   - Service runs on http://localhost:8000
   - Health check: GET http://localhost:8000/health

3. **Client (React)**:
   - Navigate to `client/` directory
   - Install dependencies: `npm install`
   - Start the app: `npm run dev`
   - App runs on http://localhost:3000

### Using Docker
- For server: `docker build -t alphagrade-server ./server` then `docker run -p 5000:5000 alphagrade-server`
- For AI service: `docker build -t alphagrade-ai ./ai-service` then `docker run -p 8000:8000 alphagrade-ai`

### Environment Variables
- Create `.env` in `server/` with `MONGODB_URI` and `PORT`
- Update MongoDB URI as needed (e.g., for Atlas)
