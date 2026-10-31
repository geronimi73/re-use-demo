import { useEffect, useRef, useState } from "react";
import { decodeToMono, wavBlob, SAMPLE_RATE } from "./audio.js";
import MODEL_LICENSE from "./model-license.txt?raw";
import { track, lengthBucket, speedBucket } from "./analytics.js";

const EXAMPLES = [
  { file: "noisy-mic.wav", icon: "🎙️", label: "Noisy mic (official example)" },
  { file: "apollo11-small-step.mp3", icon: "🚀", label: "Apollo 11: One small step" },
  { file: "apollo11-eagle-has-landed.mp3", icon: "🚀", label: "Apollo 11: The Eagle has landed" },
  { file: "apollo13-houston-problem.mp3", icon: "🚀", label: "Apollo 13: Houston, we've had a problem" },
  { file: "apollo8-merry-christmas.mp3", icon: "🚀", label: "Apollo 8: Merry Christmas" },
  { file: "mercury6-god-speed.mp3", icon: "🚀", label: "Mercury 6: Godspeed" },
];
const STAGES = { decode: "Reading file", download: "Downloading model (39 MB, once)", setup: "Starting GPU", clean: "Cleaning" };

export default function App() {
  const [state, setState] = useState({ phase: "idle" });
  const [dragging, setDragging] = useState(false);
  const worker = useRef(null);
  const input = useRef(null);
  const urls = useRef([]);
  const hasGpu = typeof navigator !== "undefined" && "gpu" in navigator;

  // Free object URLs when the page goes away
  useEffect(() => () => urls.current.forEach(URL.revokeObjectURL), []);

  useEffect(() => { if (!hasGpu) track("No WebGPU"); }, [hasGpu]);

  const getWorker = () => {
    if (!worker.current) worker.current = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
    return worker.current;
  };

  // Decode on the main thread, clean in the worker
  const run = async (file, source = "own file") => {
    if (!file) return;
    urls.current.forEach(URL.revokeObjectURL);
    urls.current = [];
    try {
      setState({ phase: "working", stage: "decode", p: 0 });
      const { wav, duration } = await decodeToMono(file);
      if (duration < 0.1) throw new Error("This file has no audio.");
      let cleanStart = 0;
      const result = await new Promise((resolve, reject) => {
        const w = getWorker();
        w.onmessage = ({ data }) => {
          if (data.type === "progress") {
            if (data.stage === "clean" && !cleanStart) cleanStart = performance.now();
            const done = data.stage === "clean" ? data.p * duration : 0;
            const speed = done > 0 ? (performance.now() - cleanStart) / 1000 / done : null;
            setState({ phase: "working", stage: data.stage, p: data.p, speed });
          }
          else if (data.type === "done") resolve(data);
          else if (data.type === "error") reject(new Error(data.message));
        };
        w.onerror = (e) => reject(new Error(e.message || "worker failed"));
        w.postMessage({ type: "enhance", wav, sr: SAMPLE_RATE }, [wav.buffer]);
      });
      const original = URL.createObjectURL(file);
      const clean = URL.createObjectURL(wavBlob(result.wav, SAMPLE_RATE));
      urls.current = [original, clean];
      const seconds = result.ms / 1000;
      track("Cleaned", { source, length: lengthBucket(duration), speed: speedBucket(seconds / duration) });
      setState({
        phase: "done", original, clean, duration, seconds,
        name: file.name.replace(/\.[^.]+$/, "") + "-clean.wav",
      });
    } catch (e) {
      setState({ phase: "error", message: e.message });
      track("Error", { message: String(e.message).slice(0, 200) });
    }
  };

  const loadExample = async (example = EXAMPLES[0]) => {
    const blob = await (await fetch(`${import.meta.env.BASE_URL}examples/${example.file}`)).blob();
    run(new File([blob], example.file, { type: blob.type }), "example");
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    run(e.dataTransfer.files[0]);
  };

  return (
    <div className="app">
      <header className="header">
        <h1 className="title">NVIDIA NemotronLabs RE-USE</h1>
        <div className="features">
          <span>WebGPU demo</span>
        </div>
        <a className="model-card" href="https://huggingface.co/nvidia/NVIDIA-NemotronLabs-RE-USE">
          <span aria-hidden="true">🤗</span> Model card
        </a>
        <blockquote className="quote" cite="https://huggingface.co/nvidia/NVIDIA-NemotronLabs-RE-USE">NVIDIA NemotronLabs RE-USE is a 9.6-million-parameter multilingual universal speech enhancement (USE) model designed to restore speech quality across a wide range of real-world degradations while preserving speech fidelity.</blockquote>
      </header>

      <main className="main">
        {!hasGpu ? (
          <div className="notice">
            Your browser does not support WebGPU. Try a recent Chrome, Edge or Safari.
          </div>
        ) : state.phase === "working" ? (
          <div className="panel">
            <p className="stage">
              {STAGES[state.stage]}…
              {state.speed != null && <span className="speed">{state.speed.toFixed(2)} s per audio second</span>}
            </p>
            <div className="bar"><div className="bar-fill" style={{ width: `${Math.round(state.p * 100)}%` }} /></div>
          </div>
        ) : state.phase === "done" ? (
          <div className="panel">
            <button className="close" onClick={() => setState({ phase: "idle" })} aria-label="Close and start another file">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
            <p className="result-meta">
              <span className="check" aria-hidden="true">✓</span>
              Cleaned {state.duration.toFixed(1)} seconds of audio in {state.seconds.toFixed(1)} seconds
            </p>
            <div className="players">
              <label>Original<audio controls src={state.original} /></label>
              <label>Cleaned<audio controls src={state.clean} /></label>
            </div>
          </div>
        ) : (
          <>
            <div
              className={`dropzone${dragging ? " dragging" : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => input.current.click()}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              <div className="prompt">
                <svg className="icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M4 20h16" />
                </svg>
                <p><strong>Drop an audio or video file</strong></p>
                <p className="hint">or click to choose · WAV, MP3, M4A, MP4…</p>
              </div>
              <input ref={input} type="file" accept="audio/*,video/*" hidden onChange={(e) => run(e.target.files[0])} />
            </div>
            <section className="examples">
              <h2>Try an example</h2>
              <ul>
                {EXAMPLES.map((ex) => (
                  <li key={ex.file}><span className="ex-icon" aria-hidden="true">{ex.icon}</span><button onClick={() => { track("Example", { example: ex.file }); loadExample(ex); }}>{ex.label}</button></li>
                ))}
              </ul>
            </section>
            {state.phase === "error" && <p className="error">{state.message}</p>}
          </>
        )}
      </main>

      <footer className="footer">
        <pre className="license">{MODEL_LICENSE}</pre>
        Not affiliated with NVIDIA. Model by NVIDIA under the OpenMDW-1.1 license, weights loaded from Hugging Face.
      </footer>
    </div>
  );
}
