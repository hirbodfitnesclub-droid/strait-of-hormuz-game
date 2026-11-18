export type BattleSound =
  | "click" | "launch" | "impact" | "explosion" | "emp" | "overdrive" | "wave" | "upgrade"
  | "collect" | "build" | "crit" | "victory" | "defeat" | "boss" | "alarm" | "combo" | "coin";

/** Small, locally synthesized effects. No autoplay, downloads, or external audio service. */
export class BattleAudio {
  private context: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  private lastPlayed = new Map<string, number>();
  enabled = false;

  unlock() {
    if (!this.enabled || typeof window === "undefined") return;
    try {
      if (!this.context) {
        this.context = new AudioContext();
        const length = Math.floor(this.context.sampleRate * 0.7);
        this.noise = this.context.createBuffer(1, length, this.context.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      }
      this.resume();
    } catch { /* Visual feedback remains available when audio is unsupported. */ }
  }

  play(kind: BattleSound) {
    if (!this.enabled || !this.context || this.context.state !== "running") return;
    const ctx = this.context, now = ctx.currentTime;
    const minInterval =
      kind === "impact" ? 0.15 : kind === "launch" ? 0.2 : kind === "coin" ? 0.06 :
      kind === "crit" ? 0.12 : kind === "combo" ? 0.25 : 0.09;
    if (now - (this.lastPlayed.get(kind) ?? -10) < minInterval) return;
    this.lastPlayed.set(kind, now);
    const tone = (from: number, to: number, duration: number, volume: number, wave: OscillatorType = "sine", delay = 0) => {
      const oscillator = ctx.createOscillator(), gain = ctx.createGain();
      oscillator.type = wave;
      oscillator.frequency.setValueAtTime(from, now + delay);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(12, to), now + delay + duration);
      gain.gain.setValueAtTime(volume, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + duration);
      oscillator.connect(gain); gain.connect(ctx.destination);
      oscillator.start(now + delay); oscillator.stop(now + delay + duration + 0.02);
    };
    const noise = (duration: number, frequency: number, volume: number, type: BiquadFilterType = "lowpass") => {
      if (!this.noise) return;
      const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
      source.buffer = this.noise; filter.type = type; filter.frequency.value = frequency;
      gain.gain.setValueAtTime(volume, now); gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      source.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
      source.start(now); source.stop(now + duration);
    };
    if (kind === "click") tone(650, 440, 0.065, 0.025);
    if (kind === "coin") { tone(950, 950, 0.07, 0.035, "square"); tone(1420, 1420, 0.12, 0.03, "square", 0.06); }
    if (kind === "collect") { tone(520, 780, 0.1, 0.04); tone(780, 1170, 0.14, 0.04, "sine", 0.08); noise(0.12, 4000, 0.02, "highpass"); }
    if (kind === "build") { noise(0.22, 900, 0.07); tone(140, 220, 0.18, 0.05, "triangle"); tone(330, 440, 0.16, 0.03, "sine", 0.12); }
    if (kind === "launch") { noise(0.19, 2200, 0.035); tone(230, 75, 0.24, 0.04, "triangle"); }
    if (kind === "impact") { noise(0.14, 1800, 0.055); tone(110, 36, 0.18, 0.04); }
    if (kind === "crit") { tone(1200, 2400, 0.12, 0.045, "sawtooth"); noise(0.1, 5000, 0.04, "highpass"); }
    if (kind === "combo") { tone(600, 900, 0.09, 0.04); tone(900, 1350, 0.11, 0.04, "sine", 0.07); }
    if (kind === "explosion") { noise(0.65, 1100, 0.13); tone(90, 23, 0.5, 0.13); }
    if (kind === "emp") { tone(800, 48, 0.65, 0.065, "triangle"); tone(70, 28, 0.6, 0.09); }
    if (kind === "overdrive") { tone(120, 670, 0.55, 0.05, "triangle"); tone(240, 1300, 0.5, 0.025); }
    if (kind === "boss") { tone(65, 45, 0.7, 0.1, "sawtooth"); tone(98, 65, 0.7, 0.08, "square", 0.05); noise(0.5, 400, 0.06); }
    if (kind === "alarm") { tone(740, 740, 0.12, 0.045, "square"); tone(560, 560, 0.12, 0.045, "square", 0.14); }
    if (kind === "victory") {
      tone(523, 523, 0.14, 0.045); tone(659, 659, 0.14, 0.045, "sine", 0.11);
      tone(784, 784, 0.14, 0.045, "sine", 0.22); tone(1046, 1046, 0.32, 0.05, "sine", 0.33);
    }
    if (kind === "defeat") { tone(330, 160, 0.35, 0.06, "sawtooth"); tone(220, 110, 0.5, 0.06, "triangle", 0.2); }
    if (kind === "wave" || kind === "upgrade") {
      tone(440, 440, 0.18, 0.035); tone(660, 660, 0.22, 0.035, "sine", 0.12); tone(880, 880, 0.3, 0.025, "sine", 0.25);
    }
  }

  resume() {
    if (this.enabled && this.context?.state === "suspended") void this.context.resume().catch(() => {});
  }

  suspend() {
    if (this.context?.state === "running") void this.context.suspend().catch(() => {});
  }

  dispose() {
    if (this.context) void this.context.close().catch(() => {});
    this.context = null; this.noise = null;
  }
}
