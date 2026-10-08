# Full project structure and file contents

```text
.gitignore
README.md
backend/.env.example
backend/app/__init__.py
backend/app/database.py
backend/app/main.py
backend/app/models.py
backend/requirements.txt
backend/tests/test_flow.py
frontend/.env.example
frontend/app/globals.css
frontend/app/layout.tsx
frontend/app/page.tsx
frontend/components/Recorder.tsx
frontend/lib/api.ts
frontend/lib/types.ts
frontend/next-env.d.ts
frontend/next.config.ts
frontend/package-lock.json
frontend/package.json
frontend/tsconfig.json
```

## .gitignore

````text
node_modules/
.next/
out/
.venv/
__pycache__/
.pytest_cache/
*.sqlite3
*.tsbuildinfo
.env
.env.local

````

## README.md

````md
# AI Technical Interview Coach

Complete Next.js App Router UI and a separate FastAPI mock backend. No login, session database writes, external AI calls, or code execution. React state and temporary recording buffers last only for the current page session.

## Run locally

Requires Node.js 20.9+ and Python 3.10+. Open two terminals.

Backend (from project root):
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
Windows activation: `.venv\Scripts\activate`.

Frontend (from project root, in the second terminal):
```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```
Open http://localhost:3000. API documentation: http://localhost:8000/docs.

Microphone capture requires HTTPS or localhost and browser permission. Monaco currently loads its assets from its default CDN, so internet access is required. Fonts fall back to system fonts when unavailable. Python is the one supported editor language in this skeleton.

## Flow and retry behavior

Set up → fetch question → code and record → upload code/audio → fetch follow-up → record/upload answer → repeat until exactly three follow-ups → generate report → download text report. Every request displays a loading message. Failed requests retain their payload for Try Again; completed uploads are checkpointed so a downstream retry does not re-upload them. Microphone errors have their own retry controls. Tracks stop after recording and on component unmount. Refreshing clears the interview. Starting a new interview resets all session data.

## API contract

All HTTP calls are in `frontend/lib/api.ts`. No Next.js API routes.

| Endpoint | Request encoding | Response |
| --- | --- | --- |
| GET /api/question | query: level, topic | Question JSON |
| POST /api/submit-coding-phase | multipart: question_id, code, audio | Transcript and execution_results JSON |
| POST /api/generate-followup | JSON: question_id, transcript, code, execution_results, conversation_history, remaining_angles | followup_text, angle_used |
| POST /api/submit-followup-answer | multipart: audio | transcript |
| POST /api/generate-report | JSON: question_id, code, execution_results, full_conversation | objective, subjective |
| POST /api/generate-document | JSON: report | attachment interview-report.txt |

Conversation turns have `{role: "interviewer" | "candidate", text: string, angle?: string}`. File/blob uploads use multipart rather than JSON. Remaining angles are removed only after a successful follow-up fetch. Backend request/response types live in `backend/app/models.py` and mirror frontend types.

The one hardcoded question is Two Sum for every selection; its metadata echoes your selection to exercise the contract. The three canned follow-ups use the remaining angles in order. Code is never run and audio is never transcribed. Results and transcripts are sample data. The plain-text download includes the supplied mock report.

## Configuration

Frontend: `NEXT_PUBLIC_API_BASE_URL` defaults to http://localhost:8000. Set it before building. Backend: `FRONTEND_ORIGINS` is a comma-separated list of allowed origins; `DATABASE_PATH` overrides the empty SQLite file location. Export these variables in your shell (FastAPI does not automatically read `.env.example`). The default SQLite file is created at backend/data/questions.sqlite3 on startup, with no schema or stored sessions.

## Validate

```bash
cd backend
pytest -q
```
```bash
cd frontend
npm run typecheck
npm run build
```
Manual browser checks: deny microphone access and retry; complete coding and three follow-ups; stop the backend to exercise retry; download the report; start a new interview; check mobile layout. An end-to-end microphone test must be done in a browser.

## Implementation tasks left

Each route contains a `# TODO: implement real logic` comment.
1. Whisper transcription for both upload endpoints.
2. Judge0 execution against curated tests (never execute user code in FastAPI).
3. LLM follow-up wording and angle selection from the complete conversation.
4. Compute objective report from execution results; use LLM for subjective feedback.
5. SQLite schema, curated question bank, tests/edge cases/angles, and real queries.
6. Formatted PDF or DOCX generation.
7. IP rate limiting before enabling paid APIs.
8. Upload size and recording duration limits before forwarding audio.

The backend is intentionally a development skeleton. No paid integration, rate limiter, real query, audio validation, or persistence has been implemented.

````

## backend/.env.example

````example
FRONTEND_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
DATABASE_PATH=data/questions.sqlite3

````

## backend/app/__init__.py

````py

````

## backend/app/database.py

````py
"""Connection scaffold only. No schema, queries, or session writes."""
import os
import sqlite3
from pathlib import Path
DATABASE_PATH = Path(os.getenv("DATABASE_PATH", str(Path(__file__).resolve().parents[1] / "data" / "questions.sqlite3")))
def connect() -> sqlite3.Connection:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    return sqlite3.connect(DATABASE_PATH)
def initialize_database() -> None:
    # TODO: implement real logic: create curated question/test-case schema later.
    with connect():
        pass

````

## backend/app/main.py

````py
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

````

## backend/app/models.py

````py
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

````

## backend/requirements.txt

````txt
fastapi>=0.115,<1
uvicorn[standard]>=0.30,<1
python-multipart>=0.0.18,<1
httpx>=0.27,<1
pytest>=8,<10

````

## backend/tests/test_flow.py

````py
from fastapi.testclient import TestClient
from app.main import app

def test_full_interview_contract(tmp_path, monkeypatch):
    monkeypatch.setattr("app.database.DATABASE_PATH", tmp_path / "questions.sqlite3")
    with TestClient(app) as client:
        q = client.get("/api/question?level=Senior&topic=Graphs").json()
        assert q["difficulty"] == "Senior" and q["topic"] == "Graphs"
        response = client.post("/api/submit-coding-phase", data={"question_id": q["id"], "code": "pass"}, files={"audio": ("answer.webm", b"mock audio", "audio/webm")})
        assert response.status_code == 200
        coding = response.json()
        history = [{"role": "candidate", "text": coding["transcript"]}]
        remaining = q["follow_up_angles"].copy()
        for _ in range(3):
            followup = client.post("/api/generate-followup", json={"question_id": q["id"], "transcript": coding["transcript"], "code": "pass", "execution_results": coding["execution_results"], "conversation_history": history, "remaining_angles": remaining})
            assert followup.status_code == 200
            data = followup.json()
            remaining.remove(data["angle_used"])
            history.append({"role": "interviewer", "text": data["followup_text"]})
            answer = client.post("/api/submit-followup-answer", files={"audio": ("a.m4a", b"mock audio", "audio/mp4")})
            assert answer.status_code == 200
            history.append({"role": "candidate", "text": answer.json()["transcript"]})
        report = client.post("/api/generate-report", json={"question_id": q["id"], "code": "pass", "execution_results": coding["execution_results"], "full_conversation": history})
        assert report.status_code == 200
        document = client.post("/api/generate-document", json={"report": report.json()})
        assert document.status_code == 200 and "attachment" in document.headers["content-disposition"]
        assert "3/4" in document.text and "MOCK REPORT" in document.text
        assert (tmp_path / "questions.sqlite3").exists()

def test_validation_and_cors():
    with TestClient(app) as client:
        assert client.get("/api/question?level=Invalid").status_code == 422
        assert client.post("/api/submit-followup-answer").status_code == 422
        assert client.post("/api/generate-report", json={}).status_code == 422
        response = client.options("/api/submit-coding-phase", headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "POST"})
        assert response.headers["access-control-allow-origin"] == "http://localhost:3000"

````

## frontend/.env.example

````example
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000

````

## frontend/app/globals.css

````css
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap');
:root{--ink:#183b38;--muted:#71807b;--green:#20564a;--line:#dce3db;--paper:#f7f8f2}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:'DM Sans',Arial,sans-serif}button,input,select{font:inherit}button{border:0;border-radius:8px;background:var(--green);color:white;padding:15px 22px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:26px;font-weight:600}button:hover{filter:brightness(1.1)}button:disabled{opacity:.5;cursor:wait}button:focus-visible,a:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #91bd66;outline-offset:4px}header{height:94px;max-width:1280px;margin:auto;padding:0 52px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line)}.brand{color:var(--ink);font-size:23px;font-weight:700;text-decoration:none;display:flex;align-items:center;letter-spacing:-1px}.brand-light{font-weight:400}.brand-icon{display:inline-grid;place-items:center;background:var(--green);color:#dcf0ae;width:33px;height:33px;border-radius:9px;margin-right:12px;letter-spacing:0}.pill{font-size:10px;letter-spacing:1.5px;padding:8px 11px;border:1px solid var(--line);border-radius:20px;display:flex;align-items:center;gap:9px}.small-dot{height:6px;width:6px;background:#719353;border-radius:50%}.shell{max-width:1176px;margin:auto;padding:0 28px}.steps{display:flex;gap:40px;padding:36px 0 46px;color:#8b9590;font-size:12px}.steps>div{display:flex;align-items:center;gap:9px}.steps span{font-size:10px;border:1px solid var(--line);width:25px;height:25px;border-radius:50%;display:grid;place-items:center}.steps .current{color:var(--green);font-weight:700}.steps .current span{color:white;background:var(--green);border-color:var(--green)}.steps .complete{color:var(--green)}.landing{display:grid;grid-template-columns:1.2fr 1fr;gap:94px;align-items:center;min-height:540px}.eyebrow{font-size:10px;font-weight:700;letter-spacing:2px;color:#667e67}h1{font-family:Manrope,Arial,sans-serif;font-size:67px;font-weight:500;line-height:1.12;letter-spacing:-3px;margin:24px 0}h1 em{font-style:normal;color:#788f58}.lead{font-size:16px;line-height:1.8;color:#64726c;max-width:420px}.benefits{margin:30px 0;font-size:13px}.benefits p{display:flex;gap:15px;margin:17px 0}.benefits span{font-size:10px;color:#849278;align-self:center}.privacy{font-size:11px;color:#7d8981;margin-top:38px}.setup-card,.card{border:1px solid var(--line);background:#fff;border-radius:14px;padding:30px}.setup-card{box-shadow:0 10px 40px #28443705}.card-top{display:flex;align-items:center;justify-content:space-between;font-size:11px;color:var(--muted)}h2{font-family:Manrope,Arial,sans-serif;font-size:23px;letter-spacing:-.7px;margin:20px 0 8px}p{line-height:1.65}.setup-card>p{font-size:13px;color:var(--muted);margin:0 0 30px}fieldset{padding:0;border:0;margin:0 0 25px}legend,label{font-size:12px;font-weight:600;margin-bottom:11px;display:block}.level-group{display:flex;gap:7px}.level-group button{flex:1;color:#728077;background:#f6f7f3;border:1px solid var(--line);padding:12px 8px;font-size:12px}.level-group .selected{background:#eef4e6;color:#315844;border-color:#88a46b}select{width:100%;padding:13px;border:1px solid var(--line);border-radius:7px;color:var(--ink);background:#fff}.session-note{display:flex;gap:13px;background:#f7f9f2;border-radius:8px;padding:15px;margin:25px 0}.session-note>span{color:#7f965e}.session-note strong{font-size:12px}.session-note p{font-size:11px;color:var(--muted);margin:4px 0 0}.wide{width:100%;justify-content:space-between}.setup-card small{display:block;text-align:center;font-size:10px;color:var(--muted);line-height:1.6;margin-top:15px}footer{margin-top:65px;border-top:1px solid var(--line);padding:24px 0 30px;display:flex;justify-content:space-between;color:#929b92;font-size:10px}.screen-title{font-size:38px;letter-spacing:-1.5px;margin:14px 0 24px}.section-title{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:18px}.section-title p{font-size:13px;color:var(--muted)}.tag{font-size:10px;letter-spacing:.8px;background:#edf3e6;color:#62764f;border-radius:5px;padding:8px 12px;white-space:nowrap}.workspace{display:grid;grid-template-columns:.85fr 1.3fr;gap:20px}.problem p{font-size:14px;color:#5e6f67}.problem h3{font-size:12px;margin-top:28px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;line-height:1.7;background:#f5f7f1;padding:15px;border-radius:7px}.hint{border-top:1px solid var(--line);margin-top:30px;padding-top:20px;font-size:12px}.hint p{font-size:12px}.code-card{background:#1e1e1e;border-radius:12px;overflow:hidden}.editor-bar,.editor-footer{display:flex;justify-content:space-between;padding:15px 20px;color:#acb6aa;font-size:11px;background:#252725}.editor-footer{font-size:10px}.editor-loading{height:410px;color:white;padding:30px}.recorder{margin-top:20px;border:1px solid var(--line);border-radius:12px;background:#fff;padding:22px 26px;display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap}.recorder strong{font-size:13px}.recorder p{font-size:12px;color:var(--muted);margin:5px 0 0}.record-dot{display:inline-block;width:8px;height:8px;background:#db584e;border-radius:50%;margin-right:7px;animation:pulse 1.4s infinite}.error{padding:15px 18px;background:#fff1ee;color:#963f33;border:1px solid #efd4cb;border-radius:8px;font-size:13px;margin-bottom:15px;display:flex;align-items:center;gap:18px;flex-wrap:wrap}.recorder .error{width:100%;margin:0}.text-button{color:inherit;background:transparent;padding:5px 0;text-decoration:underline}.loading{display:flex;gap:12px;align-items:center;padding:15px;background:#edf3e6;border-radius:8px;font-size:13px;margin-bottom:15px}.spinner{height:17px;width:17px;border:2px solid #b7c7ac;border-top-color:var(--green);border-radius:50%;animation:spin .8s linear infinite}.followup{max-width:800px;margin:20px auto}.followup-card{margin:30px 0 0;padding:35px}.followup-card h2{font-size:29px;line-height:1.5;margin:32px 0}.followup-card p{font-size:13px;color:var(--muted)}.dots{display:flex;gap:6px}.dots span{width:7px;height:7px;background:#dfe5d9;border-radius:50%}.dots .filled{background:#73955f}details{margin:25px 0;font-size:12px;color:var(--muted)}summary{cursor:pointer}.submitted-code{color:var(--ink)}.objective h2{margin-top:0;display:flex;gap:15px;align-items:center}.metrics{display:grid;grid-template-columns:repeat(3,1fr);margin-top:28px}.metrics>div{padding:0 25px;border-left:1px solid var(--line)}.metrics>div:first-child{border:0;padding-left:0}.metrics span{display:block;font-size:12px;color:var(--muted)}.metrics strong{display:block;font:500 36px Manrope,Arial;margin-top:12px}.feedback-heading{margin:30px 0 20px}.feedback-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.feedback-grid h3{font-size:17px}.feedback-grid ul{padding-left:18px;font-size:13px;color:#66776c;line-height:1.8}.feedback-grid li{margin-bottom:14px}.feedback-icon{color:#749758;font-size:24px}.restart{display:flex;justify-content:space-between;align-items:center;margin-top:30px;font-size:13px;color:var(--muted)}.secondary{background:transparent;border:1px solid var(--line);color:var(--ink)}@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{50%{opacity:.4}}@media(max-width:900px){.landing{gap:35px}h1{font-size:52px}.steps{gap:25px}.workspace{grid-template-columns:1fr}.feedback-grid{grid-template-columns:1fr}}@media(max-width:650px){header{padding:0 20px;height:75px}.brand{font-size:19px}.shell{padding:0 20px}.steps{gap:12px;justify-content:space-between;padding:25px 0 35px;font-size:9px}.steps>div{gap:5px}.steps span{width:20px;height:20px;font-size:8px}.landing{grid-template-columns:1fr;gap:25px}h1{font-size:49px}.setup-card,.card{padding:24px}.section-title{align-items:flex-start;flex-direction:column}.screen-title{font-size:32px}.metrics{gap:20px;grid-template-columns:1fr}.metrics>div{padding:0!important;border:0}.metrics strong{font-size:30px}.followup-card h2{font-size:24px}.recorder button{width:100%}.restart{align-items:flex-start;flex-direction:column;gap:10px}footer{gap:15px}.pill{font-size:8px;letter-spacing:.8px}}@media(prefers-reduced-motion:reduce){*{animation:none!important}}

````

## frontend/app/layout.tsx

````tsx
import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Interview Coach | Technical practice", description: "Practice coding, explain your thinking, and reflect on your interview." };
export default function Layout({children}: Readonly<{children: React.ReactNode}>) { return <html lang="en"><body>{children}</body></html>; }

````

## frontend/app/page.tsx

````tsx
"use client";
import dynamic from "next/dynamic";
import {useRef, useState} from "react";
import Recorder from "../components/Recorder";
import {api} from "../lib/api";
import type {Level, Topic, Question, CodingResult, Followup, Turn, Report} from "../lib/types";
const Editor=dynamic(()=>import("@monaco-editor/react"), {ssr:false, loading:()=> <div className="editor-loading">Loading code editor…</div>});
type Stage="setup"|"coding"|"followup"|"results";
const initialCode=`def two_sum(nums, target):
    # Explain your approach as you work.
    pass
`;
export default function Home() {
  const [stage,setStage]=useState<Stage>("setup");
  const [level,setLevel]=useState<Level>("Junior"); const [topic,setTopic]=useState<Topic>("Arrays");
  const [question,setQuestion]=useState<Question>(); const [code,setCode]=useState(initialCode);
  const [coding,setCoding]=useState<CodingResult>(); const [followup,setFollowup]=useState<Followup>();
  const [history,setHistory]=useState<Turn[]>([]); const [angles,setAngles]=useState<string[]>([]);
  const [count,setCount]=useState(0); const [report,setReport]=useState<Report>();
  const [audio,setAudio]=useState<Blob>(); const [busy,setBusy]=useState(""); const [error,setError]=useState("");
  const retry=useRef<null|(()=>Promise<void>)>(null); const locked=useRef(false);
  // A failed transition retains its original payload (including audio) for safe retry.
  async function run(label:string, action:()=>Promise<void>) {
    if(locked.current)return; locked.current=true; setBusy(label);setError(""); retry.current=()=>run(label,action);
    try {await action();retry.current=null;} catch(e) {setError(e instanceof Error ? e.message : "Something went wrong. Try again.");}
    finally {locked.current=false;setBusy("");}
  }
  function start() {void run("Preparing your interview…",async()=>{const q=await api.question(level,topic);setQuestion(q);setAngles(q.follow_up_angles);setCode(initialCode);setStage("coding");});}
  async function nextFollowup(result:CodingResult, conversation:Turn[], remaining:string[]) {
    const next=await api.followup({question_id:question!.id, transcript:result.transcript, code, execution_results:result.execution_results, conversation_history:conversation, remaining_angles:remaining});
    setFollowup(next);setHistory([...conversation,{role:"interviewer",text:next.followup_text,angle:next.angle_used}]);
    setAngles(remaining.filter(a=>a!==next.angle_used));setAudio(undefined);setStage("followup");
  }
  function submitCoding(blob:Blob) {
    setAudio(blob);
    // Checkpoint the upload result before requesting a follow-up, so retries don't upload twice.
    let result=coding;
    void run("Analyzing your solution…",async()=>{
      if(!result) {result=await api.submitCoding(question!.id,blob,code);setCoding(result);}
      await nextFollowup(result,[{role:"interviewer",text:question!.prompt},{role:"candidate",text:result.transcript}],angles);
    });
  }
  function submitAnswer(blob:Blob) {
    setAudio(blob); let conversation:Turn[]|undefined;
    void run(count===2 ? "Building your feedback report…" : "Preparing your next follow-up…",async()=>{
      if(!conversation) {const answer=await api.submitAnswer(blob);conversation=[...history,{role:"candidate",text:answer.transcript}];}
      if(count===2) {const final=await api.report({question_id:question!.id,code,execution_results:coding!.execution_results,full_conversation:conversation});setReport(final);setHistory(conversation);setAudio(undefined);setCount(3);setStage("results");}
      else {await nextFollowup(coding!,conversation,angles);setCount(count+1);}
    });
  }
  function download() {void run("Preparing your download…",async()=>{const blob=await api.document(report!);const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="interview-report.txt";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);});}
  function reset() {setStage("setup");setQuestion(undefined);setCoding(undefined);setHistory([]);setAngles([]);setFollowup(undefined);setCount(0);setReport(undefined);setAudio(undefined);setError("");retry.current=null;}
  const step=stage === "setup" ? 0 : stage === "coding" ? 1 : stage === "followup" ? 2 : 3;
  return <main>
    <header><a className="brand" href="/" aria-label="Interview Coach home"><span className="brand-icon">⌘</span> interview<span className="brand-light">coach</span></a><span className="pill">MOCK BACKEND <span className="small-dot"/></span></header>
    <div className="shell"><nav aria-label="Interview progress" className="steps">{["Set up","Coding","Follow-ups","Your report"].map((s,i)=><div key={s} className={i===step?"current":i<step?"complete":""} aria-current={i===step?"step":undefined}><span>{i<step?"✓":`0${i+1}`}</span>{s}</div>)}</nav>
    {error && <div className="error" role="alert">{error}<button className="text-button" disabled={!!busy} onClick={()=>void retry.current?.()}>Try Again</button></div>}
    {busy && <div className="loading" role="status" aria-live="polite"><span className="spinner"/>{busy}</div>}
    {stage === "setup" && <section className="landing"><div className="intro"><div className="eyebrow">YOUR NEXT INTERVIEW STARTS HERE</div><h1>Great code.<br/><em>Clear thinking.</em></h1><p className="lead">Practice the whole technical interview. Solve a problem, talk through your approach, and sharpen how you explain it.</p><div className="benefits"><p><span>01</span> A focused coding challenge</p><p><span>02</span> Three follow-up conversations</p><p><span>03</span> Feedback you can take with you</p></div><p className="privacy">↗ No account. No saved sessions. Just practice.</p></div>
    <div className="setup-card"><div className="card-top"><span className="eyebrow">MAKE IT YOURS</span><span>~ 20 min</span></div><h2>Set your challenge</h2><p>Choose where you want to grow.</p><fieldset disabled={!!busy}><legend>Experience level</legend><div className="level-group">{(["Junior","Mid","Senior"] as Level[]).map(l=><button key={l} className={level===l?"selected":""} aria-pressed={level===l} onClick={()=>setLevel(l)}>{l}</button>)}</div></fieldset><label htmlFor="topic">Problem topic</label><select id="topic" value={topic} disabled={!!busy} onChange={e=>setTopic(e.target.value as Topic)}>{["Arrays","Trees","Graphs","General"].map(t=><option key={t}>{t}</option>)}</select><div className="session-note"><span>◉</span><div><strong>Bring your voice</strong><p>You’ll need a microphone to explain your reasoning. Coding language: Python.</p></div></div><button className="wide" disabled={!!busy} onClick={start}>Start Interview <span>→</span></button><small>This prototype uses the same Two Sum challenge for every selection. Analysis and feedback are sample data.</small></div></section>}
    {stage === "coding" && question && <section><div className="section-title"><div><div className="eyebrow">CODING CHALLENGE</div><h1 className="screen-title">Let’s see how you think.</h1></div><span className="tag">{question.difficulty} / {question.topic}</span></div><div className="workspace"><article className="problem card"><span className="eyebrow">THE PROBLEM</span><h2>{question.title}</h2><p>{question.prompt}</p><h3>Examples</h3>{question.examples.map((e,i)=><pre key={i}>{e}</pre>)}<div className="hint"><strong>A little guidance</strong><p>Explain your approach before you code. Discuss trade-offs and walk through an example.</p></div></article><div className="code-card"><div className="editor-bar"><span>solution.py</span><span>Python 3</span></div><Editor height="410px" language="python" theme="vs-dark" value={code} onChange={v=>setCode(v||"")} options={{minimap:{enabled:false},fontSize:14,padding:{top:20},scrollBeyondLastLine:false,readOnly:!!busy || !!error,automaticLayout:true}}/><div className="editor-footer">Code is submitted for mock evaluation; it is not executed.</div></div></div><Recorder key="coding" onComplete={submitCoding} disabled={!!busy || !!error} hasAudio={!!audio}/></section>}
    {stage === "followup" && followup && <section className="followup"><div className="eyebrow">LET’S GO A LITTLE DEEPER</div><h1 className="screen-title">Talk through your thinking.</h1><div className="card followup-card"><div className="card-top"><span className="tag">FOLLOW-UP {count+1} OF 3</span><div className="dots">{[0,1,2].map(i=><span key={i} className={i<=count?"filled":""}/>)}</div></div><h2>{followup.followup_text}</h2><p>No need to type. Take a moment, then record your answer.</p></div><Recorder key={`followup-${count}`} onComplete={submitAnswer} disabled={!!busy || !!error} hasAudio={!!audio}/><details><summary>Your submitted solution</summary><pre className="submitted-code">{code}</pre></details></section>}
    {stage === "results" && report && <section><div className="section-title"><div><div className="eyebrow">INTERVIEW COMPLETE</div><h1 className="screen-title">A little better, every session.</h1><p>Sample feedback for this prototype. Your code and audio were not analyzed.</p></div><button disabled={!!busy} onClick={download}>Download Report <span>↓</span></button></div><div className="card objective"><h2>Objective Results <span className="tag">MOCK</span></h2><div className="metrics"><div><span>Test cases passed</span><strong>{report.objective.tests_passed}</strong></div><div><span>Expected complexity</span><strong>{report.objective.expected_complexity}</strong></div><div><span>Stated complexity</span><strong>{report.objective.stated_complexity}</strong></div></div></div><h2 className="feedback-heading">Feedback</h2><div className="feedback-grid">{([['strengths','What worked','✦'],['weaknesses','Room to grow','↗'],['suggestions','Your next steps','→']] as const).map(([key,title,icon])=><article className="card" key={key}><span className="feedback-icon">{icon}</span><h3>{title}</h3><ul>{report.subjective[key].map(t=><li key={t}>{t}</li>)}</ul></article>)}</div><div className="restart"><p>Progress comes from showing up again.</p><button className="secondary" onClick={reset} disabled={!!busy}>Start a New Interview →</button></div></section>}
    <footer><span>Practice with intention.</span><span>Built for your next opportunity.</span></footer></div>
  </main>;
}

````

## frontend/components/Recorder.tsx

````tsx
"use client";
import {useEffect, useRef, useState} from "react";
type Props = {onComplete: (audio: Blob) => void; disabled: boolean; hasAudio: boolean};
export default function Recorder({onComplete, disabled, hasAudio}: Props) {
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const active = useRef(true);
  const [status,setStatus] = useState<"idle"|"requesting"|"recording"|"stopping">("idle");
  const [error,setError] = useState("");
  const [seconds,setSeconds] = useState(0);
  useEffect(() => {active.current=true; return () => {active.current=false; if(recorder.current?.state === "recording") recorder.current.stop(); stream.current?.getTracks().forEach(t=>t.stop());};}, []);
  useEffect(() => {if(status !== "recording") return; const timer=setInterval(()=>setSeconds(s=>s+1),1000); return ()=>clearInterval(timer);},[status]);
  async function start() {
    setError(""); setStatus("requesting");
    try {
      if(!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("Recording requires a supported browser on HTTPS or localhost.");
      const media = await navigator.mediaDevices.getUserMedia({audio:true});
      if(!active.current) {media.getTracks().forEach(t=>t.stop());return;}
      stream.current=media;
      const mimeType=["audio/webm;codecs=opus","audio/mp4","audio/ogg;codecs=opus"].find(t=>MediaRecorder.isTypeSupported(t));
      const rec=new MediaRecorder(media,mimeType?{mimeType}:undefined); recorder.current=rec;
      const chunks: Blob[]=[];
      rec.ondataavailable=e=>{if(e.data.size) chunks.push(e.data);};
      rec.onstop=()=>{
        media.getTracks().forEach(t=>t.stop());
        if(!active.current) return;
        setStatus("idle"); const blob=new Blob(chunks,{type:rec.mimeType || "audio/webm"});
        if(blob.size) onComplete(blob); else setError("No audio was captured. Please record again.");
      };
      rec.onerror=()=>{rec.onstop=null; if(rec.state!=="inactive")rec.stop(); media.getTracks().forEach(t=>t.stop()); if(active.current){setStatus("idle");setError("Recording failed. Please try again.");}};
      rec.start(1000); setSeconds(0); setStatus("recording");
    } catch(e) {
      stream.current?.getTracks().forEach(t=>t.stop());
      if(active.current) {setStatus("idle");setError(e instanceof DOMException && e.name === "NotAllowedError" ? "Microphone access was denied. Allow microphone access in your browser settings, then try again." : e instanceof Error ? e.message : "Could not start recording.");}
    }
  }
  function stop() {if(recorder.current?.state === "recording") {setStatus("stopping");recorder.current.stop();}}
  return <div className="recorder">
    <div><strong>{status === "recording" ? <><span className="record-dot"/> Recording · {Math.floor(seconds/60)}:{String(seconds%60).padStart(2,"0")}</> : hasAudio ? "Answer captured" : "Think out loud"}</strong><p>{status === "recording" ? "Your microphone is on. Walk through your reasoning." : "Record your explanation, then submit when you’re ready."}</p></div>
    {status === "recording" ? <button onClick={stop}>I’m Done <span>→</span></button> : <button disabled={disabled || status !== "idle"} onClick={start}>{status === "requesting" ? "Allow microphone…" : status === "stopping" ? "Finishing…" : hasAudio ? "Record Again" : "Start Recording"} <span>●</span></button>}
    {error && <div className="error" role="alert">{error} <button className="text-button" onClick={start} disabled={disabled}>Try Again</button></div>}
  </div>;
}

````

## frontend/lib/api.ts

````ts
import type {Question, Level, Topic, CodingResult, Followup, FollowupRequest, Report, ReportRequest} from "./types";
// All HTTP calls live here. Real backend implementation keeps this contract unchanged.
const BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "");
async function request(path: string, init?: RequestInit): Promise<Response> {
  try {
    const response = await fetch(`${BASE}${path}`, {...init, signal: AbortSignal.timeout(60000)});
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(typeof body?.detail === "string" ? body.detail : `Request failed (${response.status}). Please try again.`);
    }
    return response;
  } catch (error) {
    if (error instanceof TypeError) throw new Error("Cannot reach the interview service. Check that FastAPI is running and try again.");
    throw error;
  }
}
async function json<T>(path: string, body: unknown): Promise<T> {
  return (await request(path, {method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body)})).json();
}
function audioForm(audio: Blob): FormData {
  const form = new FormData();
  const extension = audio.type.includes("mp4") ? "m4a" : audio.type.includes("ogg") ? "ogg" : "webm";
  form.append("audio", audio, `answer.${extension}`); return form;
}
export const api = {
  question: async (level: Level, topic: Topic): Promise<Question> => (await request(`/api/question?${new URLSearchParams({level,topic})}`)).json(),
  submitCoding: async (question_id: string, audio: Blob, code: string): Promise<CodingResult> => {
    const body = audioForm(audio); body.append("question_id", question_id); body.append("code", code);
    return (await request("/api/submit-coding-phase", {method:"POST", body})).json();
  },
  followup: (body: FollowupRequest) => json<Followup>("/api/generate-followup",body),
  submitAnswer: async (audio: Blob): Promise<{transcript:string}> => (await request("/api/submit-followup-answer", {method:"POST",body:audioForm(audio)})).json(),
  report: (body: ReportRequest) => json<Report>("/api/generate-report", body),
  document: async (report: Report): Promise<Blob> => (await request("/api/generate-document", {method:"POST", headers:{"Content-Type":"application/json"},body:JSON.stringify({report})})).blob(),
};

````

## frontend/lib/types.ts

````ts
export type Level = "Junior" | "Mid" | "Senior";
export type Topic = "Arrays" | "Trees" | "Graphs" | "General";
export type Question = {id: string; title: string; prompt: string; examples: string[]; difficulty: Level; topic: Topic; follow_up_angles: string[]};
export type Execution = {passed: number; total: number; failed_cases: string[]; expected_complexity: string; runtime_ms: number};
export type CodingResult = {transcript: string; execution_results: Execution};
export type Turn = {role: "interviewer" | "candidate"; text: string; angle?: string};
export type Followup = {followup_text: string; angle_used: string};
export type Report = {objective: {tests_passed: string; expected_complexity: string; stated_complexity: string}; subjective: {strengths: string[]; weaknesses: string[]; suggestions: string[]}};
export type FollowupRequest = {question_id: string; transcript: string; code: string; execution_results: Execution; conversation_history: Turn[]; remaining_angles: string[]};
export type ReportRequest = {question_id: string; code: string; execution_results: Execution; full_conversation: Turn[]};

````

## frontend/next-env.d.ts

````ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
import "./.next/types/routes.d.ts";
import "./.next/types/root-params.d.ts";

// NOTE: This file should not be edited
// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.

````

## frontend/next.config.ts

````ts
import type { NextConfig } from "next";
const config: NextConfig = {};
export default config;

````

## frontend/package-lock.json

````json
{
  "name": "interview-coach",
  "version": "1.0.0",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "interview-coach",
      "version": "1.0.0",
      "dependencies": {
        "@monaco-editor/react": "^4.7.0",
        "monaco-editor": "^0.55.1",
        "next": "^16.2.1",
        "react": "^19.2.0",
        "react-dom": "^19.2.0"
      },
      "devDependencies": {
        "@types/node": "^24.0.0",
        "@types/react": "^19.2.0",
        "@types/react-dom": "^19.2.0",
        "typescript": "^5.9.0"
      }
    },
    "node_modules/@emnapi/runtime": {
      "version": "1.11.3",
      "resolved": "https://registry.npmjs.org/@emnapi/runtime/-/runtime-1.11.3.tgz",
      "integrity": "sha512-Xz4Tpyki7XyrpbUK1jR1AhdAdaXyhhY4lZ3neLodmhpuWfy2PAQN5B46sAiU4liOXGLkHypn/qU+jvfWSCYYLA==",
      "license": "MIT",
      "optional": true,
      "dependencies": {
        "tslib": "^2.4.0"
      }
    },
    "node_modules/@img/colour": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/@img/colour/-/colour-1.1.0.tgz",
      "integrity": "sha512-Td76q7j57o/tLVdgS746cYARfSyxk8iEfRxewL9h4OMzYhbW4TAcppl0mT4eyqXddh6L/jwoM75mo7ixa/pCeQ==",
      "license": "MIT",
      "optional": true,
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@img/sharp-darwin-arm64": {
      "version": "0.35.5",
      "resolved": "https://registry.npmjs.org/@img/sharp-darwin-arm64/-/sharp-darwin-arm64-0.35.5.tgz",
      "integrity": "sha512-QRUlFQ0WxvdWyqqG/WtI3iupfD5rBzmCHXSdPsY91sAtVtTo7Q4cb6zOccZ3gqEqkr0f1As1ehLqmEpDsRf+lg==",
      "cpu": [
        "arm64"
      ],
      "license": "Apache-2.0",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": ">=20.9.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      },
      "optionalDependencies": {
        "@img/sharp-libvips-darwin-arm64": "1.3.4"
      }
    },
    "node_modules/@img/sharp-darwin-x64": {
      "version": "0.35.5",
      "resolved": "https://registry.npmjs.org/@img/sharp-darwin-x64/-/sharp-darwin-x64-0.35.5.tgz",
      "integrity": "sha512-+BR255RhDlpygUpOc/Jdt1nT6DQ3XG/ERo5wbcdOf5Q320dKtPCKPLR1LJs9VGXRaMa8l1uUa0tkCNOXiAxZUw==",
      "cpu": [
        "x64"
      ],
      "license": "Apache-2.0",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": ">=20.9.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      },
      "optionalDependencies": {
        "@img/sharp-libvips-darwin-x64": "1.3.4"
      }
    },
    "node_modules/@img/sharp-freebsd-wasm32": {
      "version": "0.35.5",
      "resolved": "https://registry.npmjs.org/@img/sharp-freebsd-wasm32/-/sharp-freebsd-wasm32-0.35.5.tgz",
      "integrity": "sha512-Y/z91nEZ4uIBX5X3nfTovjU9lHNKFYbL2lpHCLVNmXQK03VIZvXBBt0KxbPGp2SdGSF+2mQU4e+hQaWOt86iAw==",
      "license": "Apache-2.0",
      "optional": true,
      "os": [
        "freebsd"
      ],
      "dependencies": {
        "@img/sharp-wasm32": "0.35.5"
      },
      "engines": {
        "node": ">=20.9.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      }
    },
    "node_modules/@img/sharp-libvips-darwin-arm64": {
      "version": "1.3.4",
      "resolved": "https://registry.npmjs.org/@img/sharp-libvips-darwin-arm64/-/sharp-libvips-darwin-arm64-1.3.4.tgz",
      "integrity": "sha512-5R89nBYiRdUlSWJxPhO+GVtaXzXSxKnRu/xqMn3KTA3L9EB9Oy/P+Nn2f2vlhPuUdy/Zusb2DarbyTpGCfEDuw==",
      "cpu": [
        "arm64"
      ],
      "license": "LGPL-3.0-or-later",
      "optional": true,
      "os": [
        "darwin"
      ],
      "funding": {
        "url": "https://opencollective.com/libvips"
      }
    },
    "node_modules/@img/sharp-libvips-darwin-x64": {
      "version": "1.3.4",
      "resolved": "https://registry.npmjs.org/@img/sharp-libvips-darwin-x64/-/sharp-libvips-darwin-x64-1.3.4.tgz",
      "integrity": "sha512-iR2OKH80yi0U+dUplyh3/xdpFvps6YkCwsXenIJxqxR1v9o+xtKTGbS9H7cps+2Vxjc8B1j96p75NmTGjIhtpQ==",
      "cpu": [
        "x64"
      ],
      "license": "LGPL-3.0-or-later",
      "optional": true,
      "os": [
        "darwin"
      ],
      "funding": {
        "url": "https://opencollective.com/libvips"
      }
    },
    "node_modules/@img/sharp-libvips-linux-arm": {
      "version": "1.3.4",
      "resolved": "https://registry.npmjs.org/@img/sharp-libvips-linux-arm/-/sharp-libvips-linux-arm-1.3.4.tgz",
      "integrity": "sha512-LmRtTsOHuvM2+wlO2Db37dx5MiZhB0FvSunciw48YjdOkZz9KAiRbm8ujeMOA1INqmei5NapFxYEK1D1ZSidmw==",
      "cpu": [
        "arm"
      ],
      "license": "LGPL-3.0-or-later",
      "optional": true,
      "os": [
        "linux"
      ],
      "funding": {
        "url": "https://opencollective.com/libvips"
      }
    },
    "node_modules/@img/sharp-libvips-linux-arm64": {
      "version": "1.3.4",
      "resolved": "https://registry.npmjs.org/@img/sharp-libvips-linux-arm64/-/sharp-libvips-linux-arm64-1.3.4.tgz",
      "integrity": "sha512-Y3dgX/6lE2QhQb+Gxy0WZxfg9MEm/JBjamZpS2IklP7xIQoKN4hzAm7KcMVGtaVDt3neE9OKBC7vAfonA/Lr1A==",
      "cpu": [
        "arm64"
      ],
      "license": "LGPL-3.0-or-later",
      "optional": true,
      "os": [
        "linux"
      ],
      "funding": {
        "url": "https://opencollective.com/libvips"
      }
    },
    "node_modules/@img/sharp-libvips-linux-ppc64": {
      "version": "1.3.4",
      "resolved": "https://registry.npmjs.org/@img/sharp-libvips-linux-ppc64/-/sharp-libvips-linux-ppc64-1.3.4.tgz",
      "integrity": "sha512-Le6boB8Tai0Nis+gIxIpKx68UDVVIqdR8Tin5Yf1z2LJJQLDJvCDRqRu+jC2qCoD+eIomonmOwB4smBRxfVpYQ==",
      "cpu": [
        "ppc64"
      ],
      "license": "LGPL-3.0-or-later",
      "optional": true,
      "os": [
        "linux"
      ],
      "funding": {
        "url": "https://opencollective.com/libvips"
      }
    },
    "node_modules/@img/sharp-libvips-linux-riscv64": {
      "version": "1.3.4",
      "resolved": "https://registry.npmjs.org/@img/sharp-libvips-linux-riscv64/-/sharp-libvips-linux-riscv64-1.3.4.tgz",
      "integrity": "sha512-aHkkIEHPRdQEegJN20MLmGtxYD9R2wQr3Cwpddnu5+YKMt6Uzax7S9h5gpZTo8wyrGuZSlfQ63OevL5mTyOC7Q==",
      "cpu": [
        "riscv64"
      ],
      "license": "LGPL-3.0-or-later",
      "optional": true,
      "os": [
        "linux"
      ],
      "funding": {
        "url": "https://opencollective.com/libvips"
      }
    },
    "node_modules/@img/sharp-libvips-linux-s390x": {
      "version": "1.3.4",
      "resolved": "https://registry.npmjs.org/@img/sharp-libvips-linux-s390x/-/sharp-libvips-linux-s390x-1.3.4.tgz",
      "integrity": "sha512-ra/mB6MikESDUO7Yg+Mi95bFBb9GsObURuhnOv3OqknjGe9sZrG8tCe9q0xSIGrtLgvgw0gKnFWcK4blSgQOuQ==",
      "cpu": [
        "s390x"
      ],
      "license": "LGPL-3.0-or-later",
      "optional": true,
      "os": [
        "linux"
      ],
      "funding": {
        "url": "https://opencollective.com/libvips"
      }
    },
    "node_modules/@img/sharp-libvips-linux-x64": {
      "version": "1.3.4",
      "resolved": "https://registry.npmjs.org/@img/sharp-libvips-linux-x64/-/sharp-libvips-linux-x64-1.3.4.tgz",
      "integrity": "sha512-GJ//SSXbnwSDes02umB3nDJLFcQzw8a18V8fyhqr6tV515tOEMdImjjxj1AoafMRz56F3PHgftnj1QEKSU1zkw==",
      "cpu": [
        "x64"
      ],
      "license": "LGPL-3.0-or-later",
      "optional": true,
      "os": [
        "linux"
      ],
      "funding": {
        "url": "https://opencollective.com/libvips"
      }
    },
    "node_modules/@img/sharp-libvips-linuxmusl-arm64": {
      "version": "1.3.4",
      "resolved": "https://registry.npmjs.org/@img/sharp-libvips-linuxmusl-arm64/-/sharp-libvips-linuxmusl-arm64-1.3.4.tgz",
      "integrity": "sha512-hvulFwtjUcagsis6BBxHwGFwWoNZjgYmULGVrZcyfNbjA8hKILbRxGg15/7w5HDyXHXUos/j6baAWqnCyQ2DWA==",
      "cpu": [
        "arm64"
      ],
      "license": "LGPL-3.0-or-later",
      "optional": true,
      "os": [
        "linux"
      ],
      "funding": {
        "url": "https://opencollective.com/libvips"
      }
    },
    "node_modules/@img/sharp-libvips-linuxmusl-x64": {
      "version": "1.3.4",
      "resolved": "https://registry.npmjs.org/@img/sharp-libvips-linuxmusl-x64/-/sharp-libvips-linuxmusl-x64-1.3.4.tgz",
      "integrity": "sha512-6zXKeE/p39I1AmA3cJG35eyBGNqNddLnUXjhwBnsGjFPWqf5VKkDBEqaEkPDoTEtkxwi2vv8Tcr2mDyP4So7Fg==",
      "cpu": [
        "x64"
      ],
      "license": "LGPL-3.0-or-later",
      "optional": true,
      "os": [
        "linux"
      ],
      "funding": {
        "url": "https://opencollective.com/libvips"
      }
    },
    "node_modules/@img/sharp-linux-arm": {
      "version": "0.35.5",
      "resolved": "https://registry.npmjs.org/@img/sharp-linux-arm/-/sharp-linux-arm-0.35.5.tgz",
      "integrity": "sha512-LEaXK2WdXVK5ykcw0buWyPMsmLLL2vpHLD6yrNSW+JGEL3BZPA4tpKN6iaMc4AxTTAoaX/sU1rOL51lcIz48ZQ==",
      "cpu": [
        "arm"
      ],
      "license": "Apache-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=20.9.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      },
      "optionalDependencies": {
        "@img/sharp-libvips-linux-arm": "1.3.4"
      }
    },
    "node_modules/@img/sharp-linux-arm64": {
      "version": "0.35.5",
      "resolved": "https://registry.npmjs.org/@img/sharp-linux-arm64/-/sharp-linux-arm64-0.35.5.tgz",
      "integrity": "sha512-LYVx5JTsOM2CBzmxreh+nl64/3H6Xb09iSLknqH47z2T2DFFxDeFLP5y4dJwe6H7uGQlHPyEEtIqyo3DYsRwdQ==",
      "cpu": [
        "arm64"
      ],
      "license": "Apache-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=20.9.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      },
      "optionalDependencies": {
        "@img/sharp-libvips-linux-arm64": "1.3.4"
      }
    },
    "node_modules/@img/sharp-linux-ppc64": {
      "version": "0.35.5",
      "resolved": "https://registry.npmjs.org/@img/sharp-linux-ppc64/-/sharp-linux-ppc64-0.35.5.tgz",
      "integrity": "sha512-QVxAAq8evVRI9ia2vqgwrmWucn5Dfv+JdWzj75pD8omHLPSP7f8p20O8jxzjCcuCEQEOtYOZUmX1hkiZ0kdevA==",
      "cpu": [
        "ppc64"
      ],
      "license": "Apache-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=20.9.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      },
      "optionalDependencies": {
        "@img/sharp-libvips-linux-ppc64": "1.3.4"
      }
    },
    "node_modules/@img/sharp-linux-riscv64": {
      "version": "0.35.5",
      "resolved": "https://registry.npmjs.org/@img/sharp-linux-riscv64/-/sharp-linux-riscv64-0.35.5.tgz",
      "integrity": "sha512-LtdreXguaavKODPIfzJ4kffx7UNt1omwtK0rch4EBbbSTXPnxWmYSayXdLJw0fJzQ97kHt1gL/yh4tvU+nCyRQ==",
      "cpu": [
        "riscv64"
      ],
      "license": "Apache-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=20.9.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      },
      "optionalDependencies": {
        "@img/sharp-libvips-linux-riscv64": "1.3.4"
      }
    },
    "node_modules/@img/sharp-linux-s390x": {
      "version": "0.35.5",
      "resolved": "https://registry.npmjs.org/@img/sharp-linux-s390x/-/sharp-linux-s390x-0.35.5.tgz",
      "integrity": "sha512-UZasTOFiYzotTsGOCu42BfUzP6Tu6Do/947iRm1RsLKvlllxwGcn4RN27LibGWceix4Y+Pmw3jsnTcCQIgWjqA==",
      "cpu": [
        "s390x"
      ],
      "license": "Apache-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=20.9.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      },
      "optionalDependencies": {
        "@img/sharp-libvips-linux-s390x": "1.3.4"
      }
    },
    "node_modules/@img/sharp-linux-x64": {
      "version": "0.35.5",
      "resolved": "https://registry.npmjs.org/@img/sharp-linux-x64/-/sharp-linux-x64-0.35.5.tgz",
      "integrity": "sha512-SxFtLTeJInhAA9Q836kux2vZNeOBQEx658qvbboZScr0wIARym3IcGmW7KpVD5sbVg0Ojy+udFQdayYIZyoNog==",
      "cpu": [
        "x64"
      ],
      "license": "Apache-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=20.9.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      },
      "optionalDependencies": {
        "@img/sharp-libvips-linux-x64": "1.3.4"
      }
    },
    "node_modules/@img/sharp-linuxmusl-arm64": {
      "version": "0.35.5",
      "resolved": "https://registry.npmjs.org/@img/sharp-linuxmusl-arm64/-/sharp-linuxmusl-arm64-0.35.5.tgz",
      "integrity": "sha512-9HbMclmI1zlNkFRs3z9/eBtDjfD0sGlrX1z6b1qwmiFY5ElDLh4BC0LPBdVp7z1DXFiKlIcznf+ZlsuZzLxQqg==",
      "cpu": [
        "arm64"
      ],
      "license": "Apache-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=20.9.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      },
      "optionalDependencies": {
        "@img/sharp-libvips-linuxmusl-arm64": "1.3.4"
      }
    },
    "node_modules/@img/sharp-linuxmusl-x64": {
      "version": "0.35.5",
      "resolved": "https://registry.npmjs.org/@img/sharp-linuxmusl-x64/-/sharp-linuxmusl-x64-0.35.5.tgz",
      "integrity": "sha512-4KOphqB035HrVdqLZfCgMzzERrQkkzOwRhl4OAkRO1YCldbaFjySXMaK534Mo0V+LndnlJk+sbUyLeU0ULyD1A==",
      "cpu": [
        "x64"
      ],
      "license": "Apache-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=20.9.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      },
      "optionalDependencies": {
        "@img/sharp-libvips-linuxmusl-x64": "1.3.4"
      }
    },
    "node_modules/@img/sharp-wasm32": {
      "version": "0.35.5",
      "resolved": "https://registry.npmjs.org/@img/sharp-wasm32/-/sharp-wasm32-0.35.5.tgz",
      "integrity": "sha512-Ptsga1su4tQx+LLF1ECS9U6nz5kmrXKo6XVbtR48Ke3ZRxxgaWBu7IDtEe1quo8hiupwm6WFqxVlXaSf7IINGQ==",
      "license": "Apache-2.0 AND LGPL-3.0-or-later AND MIT",
      "optional": true,
      "dependencies": {
        "@emnapi/runtime": "^1.11.3"
      },
      "engines": {
        "node": ">=20.9.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      }
    },
    "node_modules/@img/sharp-webcontainers-wasm32": {
      "version": "0.35.5",
      "resolved": "https://registry.npmjs.org/@img/sharp-webcontainers-wasm32/-/sharp-webcontainers-wasm32-0.35.5.tgz",
      "integrity": "sha512-hfhF/FmoQyTUkA0bIKFOtw536BQSeBMe6BF6QyWlrPxT754+TFLaZ7sKKTfvvM0yJgKgaYTwnFCIZ/GuDw5SUA==",
      "cpu": [
        "wasm32"
      ],
      "license": "Apache-2.0",
      "optional": true,
      "dependencies": {
        "@img/sharp-wasm32": "0.35.5"
      },
      "engines": {
        "node": ">=20.9.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      }
    },
    "node_modules/@img/sharp-win32-arm64": {
      "version": "0.35.5",
      "resolved": "https://registry.npmjs.org/@img/sharp-win32-arm64/-/sharp-win32-arm64-0.35.5.tgz",
      "integrity": "sha512-X4t7g+7ZA5DKblCBEXGjUqqemj4vczING/5viFwAL8h4N3qYeyjwdCvRLHi4EdOUI+2Z7UFlp1VM+p/AuEtm6Q==",
      "cpu": [
        "arm64"
      ],
      "license": "Apache-2.0 AND LGPL-3.0-or-later",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": ">=20.9.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      }
    },
    "node_modules/@img/sharp-win32-ia32": {
      "version": "0.35.5",
      "resolved": "https://registry.npmjs.org/@img/sharp-win32-ia32/-/sharp-win32-ia32-0.35.5.tgz",
      "integrity": "sha512-5Zm82LoBc43nhwNybZlG7Y1KO//Zhsn306fQl29ZOuStHLGTo3BWL83q3cznX0poxSAMuYL1On/BHBxkBeKr6A==",
      "cpu": [
        "ia32"
      ],
      "license": "Apache-2.0 AND LGPL-3.0-or-later",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": "^20.9.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      }
    },
    "node_modules/@img/sharp-win32-x64": {
      "version": "0.35.5",
      "resolved": "https://registry.npmjs.org/@img/sharp-win32-x64/-/sharp-win32-x64-0.35.5.tgz",
      "integrity": "sha512-x76eH0vEiHlcMQu8Y8IenntaACtddpT6W0wmXtWrnKcnKI7ME5DdgqhAD6SEWOEl1v2zDvkZDhFA9KnURwpfqg==",
      "cpu": [
        "x64"
      ],
      "license": "Apache-2.0 AND LGPL-3.0-or-later",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": ">=20.9.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      }
    },
    "node_modules/@monaco-editor/loader": {
      "version": "1.7.0",
      "resolved": "https://registry.npmjs.org/@monaco-editor/loader/-/loader-1.7.0.tgz",
      "integrity": "sha512-gIwR1HrJrrx+vfyOhYmCZ0/JcWqG5kbfG7+d3f/C1LXk2EvzAbHSg3MQ5lO2sMlo9izoAZ04shohfKLVT6crVA==",
      "license": "MIT",
      "dependencies": {
        "state-local": "^1.0.6"
      }
    },
    "node_modules/@monaco-editor/react": {
      "version": "4.7.0",
      "resolved": "https://registry.npmjs.org/@monaco-editor/react/-/react-4.7.0.tgz",
      "integrity": "sha512-cyzXQCtO47ydzxpQtCGSQGOC8Gk3ZUeBXFAxD+CWXYFo5OqZyZUonFl0DwUlTyAfRHntBfw2p3w4s9R6oe1eCA==",
      "license": "MIT",
      "dependencies": {
        "@monaco-editor/loader": "^1.5.0"
      },
      "peerDependencies": {
        "monaco-editor": ">= 0.25.0 < 1",
        "react": "^16.8.0 || ^17.0.0 || ^18.0.0 || ^19.0.0",
        "react-dom": "^16.8.0 || ^17.0.0 || ^18.0.0 || ^19.0.0"
      }
    },
    "node_modules/@next/env": {
      "version": "16.4.0",
      "resolved": "https://registry.npmjs.org/@next/env/-/env-16.4.0.tgz",
      "integrity": "sha512-pyLlT5oafGlX8X7xjgGNXz5dNIDSxREm+qD6i9VLSZiZFopA/XWl8NM/KPmLx/8EG/++c49iid3gNWSQW1+2dQ==",
      "license": "MIT"
    },
    "node_modules/@next/swc-darwin-arm64": {
      "version": "16.4.0",
      "resolved": "https://registry.npmjs.org/@next/swc-darwin-arm64/-/swc-darwin-arm64-16.4.0.tgz",
      "integrity": "sha512-yyZ+9MgViAKLLb5l1gPBGjRwnq3teNLb5Zx6JEw8LzNSTjlsnp+baUHFxTgl7PpjCmKf48VQfyipG1eBflb48Q==",
      "cpu": [
        "arm64"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": ">= 10"
      }
    },
    "node_modules/@next/swc-darwin-x64": {
      "version": "16.4.0",
      "resolved": "https://registry.npmjs.org/@next/swc-darwin-x64/-/swc-darwin-x64-16.4.0.tgz",
      "integrity": "sha512-RePEEejEj1Auf5s9qEcG0JbcDP3ceNUS/ofNX8AhxzgIjTVlZIHMatlp16YplcSMpsVo/ZMQHJTjbMYJznjGUg==",
      "cpu": [
        "x64"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": ">= 10"
      }
    },
    "node_modules/@next/swc-linux-arm64-gnu": {
      "version": "16.4.0",
      "resolved": "https://registry.npmjs.org/@next/swc-linux-arm64-gnu/-/swc-linux-arm64-gnu-16.4.0.tgz",
      "integrity": "sha512-HhsyCqd+NpmvDDVY/LqkAN24f+QVvXh3ie+PfcwKinWL2Mu826JymQxJXGjAIfmJ4VlHjp4Pe/nZtXtUoEMAqw==",
      "cpu": [
        "arm64"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">= 10"
      }
    },
    "node_modules/@next/swc-linux-arm64-musl": {
      "version": "16.4.0",
      "resolved": "https://registry.npmjs.org/@next/swc-linux-arm64-musl/-/swc-linux-arm64-musl-16.4.0.tgz",
      "integrity": "sha512-sN9Pf+Zh+RpZAOmbR7d8KAA8T61CVhawtbEJ2Bk6QrRzx6Z/6haaF4UiwBzytM96GRRRWZh9/WALIEO3npMamA==",
      "cpu": [
        "arm64"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">= 10"
      }
    },
    "node_modules/@next/swc-linux-x64-gnu": {
      "version": "16.4.0",
      "resolved": "https://registry.npmjs.org/@next/swc-linux-x64-gnu/-/swc-linux-x64-gnu-16.4.0.tgz",
      "integrity": "sha512-D5M5xLWQVd1CvR+L7BickM1weRfmM41x3L1NWcnKY/oyJJqr1qwaCgmu3dMAhLBOMdZwSuDCRV6DJRRpiUkbDQ==",
      "cpu": [
        "x64"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">= 10"
      }
    },
    "node_modules/@next/swc-linux-x64-musl": {
      "version": "16.4.0",
      "resolved": "https://registry.npmjs.org/@next/swc-linux-x64-musl/-/swc-linux-x64-musl-16.4.0.tgz",
      "integrity": "sha512-8d5WLS6a9YalqpOgXdlbvonFu+sIgjA+CO6tGzetrpPVcUL56foa7B7664h41rAlbLi5fJwK4vWji3zf4QDy+w==",
      "cpu": [
        "x64"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">= 10"
      }
    },
    "node_modules/@next/swc-win32-arm64-msvc": {
      "version": "16.4.0",
      "resolved": "https://registry.npmjs.org/@next/swc-win32-arm64-msvc/-/swc-win32-arm64-msvc-16.4.0.tgz",
      "integrity": "sha512-sQuOIiW3snb48UwrBcDMvFA/u03qtw2LeuSIxFIQ9AJuW9UG/4Ddsfo+eV73PnZwBhyncMtsKVh7PrzMol2/fA==",
      "cpu": [
        "arm64"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": ">= 10"
      }
    },
    "node_modules/@next/swc-win32-x64-msvc": {
      "version": "16.4.0",
      "resolved": "https://registry.npmjs.org/@next/swc-win32-x64-msvc/-/swc-win32-x64-msvc-16.4.0.tgz",
      "integrity": "sha512-6/33lCuxpdHUy27RegyGM/5uTpF7YZd3UR4D0gpkOA/tWY5YR7msbQjqPgCZmSmxrrTLGCXYA4A8vT2H5DPGTQ==",
      "cpu": [
        "x64"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": ">= 10"
      }
    },
    "node_modules/@swc/helpers": {
      "version": "0.5.23",
      "resolved": "https://registry.npmjs.org/@swc/helpers/-/helpers-0.5.23.tgz",
      "integrity": "sha512-5lSsMOTXURePglDfvuAQUqkGek9Hg2kksOYay2m0+XR++b2NWYL/4sWyuvVBIs8oKnJaxkdi9whaL/sqN13afw==",
      "license": "Apache-2.0",
      "dependencies": {
        "tslib": "^2.8.0"
      }
    },
    "node_modules/@types/node": {
      "version": "24.19.1",
      "resolved": "https://registry.npmjs.org/@types/node/-/node-24.19.1.tgz",
      "integrity": "sha512-aS3/DG0oM05K0RIXXP+hKjinGG5IgSSVGzswZxW3O0sS3pH4/fycXundUC9XsszgKCk4gHXylTEK6hyFxVxnoQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "undici-types": ">=7.24.0 <7.24.7"
      }
    },
    "node_modules/@types/react": {
      "version": "19.3.0",
      "resolved": "https://registry.npmjs.org/@types/react/-/react-19.3.0.tgz",
      "integrity": "sha512-N0rFCuH9YoxG9/m61l9MfpJKfmLOVU0em7ipIz6TRgSSkvReLB9vL85GB+yr8Bs5leqpvg96JSwF4ZS1s4viQg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "csstype": "^3.2.2"
      }
    },
    "node_modules/@types/react-dom": {
      "version": "19.3.0",
      "resolved": "https://registry.npmjs.org/@types/react-dom/-/react-dom-19.3.0.tgz",
      "integrity": "sha512-ZI7bU42mZXXKHn/qNLEw2IrbiINU7X5+vfgdixBHkCNpYWXjKgfQ/P+uyGb5CjOLB9UcnTeg3rylQtV2hym44Q==",
      "dev": true,
      "license": "MIT",
      "peerDependencies": {
        "@types/react": "^19.3.0"
      }
    },
    "node_modules/@types/trusted-types": {
      "version": "2.0.7",
      "resolved": "https://registry.npmjs.org/@types/trusted-types/-/trusted-types-2.0.7.tgz",
      "integrity": "sha512-ScaPdn1dQczgbl0QFTeTOmVHFULt394XJgOQNoyVhZ6r2vLnMLJfBPd53SB52T/3G36VI1/g2MZaX0cwDuXsfw==",
      "license": "MIT",
      "optional": true
    },
    "node_modules/baseline-browser-mapping": {
      "version": "2.11.27",
      "resolved": "https://registry.npmjs.org/baseline-browser-mapping/-/baseline-browser-mapping-2.11.27.tgz",
      "integrity": "sha512-ElY12DaROGuan+lMmZ8Cvo/ZUbXPe7Enc/9VU/b1T3Kp4dwytRcNdR8DoSJN5SNJT/CuvcCA0DHDVmMOCePdRQ==",
      "license": "Apache-2.0",
      "bin": {
        "baseline-browser-mapping": "dist/cli.cjs"
      },
      "engines": {
        "node": ">=6.0.0"
      }
    },
    "node_modules/caniuse-lite": {
      "version": "1.0.30001814",
      "resolved": "https://registry.npmjs.org/caniuse-lite/-/caniuse-lite-1.0.30001814.tgz",
      "integrity": "sha512-/Uaf1lAzr59XcMpW0o96WoEfr+VXK2OX4U9AgFoiSHsVJ4HppnIFUjtYzsyDH2+tgANaQb2/oxYGwCPapN1FpA==",
      "funding": [
        {
          "type": "opencollective",
          "url": "https://opencollective.com/browserslist"
        },
        {
          "type": "tidelift",
          "url": "https://tidelift.com/funding/github/npm/caniuse-lite"
        },
        {
          "type": "github",
          "url": "https://github.com/sponsors/ai"
        }
      ],
      "license": "CC-BY-4.0"
    },
    "node_modules/client-only": {
      "version": "0.0.1",
      "resolved": "https://registry.npmjs.org/client-only/-/client-only-0.0.1.tgz",
      "integrity": "sha512-IV3Ou0jSMzZrd3pZ48nLkT9DA7Ag1pnPzaiQhpW7c3RbcqqzvzzVu+L8gfqMp/8IM2MQtSiqaCxrrcfu8I8rMA==",
      "license": "MIT"
    },
    "node_modules/csstype": {
      "version": "3.2.3",
      "resolved": "https://registry.npmjs.org/csstype/-/csstype-3.2.3.tgz",
      "integrity": "sha512-z1HGKcYy2xA8AGQfwrn0PAy+PB7X/GSj3UVJW9qKyn43xWa+gl5nXmU4qqLMRzWVLFC8KusUX8T/0kCiOYpAIQ==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/detect-libc": {
      "version": "2.1.2",
      "resolved": "https://registry.npmjs.org/detect-libc/-/detect-libc-2.1.2.tgz",
      "integrity": "sha512-Btj2BOOO83o3WyH59e8MgXsxEQVcarkUOpEYrubB0urwnN10yQ364rsiByU11nZlqWYZm05i/of7io4mzihBtQ==",
      "license": "Apache-2.0",
      "optional": true,
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/dompurify": {
      "version": "3.2.7",
      "resolved": "https://registry.npmjs.org/dompurify/-/dompurify-3.2.7.tgz",
      "integrity": "sha512-WhL/YuveyGXJaerVlMYGWhvQswa7myDG17P7Vu65EWC05o8vfeNbvNf4d/BOvH99+ZW+LlQsc1GDKMa1vNK6dw==",
      "license": "(MPL-2.0 OR Apache-2.0)",
      "optionalDependencies": {
        "@types/trusted-types": "^2.0.7"
      }
    },
    "node_modules/marked": {
      "version": "14.0.0",
      "resolved": "https://registry.npmjs.org/marked/-/marked-14.0.0.tgz",
      "integrity": "sha512-uIj4+faQ+MgHgwUW1l2PsPglZLOLOT1uErt06dAPtx2kjteLAkbsd/0FiYg/MGS+i7ZKLb7w2WClxHkzOOuryQ==",
      "license": "MIT",
      "bin": {
        "marked": "bin/marked.js"
      },
      "engines": {
        "node": ">= 18"
      }
    },
    "node_modules/monaco-editor": {
      "version": "0.55.1",
      "resolved": "https://registry.npmjs.org/monaco-editor/-/monaco-editor-0.55.1.tgz",
      "integrity": "sha512-jz4x+TJNFHwHtwuV9vA9rMujcZRb0CEilTEwG2rRSpe/A7Jdkuj8xPKttCgOh+v/lkHy7HsZ64oj+q3xoAFl9A==",
      "license": "MIT",
      "dependencies": {
        "dompurify": "3.2.7",
        "marked": "14.0.0"
      }
    },
    "node_modules/nanoid": {
      "version": "3.3.20",
      "resolved": "https://registry.npmjs.org/nanoid/-/nanoid-3.3.20.tgz",
      "integrity": "sha512-uKdg2G3GNCKQn9byYOpxbGqrT2fGO5KRt5J/8b3pok8rT6qxGWF6hxMyJiEYtAf+FVyYuD9hRaDqX5uPFYJ4ZQ==",
      "funding": [
        {
          "type": "github",
          "url": "https://github.com/sponsors/ai"
        }
      ],
      "license": "MIT",
      "bin": {
        "nanoid": "bin/nanoid.cjs"
      },
      "engines": {
        "node": "^10 || ^12 || ^13.7 || ^14 || >=15.0.1"
      }
    },
    "node_modules/next": {
      "version": "16.4.0",
      "resolved": "https://registry.npmjs.org/next/-/next-16.4.0.tgz",
      "integrity": "sha512-N2C+9q89Z/oLrsepSRS4jRMtwmUZAoZuAHU0e9T6+sAB5DdhADmrnOW+zjYijlrYFmVfmQhGVGy9eMFoB7UgKg==",
      "license": "MIT",
      "dependencies": {
        "@next/env": "16.4.0",
        "@swc/helpers": "0.5.23",
        "baseline-browser-mapping": "^2.9.19",
        "caniuse-lite": "^1.0.30001579",
        "postcss": "8.5.23",
        "styled-jsx": "5.1.6"
      },
      "bin": {
        "next": "dist/bin/next"
      },
      "engines": {
        "node": ">=20.9.0"
      },
      "optionalDependencies": {
        "@next/swc-darwin-arm64": "16.4.0",
        "@next/swc-darwin-x64": "16.4.0",
        "@next/swc-linux-arm64-gnu": "16.4.0",
        "@next/swc-linux-arm64-musl": "16.4.0",
        "@next/swc-linux-x64-gnu": "16.4.0",
        "@next/swc-linux-x64-musl": "16.4.0",
        "@next/swc-win32-arm64-msvc": "16.4.0",
        "@next/swc-win32-x64-msvc": "16.4.0",
        "sharp": "^0.35.4"
      },
      "peerDependencies": {
        "@opentelemetry/api": "^1.1.0",
        "@playwright/test": "^1.51.1",
        "babel-plugin-react-compiler": "*",
        "react": "^18.2.0 || 19.0.0-rc-de68d2f4-20241204 || ^19.0.0",
        "react-dom": "^18.2.0 || 19.0.0-rc-de68d2f4-20241204 || ^19.0.0",
        "sass": "^1.3.0"
      },
      "peerDependenciesMeta": {
        "@opentelemetry/api": {
          "optional": true
        },
        "@playwright/test": {
          "optional": true
        },
        "babel-plugin-react-compiler": {
          "optional": true
        },
        "sass": {
          "optional": true
        }
      }
    },
    "node_modules/picocolors": {
      "version": "1.1.1",
      "resolved": "https://registry.npmjs.org/picocolors/-/picocolors-1.1.1.tgz",
      "integrity": "sha512-xceH2snhtb5M9liqDsmEw56le376mTZkEX/jEb/RxNFyegNul7eNslCXP9FDj/Lcu0X8KEyMceP2ntpaHrDEVA==",
      "license": "ISC"
    },
    "node_modules/postcss": {
      "version": "8.5.23",
      "resolved": "https://registry.npmjs.org/postcss/-/postcss-8.5.23.tgz",
      "integrity": "sha512-g50586zr4bZmwFiTlflMu8E0bDTb5I5gertgwAKmsdUlTQIhZtunzUlD1WSzwcVWPoAVpsrA6vlfCD7oXvRwgg==",
      "funding": [
        {
          "type": "opencollective",
          "url": "https://opencollective.com/postcss/"
        },
        {
          "type": "tidelift",
          "url": "https://tidelift.com/funding/github/npm/postcss"
        },
        {
          "type": "github",
          "url": "https://github.com/sponsors/ai"
        }
      ],
      "license": "MIT",
      "dependencies": {
        "nanoid": "^3.3.16",
        "picocolors": "^1.1.1",
        "source-map-js": "^1.2.1"
      },
      "engines": {
        "node": "^10 || ^12 || >=14"
      }
    },
    "node_modules/react": {
      "version": "19.3.0",
      "resolved": "https://registry.npmjs.org/react/-/react-19.3.0.tgz",
      "integrity": "sha512-E8LUcbtBWt20bbl2YoHfx4ZDBdxVTfOKtCZn9cDSJ4l6/nuoApcpIBcj47t2wZoVX8g2ZHuMHbiShgCR1T5Sog==",
      "license": "MIT",
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/react-dom": {
      "version": "19.3.0",
      "resolved": "https://registry.npmjs.org/react-dom/-/react-dom-19.3.0.tgz",
      "integrity": "sha512-JDk8dgif51OjFoDE70+OT9ICyYr+69HlmihNwp1+Nsfbna3t5sIiCa9ZJktDmQ4/1b/rn26hIAR2uYXDMr5r0Q==",
      "license": "MIT",
      "dependencies": {
        "scheduler": "^0.28.0"
      },
      "peerDependencies": {
        "react": "^19.3.0"
      }
    },
    "node_modules/scheduler": {
      "version": "0.28.0",
      "resolved": "https://registry.npmjs.org/scheduler/-/scheduler-0.28.0.tgz",
      "integrity": "sha512-juorfCmIkIw8tT+p5BXSm6PJjQF/ycEYmKyzURCIt/RaZIhL+PulbQ9Yu2z1HdOJDdqDTlxA1+xKBmHXJsczAw==",
      "license": "MIT"
    },
    "node_modules/semver": {
      "version": "7.8.5",
      "resolved": "https://registry.npmjs.org/semver/-/semver-7.8.5.tgz",
      "integrity": "sha512-Y7/KDsb8LjooZpwaqGyulO6DQlksgCncchHGk+sZIY4SBvUocMBEFH5Ur1fI4dV+Jvl0w6cjvucaIi40puRioA==",
      "license": "ISC",
      "optional": true,
      "bin": {
        "semver": "bin/semver.js"
      },
      "engines": {
        "node": ">=10"
      }
    },
    "node_modules/sharp": {
      "version": "0.35.5",
      "resolved": "https://registry.npmjs.org/sharp/-/sharp-0.35.5.tgz",
      "integrity": "sha512-Ywn4OnzGukp7CDMrp08RQ50YKmuwG47brZgIVPTvBaaAfQlRlygrRqSrxdCiL9M+LlzLBiJ68IR1QqvzHyjC7g==",
      "license": "Apache-2.0",
      "optional": true,
      "dependencies": {
        "@img/colour": "^1.1.0",
        "detect-libc": "^2.1.2",
        "semver": "^7.8.5"
      },
      "engines": {
        "node": ">=20.9.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      },
      "optionalDependencies": {
        "@img/sharp-darwin-arm64": "0.35.5",
        "@img/sharp-darwin-x64": "0.35.5",
        "@img/sharp-freebsd-wasm32": "0.35.5",
        "@img/sharp-libvips-darwin-arm64": "1.3.4",
        "@img/sharp-libvips-darwin-x64": "1.3.4",
        "@img/sharp-libvips-linux-arm": "1.3.4",
        "@img/sharp-libvips-linux-arm64": "1.3.4",
        "@img/sharp-libvips-linux-ppc64": "1.3.4",
        "@img/sharp-libvips-linux-riscv64": "1.3.4",
        "@img/sharp-libvips-linux-s390x": "1.3.4",
        "@img/sharp-libvips-linux-x64": "1.3.4",
        "@img/sharp-libvips-linuxmusl-arm64": "1.3.4",
        "@img/sharp-libvips-linuxmusl-x64": "1.3.4",
        "@img/sharp-linux-arm": "0.35.5",
        "@img/sharp-linux-arm64": "0.35.5",
        "@img/sharp-linux-ppc64": "0.35.5",
        "@img/sharp-linux-riscv64": "0.35.5",
        "@img/sharp-linux-s390x": "0.35.5",
        "@img/sharp-linux-x64": "0.35.5",
        "@img/sharp-linuxmusl-arm64": "0.35.5",
        "@img/sharp-linuxmusl-x64": "0.35.5",
        "@img/sharp-webcontainers-wasm32": "0.35.5",
        "@img/sharp-win32-arm64": "0.35.5",
        "@img/sharp-win32-ia32": "0.35.5",
        "@img/sharp-win32-x64": "0.35.5"
      },
      "peerDependenciesMeta": {
        "@types/node": {
          "optional": true
        }
      }
    },
    "node_modules/source-map-js": {
      "version": "1.2.2",
      "resolved": "https://registry.npmjs.org/source-map-js/-/source-map-js-1.2.2.tgz",
      "integrity": "sha512-KGj/8Y43x35aZVDtt+J4mK1hoLGHULMYfSkODJNQjNDC3oW1PqPoxMwo0pLUsWM/UEGzON/NxeHywEfNXNP3Vw==",
      "license": "BSD-3-Clause",
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/state-local": {
      "version": "1.0.7",
      "resolved": "https://registry.npmjs.org/state-local/-/state-local-1.0.7.tgz",
      "integrity": "sha512-HTEHMNieakEnoe33shBYcZ7NX83ACUjCu8c40iOGEZsngj9zRnkqS9j1pqQPXwobB0ZcVTk27REb7COQ0UR59w==",
      "license": "MIT"
    },
    "node_modules/styled-jsx": {
      "version": "5.1.6",
      "resolved": "https://registry.npmjs.org/styled-jsx/-/styled-jsx-5.1.6.tgz",
      "integrity": "sha512-qSVyDTeMotdvQYoHWLNGwRFJHC+i+ZvdBRYosOFgC+Wg1vx4frN2/RG/NA7SYqqvKNLf39P2LSRA2pu6n0XYZA==",
      "license": "MIT",
      "dependencies": {
        "client-only": "0.0.1"
      },
      "engines": {
        "node": ">= 12.0.0"
      },
      "peerDependencies": {
        "react": ">= 16.8.0 || 17.x.x || ^18.0.0-0 || ^19.0.0-0"
      },
      "peerDependenciesMeta": {
        "@babel/core": {
          "optional": true
        },
        "babel-plugin-macros": {
          "optional": true
        }
      }
    },
    "node_modules/tslib": {
      "version": "2.8.1",
      "resolved": "https://registry.npmjs.org/tslib/-/tslib-2.8.1.tgz",
      "integrity": "sha512-oJFu94HQb+KVduSUQL7wnpmqnfmLsOA/nAh6b6EH0wCEoK0/mPeXU6c3wKDV83MkOuHPRHtSXKKU99IBazS/2w==",
      "license": "0BSD"
    },
    "node_modules/typescript": {
      "version": "5.9.3",
      "resolved": "https://registry.npmjs.org/typescript/-/typescript-5.9.3.tgz",
      "integrity": "sha512-jl1vZzPDinLr9eUt3J/t7V6FgNEw9QjvBPdysz9KfQDD41fQrC2Y4vKQdiaUpFT4bXlb1RHhLpp8wtm6M5TgSw==",
      "dev": true,
      "license": "Apache-2.0",
      "bin": {
        "tsc": "bin/tsc",
        "tsserver": "bin/tsserver"
      },
      "engines": {
        "node": ">=14.17"
      }
    },
    "node_modules/undici-types": {
      "version": "7.24.6",
      "resolved": "https://registry.npmjs.org/undici-types/-/undici-types-7.24.6.tgz",
      "integrity": "sha512-WRNW+sJgj5OBN4/0JpHFqtqzhpbnV0GuB+OozA9gCL7a993SmU+1JBZCzLNxYsbMfIeDL+lTsphD5jN5N+n0zg==",
      "dev": true,
      "license": "MIT"
    }
  }
}

````

## frontend/package.json

````json
{
  "name": "interview-coach",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "next": "^16.2.1",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "@monaco-editor/react": "^4.7.0",
    "monaco-editor": "^0.55.1"
  },
  "devDependencies": {
    "typescript": "^5.9.0",
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "@types/node": "^24.0.0"
  }
}
````

## frontend/tsconfig.json

````json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": [
      "dom",
      "dom.iterable",
      "esnext"
    ],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ]
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts"
  ],
  "exclude": [
    "node_modules"
  ]
}

````
