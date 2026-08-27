import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultPreferences, type Preferences } from "../src/lib/regret";

function audioParam() {
  return {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
}

function makeAudioHarness(state: AudioContextState = "running") {
  const oscillators: Array<{
    type: OscillatorType;
    frequency: ReturnType<typeof audioParam>;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    onended: (() => void) | null;
  }> = [];
  const gains: Array<{
    gain: ReturnType<typeof audioParam>;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }> = [];
  const context = {
    state,
    currentTime: 10,
    destination: {},
    resume: vi.fn(async () => {}),
    createOscillator: vi.fn(() => {
      const oscillator = {
        type: "sine" as OscillatorType,
        frequency: audioParam(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null as (() => void) | null,
      };
      oscillators.push(oscillator);
      return oscillator;
    }),
    createGain: vi.fn(() => {
      const gain = { gain: audioParam(), connect: vi.fn(), disconnect: vi.fn() };
      gains.push(gain);
      return gain;
    }),
  };
  const Constructor = vi.fn(function AudioContextMock() { return context; });
  vi.stubGlobal("AudioContext", Constructor);
  return { Constructor, context, oscillators, gains };
}

const quiet: Preferences = { ...defaultPreferences, sound: false, haptics: false };
const audible: Preferences = { ...quiet, sound: true };
const originalVibrate = Object.getOwnPropertyDescriptor(navigator, "vibrate");

function setVibrate(value: unknown) {
  Object.defineProperty(navigator, "vibrate", { value, configurable: true });
}

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("AudioContext", undefined);
  vi.stubGlobal("webkitAudioContext", undefined);
  setVibrate(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (originalVibrate) Object.defineProperty(navigator, "vibrate", originalVibrate);
  else Reflect.deleteProperty(navigator, "vibrate");
});

describe("optional generated audio", () => {
  it("does not create an AudioContext merely by importing the module", async () => {
    const { Constructor } = makeAudioHarness();
    await import("../src/lib/feedback");
    expect(Constructor).not.toHaveBeenCalled();
  });

  it("does not initialize or synthesize audio when sound is off, including milestones", async () => {
    const { Constructor, context } = makeAudioHarness();
    const { playFeedback } = await import("../src/lib/feedback");
    playFeedback("normal", quiet);
    playFeedback("deep", quiet);
    playFeedback("normal", quiet, 100);
    expect(Constructor).not.toHaveBeenCalled();
    expect(context.createOscillator).not.toHaveBeenCalled();
  });

  it("prepares only one reusable context without playing a sound", async () => {
    const { Constructor, context } = makeAudioHarness();
    const { prepareAudio } = await import("../src/lib/feedback");
    prepareAudio();
    prepareAudio();
    expect(Constructor).toHaveBeenCalledTimes(1);
    expect(context.createOscillator).not.toHaveBeenCalled();
  });

  it("creates a short generated tone and disconnects its nodes when it ends", async () => {
    const { Constructor, context, oscillators, gains } = makeAudioHarness();
    const { playFeedback } = await import("../src/lib/feedback");
    playFeedback("normal", audible);
    expect(Constructor).toHaveBeenCalledTimes(1);
    expect(oscillators).toHaveLength(1);
    expect(gains).toHaveLength(1);
    const [oscillator] = oscillators;
    const [gain] = gains;
    expect(oscillator.connect).toHaveBeenCalledWith(gain);
    expect(gain.connect).toHaveBeenCalledWith(context.destination);
    const start = oscillator.start.mock.calls[0][0] as number;
    const stop = oscillator.stop.mock.calls[0][0] as number;
    expect(start).toBeGreaterThanOrEqual(context.currentTime);
    expect(stop - start).toBeGreaterThan(0);
    expect(stop - start).toBeLessThan(0.6);
    expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(0, start);
    const peak = gain.gain.linearRampToValueAtTime.mock.calls[0][0] as number;
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(0.1);

    expect(oscillator.onended).toBeTypeOf("function");
    oscillator.onended?.();
    expect(oscillator.disconnect).toHaveBeenCalledTimes(1);
    expect(gain.disconnect).toHaveBeenCalledTimes(1);
  });

  it("keeps successive presses separate while reusing the same context", async () => {
    const { Constructor, oscillators } = makeAudioHarness();
    const { prepareAudio, playFeedback } = await import("../src/lib/feedback");
    prepareAudio();
    playFeedback("normal", audible);
    playFeedback("deep", audible);
    expect(Constructor).toHaveBeenCalledTimes(1);
    expect(oscillators).toHaveLength(2);
    expect(oscillators[0]).not.toBe(oscillators[1]);
    for (const oscillator of oscillators) {
      expect(oscillator.start).toHaveBeenCalledTimes(1);
      expect(oscillator.stop).toHaveBeenCalledTimes(1);
    }
  });

  it("does not add new tones after the user turns sound off", async () => {
    const { context } = makeAudioHarness();
    const { playFeedback } = await import("../src/lib/feedback");
    playFeedback("normal", audible);
    context.createOscillator.mockClear();
    playFeedback("deep", quiet);
    expect(context.createOscillator).not.toHaveBeenCalled();
  });

  it("makes the milestone cue finite and cleans up every tone", async () => {
    const { oscillators, gains, context } = makeAudioHarness();
    const { playFeedback } = await import("../src/lib/feedback");
    playFeedback("normal", audible, 100);
    expect(oscillators.length).toBeGreaterThan(1);
    expect(oscillators.length).toBeLessThanOrEqual(4);
    expect(gains).toHaveLength(oscillators.length);
    for (const [index, oscillator] of oscillators.entries()) {
      const start = oscillator.start.mock.calls[0][0] as number;
      const stop = oscillator.stop.mock.calls[0][0] as number;
      expect(start).toBeGreaterThanOrEqual(context.currentTime);
      expect(stop).toBeLessThan(context.currentTime + 1);
      oscillator.onended?.();
      expect(oscillator.disconnect).toHaveBeenCalledTimes(1);
      expect(gains[index].disconnect).toHaveBeenCalledTimes(1);
    }
  });

  it("does not synthesize while the browser keeps a context suspended", async () => {
    const { context } = makeAudioHarness("suspended");
    const { playFeedback } = await import("../src/lib/feedback");
    playFeedback("normal", audible);
    expect(context.resume).toHaveBeenCalledTimes(1);
    expect(context.createOscillator).not.toHaveBeenCalled();
  });

  it("absorbs a rejected resume promise instead of breaking interaction", async () => {
    const { context } = makeAudioHarness("suspended");
    context.resume.mockRejectedValue(new Error("Browser blocked audio"));
    const { prepareAudio, playFeedback } = await import("../src/lib/feedback");
    expect(() => prepareAudio()).not.toThrow();
    expect(() => playFeedback("normal", audible)).not.toThrow();
    await Promise.resolve();
    expect(context.createOscillator).not.toHaveBeenCalled();
  });

  it("replaces an audio context that has been closed", async () => {
    const { Constructor, context } = makeAudioHarness();
    const { prepareAudio } = await import("../src/lib/feedback");
    prepareAudio();
    context.state = "closed";
    prepareAudio();
    expect(Constructor).toHaveBeenCalledTimes(2);
  });

  it("supports the prefixed AudioContext fallback", async () => {
    const { Constructor } = makeAudioHarness();
    vi.stubGlobal("webkitAudioContext", Constructor);
    vi.stubGlobal("AudioContext", undefined);
    const { playFeedback } = await import("../src/lib/feedback");
    expect(() => playFeedback("normal", audible)).not.toThrow();
    expect(Constructor).toHaveBeenCalledTimes(1);
  });

  it("works without either AudioContext or Vibration API", async () => {
    const { prepareAudio, playFeedback } = await import("../src/lib/feedback");
    expect(() => prepareAudio()).not.toThrow();
    expect(() => playFeedback("deep", { ...audible, haptics: true }, 100)).not.toThrow();
  });

  it("absorbs an AudioContext constructor failure", async () => {
    vi.stubGlobal("AudioContext", vi.fn(function () { throw new Error("Audio disabled"); }));
    const { playFeedback } = await import("../src/lib/feedback");
    expect(() => playFeedback("normal", audible)).not.toThrow();
  });

  it("absorbs a synthesis failure", async () => {
    const { context } = makeAudioHarness();
    context.createOscillator.mockImplementation(() => { throw new Error("No audio resources"); });
    const { playFeedback } = await import("../src/lib/feedback");
    expect(() => playFeedback("normal", audible)).not.toThrow();
  });
});

describe("optional haptics", () => {
  it("never vibrates when the user has disabled haptics", async () => {
    const vibrate = vi.fn();
    setVibrate(vibrate);
    const { playFeedback } = await import("../src/lib/feedback");
    playFeedback("normal", quiet);
    playFeedback("deep", quiet);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("uses short, distinct patterns for normal and deep presses", async () => {
    const vibrate = vi.fn();
    setVibrate(vibrate);
    const { playFeedback } = await import("../src/lib/feedback");
    playFeedback("normal", { ...quiet, haptics: true });
    playFeedback("deep", { ...quiet, haptics: true });
    expect(vibrate).toHaveBeenCalledTimes(2);
    const normal = vibrate.mock.calls[0][0] as number;
    const deep = vibrate.mock.calls[1][0] as number[];
    expect(normal).toBeGreaterThan(0);
    expect(normal).toBeLessThanOrEqual(50);
    expect(Array.isArray(deep)).toBe(true);
    expect(deep.reduce((total, value) => total + value, 0)).toBeLessThanOrEqual(200);
  });

  it("still plays optional audio when vibration throws", async () => {
    const { context } = makeAudioHarness();
    setVibrate(vi.fn(() => { throw new Error("Vibration blocked"); }));
    const { playFeedback } = await import("../src/lib/feedback");
    expect(() => playFeedback("normal", { ...audible, haptics: true })).not.toThrow();
    expect(context.createOscillator).toHaveBeenCalledTimes(1);
  });
});
