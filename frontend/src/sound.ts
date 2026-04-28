// Lightweight cross-platform sound effects for chess events.
// Uses Web Audio API on web (no asset bundling) and silent fallback on native (expo-audio is async-init).
import { Platform } from 'react-native';

type Kind = 'move' | 'capture' | 'check' | 'end';

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (Platform.OS !== 'web') return null;
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    try {
      const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (Ctor) audioCtx = new Ctor();
    } catch {
      audioCtx = null;
    }
  }
  return audioCtx;
}

function tone(freq: number, durationMs: number, type: OscillatorType = 'sine', gainPeak = 0.18) {
  const ctx = getCtx();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(gainPeak, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000 + 0.02);
  } catch {}
}

export function playSound(kind: Kind) {
  if (Platform.OS !== 'web') return; // native: silent (could be wired to expo-audio assets later)
  switch (kind) {
    case 'move':
      tone(420, 80, 'square', 0.12);
      break;
    case 'capture':
      tone(220, 90, 'sawtooth', 0.18);
      setTimeout(() => tone(160, 110, 'sawtooth', 0.16), 60);
      break;
    case 'check':
      tone(660, 120, 'triangle', 0.2);
      setTimeout(() => tone(880, 140, 'triangle', 0.2), 100);
      break;
    case 'end':
      tone(520, 140, 'sine', 0.18);
      setTimeout(() => tone(390, 160, 'sine', 0.18), 130);
      setTimeout(() => tone(260, 220, 'sine', 0.18), 290);
      break;
  }
}
