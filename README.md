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
