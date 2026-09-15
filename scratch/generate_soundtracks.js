import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const sampleRate = 44100;

function createWavBuffer(samples) {
  const numSamples = samples.length;
  const buffer = Buffer.alloc(44 + numSamples * 2);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // SubChunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20);  // AudioFormat (1 for PCM)
  buffer.writeUInt16LE(1, 22);  // NumChannels (1 for Mono)
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
  buffer.writeUInt16LE(2, 32);  // BlockAlign
  buffer.writeUInt16LE(16, 34); // BitsPerSample
  buffer.write('data', 36);
  buffer.writeUInt32LE(numSamples * 2, 40);

  for (let i = 0; i < numSamples; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    const intSample = Math.floor(s * 32767);
    buffer.writeInt16LE(intSample, 44 + i * 2);
  }

  return buffer;
}

// Synth helper functions
const notes = {
  C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, G2: 98.00, A2: 110.00, B2: 123.47,
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00, A3: 220.00, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00, B5: 987.77,
  C6: 1046.50, D6: 1174.66, E6: 1318.51, G6: 1567.98
};

function kick(t) {
  if (t < 0 || t > 0.3) return 0;
  const f = 140 * Math.exp(-t * 22) + 45;
  const env = Math.exp(-t * 12);
  return Math.sin(2 * Math.PI * f * t) * env * 0.9;
}

function snare(t) {
  if (t < 0 || t > 0.25) return 0;
  const tone = Math.sin(2 * Math.PI * 180 * t) * Math.exp(-t * 18);
  const noise = (Math.random() * 2 - 1) * Math.exp(-t * 14);
  return (tone * 0.4 + noise * 0.6) * 0.7;
}

function hihat(t, open = false) {
  const dur = open ? 0.2 : 0.05;
  if (t < 0 || t > dur) return 0;
  const noise = (Math.random() * 2 - 1);
  const env = Math.exp(-t * (open ? 18 : 60));
  return noise * env * 0.35;
}

function synthTone(freq, t, type = 'sawtooth') {
  if (t < 0) return 0;
  const phase = (freq * t) % 1;
  let wave = 0;
  if (type === 'sawtooth') wave = 2 * phase - 1;
  else if (type === 'square') wave = phase < 0.5 ? 1 : -1;
  else if (type === 'triangle') wave = 4 * Math.abs(phase - 0.5) - 1;
  else wave = Math.sin(2 * Math.PI * phase);
  return wave;
}

// 1. Midnight Cyberpunk (116 BPM, ~16.5 sec loop, 8 bars)
function generateCyberpunk() {
  const bpm = 116;
  const secPerBeat = 60 / bpm;
  const totalBeats = 32; // 8 bars
  const totalSec = totalBeats * secPerBeat;
  const totalSamples = Math.floor(sampleRate * totalSec);
  const out = new Float32Array(totalSamples);

  const chordRoots = [notes.A2, notes.F2, notes.C2, notes.G2];
  const arpNotes = [
    [notes.A3, notes.C4, notes.E4, notes.A4],
    [notes.F3, notes.A3, notes.C4, notes.F4],
    [notes.C3, notes.E3, notes.G3, notes.C4],
    [notes.G3, notes.B3, notes.D4, notes.G4]
  ];

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const beat = (t / secPerBeat) % totalBeats;
    const bar = Math.floor(beat / 4);
    const chordIdx = bar % 4;

    let sample = 0;

    // Drums
    const beatInBar = beat % 4;
    // Kicks on beat 0 and 2.5
    const tKick1 = (beatInBar - 0) * secPerBeat;
    const tKick2 = (beatInBar - 2.5) * secPerBeat;
    sample += kick(tKick1);
    if (beatInBar >= 2.5) sample += kick(tKick2);

    // Snares on beat 1 and 3
    const tSnare1 = (beatInBar - 1) * secPerBeat;
    const tSnare2 = (beatInBar - 3) * secPerBeat;
    sample += snare(tSnare1);
    sample += snare(tSnare2);

    // 16th Hi-hats
    const beat16 = beat * 4;
    const tHat = (beat16 % 1) * (secPerBeat / 4);
    sample += hihat(tHat, Math.floor(beat16) % 4 === 2);

    // Synth Bass (rolling 16ths)
    const bassNote = chordRoots[chordIdx];
    const bassPhase = (beat * 2) % 1;
    const bassT = bassPhase * (secPerBeat / 2);
    const bassEnv = Math.exp(-bassT * 6);
    sample += synthTone(bassNote, t, 'sawtooth') * bassEnv * 0.45;

    // Arpeggio lead
    const step16 = Math.floor(beat * 4) % 16;
    const curArp = arpNotes[chordIdx];
    const arpFreq = curArp[step16 % curArp.length];
    const arpT = (beat * 4 % 1) * (secPerBeat / 4);
    const arpEnv = Math.exp(-arpT * 8);
    sample += synthTone(arpFreq, t, 'square') * arpEnv * 0.3;

    out[i] = sample * 0.75;
  }
  return out;
}

// 2. Chill Lo-Fi Sunset (78 BPM, ~12.3 sec loop)
function generateLoFi() {
  const bpm = 78;
  const secPerBeat = 60 / bpm;
  const totalBeats = 16;
  const totalSec = totalBeats * secPerBeat;
  const totalSamples = Math.floor(sampleRate * totalSec);
  const out = new Float32Array(totalSamples);

  const chords = [
    [notes.F3, notes.A3, notes.C4, notes.E4], // Fmaj7
    [notes.E3, notes.G3, notes.B3, notes.D4], // Em7
    [notes.D3, notes.F3, notes.A3, notes.C4], // Dm7
    [notes.C3, notes.E3, notes.G3, notes.B3]  // Cmaj7
  ];

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const beat = (t / secPerBeat) % totalBeats;
    const bar = Math.floor(beat / 4);
    const chord = chords[bar % 4];

    let sample = 0;

    // Vinyl crackle
    sample += (Math.random() * 2 - 1) * 0.015;

    // Soft kick on beat 0 and 2.25
    const beatInBar = beat % 4;
    sample += kick((beatInBar - 0) * secPerBeat) * 0.8;
    if (beatInBar >= 2.25) sample += kick((beatInBar - 2.25) * secPerBeat) * 0.6;

    // Rimshot on 1 and 3
    sample += snare((beatInBar - 1) * secPerBeat) * 0.5;
    sample += snare((beatInBar - 3) * secPerBeat) * 0.5;

    // Soft hihat
    sample += hihat(((beat * 2) % 1) * (secPerBeat / 2)) * 0.3;

    // Warm Rhodes electric piano chords
    const chordT = (beat % 2) * secPerBeat;
    const chordEnv = Math.exp(-chordT * 1.5);
    for (const f of chord) {
      sample += Math.sin(2 * Math.PI * f * t) * chordEnv * 0.12;
      sample += Math.sin(4 * Math.PI * f * t) * chordEnv * 0.04;
    }

    // Gentle sub bass
    const bassF = chord[0] / 2;
    sample += Math.sin(2 * Math.PI * bassF * t) * 0.35;

    out[i] = sample * 0.8;
  }
  return out;
}

// 3. Deep Cosmic Orbit (60 BPM, ambient space pads & chimes)
function generateCosmic() {
  const bpm = 60;
  const secPerBeat = 60 / bpm;
  const totalBeats = 16;
  const totalSec = totalBeats * secPerBeat;
  const totalSamples = Math.floor(sampleRate * totalSec);
  const out = new Float32Array(totalSamples);

  const padFrequencies = [
    [notes.C3, notes.G3, notes.D4, notes.E4],
    [notes.A2, notes.E3, notes.C4, notes.G4],
    [notes.F2, notes.C3, notes.A3, notes.E4],
    [notes.G2, notes.D3, notes.B3, notes.F4]
  ];

  const chimes = [notes.C5, notes.E5, notes.G5, notes.B5, notes.D6, notes.E6];

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const beat = (t / secPerBeat) % totalBeats;
    const bar = Math.floor(beat / 4);
    const pad = padFrequencies[bar % 4];

    let sample = 0;

    // Ethereal swell pad
    const barT = (beat % 4) * secPerBeat;
    const swell = Math.sin((barT / (4 * secPerBeat)) * Math.PI);
    for (const f of pad) {
      sample += synthTone(f, t, 'triangle') * swell * 0.15;
      sample += Math.sin(2 * Math.PI * f * 1.002 * t) * swell * 0.12; // Chorus detune
    }

    // Sub bass resonance
    sample += Math.sin(2 * Math.PI * (pad[0] / 2) * t) * swell * 0.3;

    // Gentle random celestial chimes on 8th beats
    const beat8 = Math.floor(beat * 2);
    if (beat8 % 3 === 0) {
      const chimeT = ((beat * 2) % 1) * (secPerBeat / 2);
      const chimeF = chimes[(beat8 * 2) % chimes.length];
      sample += Math.sin(2 * Math.PI * chimeF * t) * Math.exp(-chimeT * 5) * 0.25;
    }

    out[i] = sample * 0.85;
  }
  return out;
}

// 4. High Voltage (128 BPM energetic EDM/Electro)
function generateHighVoltage() {
  const bpm = 128;
  const secPerBeat = 60 / bpm;
  const totalBeats = 16;
  const totalSec = totalBeats * secPerBeat;
  const totalSamples = Math.floor(sampleRate * totalSec);
  const out = new Float32Array(totalSamples);

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const beat = (t / secPerBeat) % totalBeats;

    let sample = 0;

    // Four on the floor punchy kick
    const tKick = (beat % 1) * secPerBeat;
    sample += kick(tKick) * 1.0;

    // Open Hat on upbeat (&)
    const tHat = ((beat + 0.5) % 1) * secPerBeat;
    sample += hihat(tHat, true) * 0.5;

    // Driving Sawtooth Bassline
    const bassNote = (Math.floor(beat) % 4 === 3) ? notes.F2 : notes.D2;
    const bassT = (beat * 2 % 1) * (secPerBeat / 2);
    const bassEnv = Math.exp(-bassT * 7);
    sample += synthTone(bassNote, t, 'sawtooth') * bassEnv * 0.45;

    // Energetic synth lead
    const leadNotes = [notes.D4, notes.F4, notes.A4, notes.D5, notes.C5, notes.A4];
    const leadF = leadNotes[Math.floor(beat * 2) % leadNotes.length];
    sample += synthTone(leadF, t, 'square') * 0.25;

    out[i] = sample * 0.75;
  }
  return out;
}

// 5. Tokyo Rain (82 BPM calming rain & pentatonic chimes)
function generateTokyoRain() {
  const bpm = 82;
  const secPerBeat = 60 / bpm;
  const totalBeats = 16;
  const totalSec = totalBeats * secPerBeat;
  const totalSamples = Math.floor(sampleRate * totalSec);
  const out = new Float32Array(totalSamples);

  const pentatonic = [notes.E4, notes.G4, notes.A4, notes.B4, notes.D5, notes.E5, notes.G5];

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const beat = (t / secPerBeat) % totalBeats;

    let sample = 0;

    // Rain noise texture
    sample += (Math.random() * 2 - 1) * 0.04;

    // Soft heart beat kick on 0 and 2
    const beatInBar = beat % 4;
    sample += kick((beatInBar - 0) * secPerBeat) * 0.7;
    sample += kick((beatInBar - 2) * secPerBeat) * 0.5;

    // Subtle snap on 1 and 3
    sample += snare((beatInBar - 1) * secPerBeat) * 0.35;
    sample += snare((beatInBar - 3) * secPerBeat) * 0.35;

    // Pentatonic koto/chime melody
    const step = Math.floor(beat * 2);
    const chimeF = pentatonic[(step * 3) % pentatonic.length];
    const chimeT = ((beat * 2) % 1) * (secPerBeat / 2);
    sample += Math.sin(2 * Math.PI * chimeF * t) * Math.exp(-chimeT * 6) * 0.3;

    // Warm bass
    sample += Math.sin(2 * Math.PI * notes.E2 * t) * 0.35;

    out[i] = sample * 0.8;
  }
  return out;
}

// 6. Neon Horizon (105 BPM 80s Retro Synthwave)
function generateNeonHorizon() {
  const bpm = 105;
  const secPerBeat = 60 / bpm;
  const totalBeats = 16;
  const totalSec = totalBeats * secPerBeat;
  const totalSamples = Math.floor(sampleRate * totalSec);
  const out = new Float32Array(totalSamples);

  const bassProg = [notes.A2, notes.C2, notes.F2, notes.G2];

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const beat = (t / secPerBeat) % totalBeats;
    const bar = Math.floor(beat / 4);

    let sample = 0;

    // 80s punch kick
    const beatInBar = beat % 4;
    sample += kick((beatInBar - 0) * secPerBeat) * 0.9;
    sample += kick((beatInBar - 2) * secPerBeat) * 0.7;

    // Big gated snare on 1 and 3
    sample += snare((beatInBar - 1) * secPerBeat) * 0.8;
    sample += snare((beatInBar - 3) * secPerBeat) * 0.8;

    // Hihat on 8ths
    sample += hihat(((beat * 2) % 1) * (secPerBeat / 2)) * 0.4;

    // 80s Synth Brass Chord
    const chordT = (beat % 2) * secPerBeat;
    const brassEnv = Math.exp(-chordT * 2);
    const root = bassProg[bar % 4];
    sample += synthTone(root * 2, t, 'sawtooth') * brassEnv * 0.25;
    sample += synthTone(root * 2.5, t, 'sawtooth') * brassEnv * 0.2;
    sample += synthTone(root * 3, t, 'sawtooth') * brassEnv * 0.2;

    // Synth bass
    sample += synthTone(root, t, 'sawtooth') * 0.35;

    out[i] = sample * 0.75;
  }
  return out;
}

const tracks = [
  { name: 'cyberpunk.wav', data: generateCyberpunk() },
  { name: 'lofi_sunset.wav', data: generateLoFi() },
  { name: 'cosmic_orbit.wav', data: generateCosmic() },
  { name: 'high_voltage.wav', data: generateHighVoltage() },
  { name: 'tokyo_rain.wav', data: generateTokyoRain() },
  { name: 'neon_horizon.wav', data: generateNeonHorizon() }
];

const targetDirs = [
  path.join(rootDir, 'server', 'public', 'music'),
  path.join(rootDir, 'user-client', 'public', 'music'),
  path.join(rootDir, 'client', 'public', 'music')
];

targetDirs.forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

for (const tr of tracks) {
  const wavBuffer = createWavBuffer(tr.data);
  for (const dir of targetDirs) {
    const dest = path.join(dir, tr.name);
    fs.writeFileSync(dest, wavBuffer);
    console.log(`Saved ${tr.name} (${wavBuffer.length} bytes) to ${dest}`);
  }
}

console.log('All 6 high-fidelity soundtracks generated successfully!');
