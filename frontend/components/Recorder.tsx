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
