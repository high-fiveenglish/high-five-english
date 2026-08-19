// Generates short placeholder tone WAV files used as stand-ins for real
// instructor voice-intro recordings. Replace the files in public/audio
// with actual recordings when available.
import { writeFileSync, mkdirSync } from "node:fs";

function makeToneWav({ freq = 440, seconds = 1.6, sampleRate = 22050 }) {
  const numSamples = Math.floor(seconds * sampleRate);
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const dataSize = numSamples * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * blockAlign, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const envelope = Math.min(1, t * 8) * Math.min(1, (seconds - t) * 8);
    const sample =
      Math.sin(2 * Math.PI * freq * t) * 0.18 * envelope +
      Math.sin(2 * Math.PI * freq * 2 * t) * 0.05 * envelope;
    const val = Math.max(-1, Math.min(1, sample)) * 32767;
    buffer.writeInt16LE(val, 44 + i * 2);
  }
  return buffer;
}

mkdirSync("public/audio", { recursive: true });

const tones = [
  { file: "public/audio/intro-1.wav", freq: 392 },
  { file: "public/audio/intro-2.wav", freq: 440 },
  { file: "public/audio/intro-3.wav", freq: 523 },
  { file: "public/audio/intro-4.wav", freq: 466 },
];

for (const t of tones) {
  writeFileSync(t.file, makeToneWav({ freq: t.freq }));
  console.log("wrote", t.file);
}
