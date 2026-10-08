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
