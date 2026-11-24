let ctx: AudioContext | undefined;
export function chime(
  enabled: boolean,
  kind: "tap" | "collect" | "win" | "signal" | "launch" | "loss" = "tap",
) {
  if (!enabled || typeof AudioContext === "undefined") return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    const notes = {
      tap: [360],
      collect: [587, 784, 988],
      win: [392, 494, 587, 784],
      signal: [660, 990],
      launch: [294, 440],
      loss: [330, 247],
    }[kind];
    notes.forEach((f, i) => {
      const oscillator = ctx!.createOscillator(),
        gain = ctx!.createGain(),
        at = ctx!.currentTime + i * 0.08;
      oscillator.type = kind === "launch" ? "triangle" : "sine";
      oscillator.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.075, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
      oscillator.connect(gain);
      gain.connect(ctx!.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.24);
      oscillator.onended = () => {
        gain.disconnect();
        oscillator.disconnect();
      };
    });
  } catch {
    /* Audio is optional when the OS or browser has reserved the output device. */
  }
}
