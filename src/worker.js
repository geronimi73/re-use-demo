// Runs the model off the main thread: downloads + checks the weights, sets up WebGPU, cleans audio.
// Messages in:  { type: "init" } | { type: "enhance", wav: Float32Array, sr }
// Messages out: { type: "progress", stage, p } | { type: "ready" } | { type: "done", wav, ms } | { type: "error", message }

import { ReuseGPU } from "./engine/model.js";
import { enhance } from "./engine/enhance.js";

// Weights at a fixed Hugging Face commit, checked against their SHA-256 before use
const WEIGHTS_URL = "https://huggingface.co/nvidia/NVIDIA-NemotronLabs-RE-USE/resolve/31f82f2efad1095034492f236e8dac9239ba713b/model.safetensors";
const WEIGHTS_SHA256 = "06badaf4029b297f97f7fe48d62990b48d5482608210df577354e0d4e0ed70e1";
const CACHE = "re-use-weights-v1";

let model = null;

const post = (msg, transfer) => self.postMessage(msg, transfer ?? []);

async function sha256(buf) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
  return Array.from(h, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Fetch with download progress
async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`model download failed (${res.status})`);
  const total = Number(res.headers.get("content-length")) || 38592940;
  const reader = res.body.getReader();
  const parts = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    post({ type: "progress", stage: "download", p: Math.min(1, got / total) });
  }
  const buf = new Uint8Array(got);
  let o = 0;
  for (const part of parts) { buf.set(part, o); o += part.length; }
  return buf.buffer;
}

async function loadWeights() {
  let cache = null;
  try { cache = await caches.open(CACHE); } catch { /* no Cache API (e.g. private mode) */ }
  const hit = cache && (await cache.match(WEIGHTS_URL));
  if (hit) {
    const buf = await hit.arrayBuffer();
    if ((await sha256(buf)) === WEIGHTS_SHA256) return buf;
    await cache.delete(WEIGHTS_URL);
  }
  const buf = await download(WEIGHTS_URL);
  if ((await sha256(buf)) !== WEIGHTS_SHA256) throw new Error("model file is corrupted, please reload");
  try { await cache?.put(WEIGHTS_URL, new Response(buf)); } catch { /* quota: just don't cache */ }
  return buf;
}

async function init() {
  if (model) return;
  const weights = await loadWeights();
  post({ type: "progress", stage: "setup", p: 1 });
  model = await ReuseGPU.create(weights);
  model.device.lost.then((info) => { model = null; post({ type: "error", message: `GPU lost: ${info.message || info.reason}` }); });
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === "init") {
      await init();
      post({ type: "ready" });
    } else if (data.type === "enhance") {
      await init();
      const t0 = performance.now();
      post({ type: "progress", stage: "clean", p: 0 });
      const { wav } = await enhance(model, data.wav, data.sr, {
        onProgress: (p) => post({ type: "progress", stage: "clean", p }),
      });
      model.release();   // free the GPU buffers between files
      post({ type: "done", wav, ms: performance.now() - t0 }, [wav.buffer]);
    }
  } catch (e) {
    post({ type: "error", message: e.message || String(e) });
  }
};
