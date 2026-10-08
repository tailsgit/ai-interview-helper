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
