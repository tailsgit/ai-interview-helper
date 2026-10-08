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
