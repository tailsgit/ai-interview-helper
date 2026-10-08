import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from .database import initialize_database
from .models import (Level, Topic, Question, CodingResponse, FollowupRequest, FollowupResponse,
                     TranscriptResponse, ReportRequest, Report, DocumentRequest)

@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_database()
    yield

app = FastAPI(title="Interview Coach — Mock API", lifespan=lifespan)
origins = [o.strip() for o in os.getenv("FRONTEND_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=False,
                   allow_methods=["GET", "POST"], allow_headers=["Content-Type"])

MOCK_QUESTION = {
    "id": "q_001", "title": "Two Sum",
    "prompt": "Given an array of integers nums and an integer target, return the indices of the two numbers that add up to target. Each input has exactly one solution, and you may not use the same element twice. Return the answer in any order.",
    "examples": ["Input: nums = [2,7,11,15], target = 9 → Output: [0,1]", "Input: nums = [3,3], target = 6 → Output: [0,1]"],
    "difficulty": "Junior", "topic": "Arrays",
    "follow_up_angles": ["time_complexity", "optimization", "real_world_application"]
}
MOCK_EXECUTION = {"passed": 3, "total": 4, "failed_cases": ["edge_case_1"], "expected_complexity": "O(n)", "runtime_ms": 12}
MOCK_REPORT = {
    "objective": {"tests_passed": "3/4", "expected_complexity": "O(n)", "stated_complexity": "O(n)"},
    "subjective": {
        "strengths": ["Clearly explained approach before coding", "Identified the hash map optimization"],
        "weaknesses": ["Did not mention edge case of duplicate values"],
        "suggestions": ["Practice stating complexity explicitly before being asked", "Consider walking through a dry run"]
    }
}

@app.get("/api/question", response_model=Question)
def question(level: Level = "Junior", topic: Topic = "Arrays"):
    # TODO: implement real logic: query SQLite by level/topic. Mock content stays Two Sum.
    return {**MOCK_QUESTION, "difficulty": level, "topic": topic}

@app.post("/api/submit-coding-phase", response_model=CodingResponse)
async def submit_coding_phase(question_id: str = Form(...), code: str = Form(...), audio: UploadFile = File(...)):
    # TODO: implement real logic: validate size/duration, transcribe with Whisper, execute with Judge0.
    # TODO: add IP rate limiting before enabling paid services. Never execute user code in this process.
    await audio.close()  # No audio persistence or processing in the skeleton.
    return {"transcript": "I would use a hash map to store numbers and check for their complements.", "execution_results": MOCK_EXECUTION}

@app.post("/api/generate-followup", response_model=FollowupResponse)
def generate_followup(body: FollowupRequest):
    # TODO: implement real logic: LLM chooses a remaining angle using code/results/conversation.
    # The skeleton selects canned text by angle to exercise all three frontend turns.
    questions = {
        "time_complexity": "What’s the time complexity of your solution?",
        "optimization": "How does a hash map improve on checking every possible pair? What trade-off does it introduce?",
        "real_world_application": "Where might you use this complement-lookup approach in a real application?"
    }
    angle = body.remaining_angles[0]
    if angle not in questions:
        raise HTTPException(status_code=422, detail="Unknown follow-up angle.")
    return {"followup_text": questions[angle], "angle_used": angle}

@app.post("/api/submit-followup-answer", response_model=TranscriptResponse)
async def submit_followup_answer(audio: UploadFile = File(...)):
    # TODO: implement real logic: validate upload, apply rate limiting, transcribe with Whisper.
    await audio.close()
    return {"transcript": "It’s O(n) because I visit each element once and hash map lookups are constant time on average."}

@app.post("/api/generate-report", response_model=Report)
def generate_report(body: ReportRequest):
    # TODO: implement real logic: compute objective results from execution, use LLM for subjective feedback.
    # TODO: extract stated complexity from conversation and rate-limit paid calls.
    return MOCK_REPORT

@app.post("/api/generate-document")
def generate_document(body: DocumentRequest):
    # TODO: implement real logic: generate formatted PDF/DOCX from validated report data.
    report = body.report
    lines = ["AI TECHNICAL INTERVIEW COACH", "MOCK REPORT — sample feedback, not a real evaluation", "", "Objective Results",
             f"Tests passed: {report.objective.tests_passed}", f"Expected complexity: {report.objective.expected_complexity}",
             f"Stated complexity: {report.objective.stated_complexity}"]
    for title, values in [("Strengths", report.subjective.strengths), ("Weaknesses", report.subjective.weaknesses), ("Suggestions", report.subjective.suggestions)]:
        lines.extend(["", title, *[f"- {value}" for value in values]])
    return Response("\n".join(lines) + "\n", media_type="text/plain; charset=utf-8", headers={"Content-Disposition": 'attachment; filename="interview-report.txt"'})
