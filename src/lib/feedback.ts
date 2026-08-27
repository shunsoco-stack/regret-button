import type { Preferences, PressKind } from "./regret";

let audioContext: AudioContext | null = null;

/** Only call from an intentional interaction, never on mount or page load. */
export function prepareAudio(): void {
  try {
    const AudioConstructor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioConstructor) return;
    if (!audioContext || audioContext.state === "closed") audioContext = new AudioConstructor();
    if (audioContext.state === "suspended") void audioContext.resume().catch(() => {});
  } catch {
    // Sound is optional. Unsupported or blocked audio must not block the button.
  }
}

function tone(frequency: number, duration: number, delay = 0): void {
  if (!audioContext || audioContext.state !== "running") return;
  const start = audioContext.currentTime + delay;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.58, start + duration);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(0.075, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.015);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
}

export function playFeedback(kind: PressKind, preferences: Preferences, milestone: number | null = null): void {
  if (preferences.haptics && typeof navigator.vibrate === "function") {
    try { navigator.vibrate(kind === "deep" ? [18, 30, 24] : 12); } catch { /* optional */ }
  }
  if (!preferences.sound) return;
  prepareAudio();
  try {
    if (milestone) {
      [196, 246.94, 293.66].forEach((frequency, index) => tone(frequency, 0.24, index * 0.12));
    } else {
      tone(kind === "deep" ? 94 : 172, kind === "deep" ? 0.32 : 0.11);
    }
  } catch { /* optional */ }
}
