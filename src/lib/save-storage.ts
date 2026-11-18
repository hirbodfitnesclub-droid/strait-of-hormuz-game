/** LocalStorage writes are atomic per key. Keep the last parseable snapshot
 * before replacing it, so a damaged primary can be recovered on next launch.
 * Never remove a good snapshot when storage is full or unavailable. */
export const SAVE_KEY = "hormuz-game-v1";
export const SAVE_BACKUP_KEY = "hormuz-game-backup-v1";
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export function parseSnapshot(raw: string | null): unknown | null {
  try {
    const value = JSON.parse(raw ?? "null");
    return value && value.version === 1 && value.buildings && value.cards && Array.isArray(value.towers) ? value : null;
  } catch { return null; }
}
export function saveCandidates(storage: StorageLike): { state: unknown; recovered: boolean }[] {
  return [SAVE_KEY, SAVE_BACKUP_KEY].flatMap((key, index) => {
    const state = parseSnapshot(storage.getItem(key));
    return state ? [{ state, recovered: index === 1 }] : [];
  });
}
export function writeSnapshot(storage: StorageLike, state: unknown): void {
  const next = JSON.stringify(state);
  if (!parseSnapshot(next)) throw new Error("Invalid game snapshot");
  const previous = storage.getItem(SAVE_KEY);
  // A backup quota failure must not prevent replacing the primary atomically.
  if (previous && parseSnapshot(previous)) {
    try { storage.setItem(SAVE_BACKUP_KEY, previous); } catch { /* retain primary */ }
  }
  storage.setItem(SAVE_KEY, next);
}
