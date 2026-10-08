from typing import Literal
from pydantic import BaseModel, Field
Level = Literal["Junior", "Mid", "Senior"]
Topic = Literal["Arrays", "Trees", "Graphs", "General"]
class Question(BaseModel):
    id: str
    title: str
    prompt: str
    examples: list[str]
    difficulty: Level
    topic: Topic
    follow_up_angles: list[str]
class ExecutionResults(BaseModel):
    passed: int
    total: int
    failed_cases: list[str]
    expected_complexity: str
    runtime_ms: int
class CodingResponse(BaseModel):
    transcript: str
    execution_results: ExecutionResults
class Turn(BaseModel):
    role: Literal["interviewer", "candidate"]
    text: str
    angle: str | None = None
class FollowupRequest(BaseModel):
    question_id: str
    transcript: str
    code: str
    execution_results: ExecutionResults
    conversation_history: list[Turn]
    remaining_angles: list[str] = Field(min_length=1)
class FollowupResponse(BaseModel):
    followup_text: str
    angle_used: str
class TranscriptResponse(BaseModel):
    transcript: str
class ReportRequest(BaseModel):
    question_id: str
    code: str
    execution_results: ExecutionResults
    full_conversation: list[Turn]
class Objective(BaseModel):
    tests_passed: str
    expected_complexity: str
    stated_complexity: str
class Subjective(BaseModel):
    strengths: list[str]
    weaknesses: list[str]
    suggestions: list[str]
class Report(BaseModel):
    objective: Objective
    subjective: Subjective
class DocumentRequest(BaseModel):
    report: Report
