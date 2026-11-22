import { useCallback, useEffect, useRef, useState } from 'react';

export type GameSound =
  | 'deal'
  | 'chip'
  | 'fold'
  | 'raise'
  | 'allin'
  | 'turn'
  | 'win'
  | 'lose';

const STORAGE_KEY = 'poker_sound_enabled';

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: AudioContextCtor })
      .webkitAudioContext ||
    null
  );
}

function tone(
  ctx: AudioContext,
  frequency: number,
  duration: number,
  gainValue: number,
  type: OscillatorType = 'sine',
  delay = 0,
  endFrequency?: number,
) {
  const start = ctx.currentTime + delay;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (endFrequency !== undefined) {
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
  }
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function noiseBurst(
  ctx: AudioContext,
  duration: number,
  gainValue: number,
  delay = 0,
  filterFrequency = 1800,
) {
  const start = ctx.currentTime + delay;
  const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  source.buffer = buffer;
  filter.type = 'lowpass';
  filter.frequency.value = filterFrequency;
  gain.gain.setValueAtTime(gainValue, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(start);
}

export function useGameSounds() {
  const [enabled, setEnabled] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem(STORAGE_KEY) !== 'off';
  });
  const ctxRef = useRef<AudioContext | null>(null);

  const ensureContext = useCallback(() => {
    if (!ctxRef.current) {
      const Ctor = getAudioContextCtor();
      if (!Ctor) return null;
      ctxRef.current = new Ctor();
    }
    if (ctxRef.current.state === 'suspended') {
      void ctxRef.current.resume();
    }
    return ctxRef.current;
  }, []);

  useEffect(() => {
    const unlock = () => {
      ensureContext();
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [ensureContext]);

  const play = useCallback(
    (sound: GameSound) => {
      if (!enabled) return;
      const ctx = ensureContext();
      if (!ctx) return;

      switch (sound) {
        case 'deal':
          noiseBurst(ctx, 0.06, 0.06, 0, 2400);
          noiseBurst(ctx, 0.05, 0.05, 0.07, 2600);
          noiseBurst(ctx, 0.05, 0.05, 0.14, 2800);
          break;
        case 'chip':
          noiseBurst(ctx, 0.035, 0.045, 0, 4200);
          tone(ctx, 1200, 0.06, 0.06, 'triangle', 0.01);
          tone(ctx, 900, 0.07, 0.05, 'triangle', 0.09);
          break;
        case 'fold':
          tone(ctx, 380, 0.18, 0.06, 'sine', 0, 190);
          noiseBurst(ctx, 0.04, 0.03, 0.12, 1400);
          break;
        case 'raise':
          tone(ctx, 520, 0.1, 0.07, 'triangle');
          tone(ctx, 760, 0.12, 0.08, 'triangle', 0.1);
          noiseBurst(ctx, 0.04, 0.035, 0.02, 3200);
          break;
        case 'allin':
          tone(ctx, 160, 0.18, 0.09, 'sine', 0, 110);
          tone(ctx, 620, 0.16, 0.08, 'triangle', 0.06);
          tone(ctx, 930, 0.2, 0.09, 'triangle', 0.2);
          noiseBurst(ctx, 0.08, 0.05, 0.02, 2200);
          break;
        case 'turn':
          tone(ctx, 880, 0.1, 0.055, 'sine');
          tone(ctx, 1320, 0.16, 0.035, 'sine', 0.16);
          break;
        case 'win':
          [523, 659, 784, 1047].forEach((frequency, index) => {
            tone(ctx, frequency, 0.18, 0.07, 'triangle', index * 0.09);
          });
          break;
        case 'lose':
          tone(ctx, 420, 0.2, 0.055, 'sine', 0, 330);
          tone(ctx, 280, 0.26, 0.05, 'sine', 0.2, 190);
          break;
      }
    },
    [enabled, ensureContext],
  );

  const toggle = useCallback(() => {
    setEnabled(prev => {
      const next = !prev;
      window.localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off');
      if (next) {
        ensureContext();
        play('turn');
      }
      return next;
    });
  }, [ensureContext, play]);

  return { enabled, toggle, play };
}
