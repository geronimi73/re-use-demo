// Decoding and encoding on the main thread (AudioContext is not available in workers).

// Every file is decoded (and resampled) to this rate; the model handles any rate, cost grows with it
export const SAMPLE_RATE = 44100;

// Any audio or video file the browser can decode -> mono Float32Array at SAMPLE_RATE
export async function decodeToMono(file) {
  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  try {
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    const out = new Float32Array(buf.length);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < ch.length; i++) out[i] += ch[i] / buf.numberOfChannels;
    }
    return { wav: out, sr: buf.sampleRate, duration: buf.duration };
  } catch {
    throw new Error("Could not read this file. Try a WAV, MP3, M4A, OGG or MP4.");
  } finally {
    ctx.close();
  }
}

// Float32Array -> 16-bit mono WAV Blob
export function wavBlob(wav, sr) {
  const buf = new ArrayBuffer(44 + wav.length * 2);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + wav.length * 2, true); str(8, "WAVEfmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, wav.length * 2, true);
  for (let i = 0; i < wav.length; i++) v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, wav[i])) * 32767), true);
  return new Blob([buf], { type: "audio/wav" });
}
