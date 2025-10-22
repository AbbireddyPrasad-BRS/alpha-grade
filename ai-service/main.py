from fastapi import FastAPI
from pydantic import BaseModel
import random

app = FastAPI()

class GenerateQuestionsRequest(BaseModel):
    subject: str
    difficulty: str
    numQuestions: int

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/ai/generate-questions")
async def generate_questions(request: GenerateQuestionsRequest):
    # Mock question generation (replace with actual AI integration)
    questions = []
    for i in range(request.numQuestions):
        question = {
            "question": f"What is {i+1} in {request.subject}?",
            "options": ["Option A", "Option B", "Option C", "Option D"],
            "answer": "Option A",
            "subject": request.subject,
            "difficulty": request.difficulty
        }
        questions.append(question)
    return {"questions": questions}
