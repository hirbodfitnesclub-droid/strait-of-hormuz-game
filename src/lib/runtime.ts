// Runtime environment detection.
//
// The Android build is a static export served inside Capacitor: the /api
// routes do not exist there, so every server call is guaranteed to fail
// (and still costs a radio wake-up + CPU). `isNativeRuntime` is the single
// detection point for that; it is injectable so it can be unit-tested in
// plain Node with a fake window object.

export interface CapacitorLike {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

export function isNativeRuntime(win?: unknown): boolean {
  const scope = (win ?? (typeof window !== "undefined" ? window : undefined)) as
    | { Capacitor?: CapacitorLike }
    | undefined;
  const cap = scope?.Capacitor;
  if (!cap) return false;
  try {
    if (typeof cap.isNativePlatform === "function") return cap.isNativePlatform() === true;
  } catch { /* fall through to the platform probe */ }
  try {
    if (typeof cap.getPlatform === "function") {
      const platform = cap.getPlatform();
      return platform === "android" || platform === "ios";
    }
  } catch { /* not a Capacitor runtime */ }
  return false;
}

/** Server features (/api/save, /api/rewards) only exist on the web build. */
export function serverApiEnabled(win?: unknown): boolean {
  return process.env.NEXT_PUBLIC_STATIC_GAME !== "1" && !isNativeRuntime(win);
}
