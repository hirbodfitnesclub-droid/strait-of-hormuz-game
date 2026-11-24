/** One atomic write per slot. The 0.7.4 slots remain available to the old binary. */
export const SAVE_KEY = "hormuz-game-v2";
export const SAVE_BACKUP_KEY = "hormuz-game-backup-v2";
export const LEGACY_SAVE_KEY = "hormuz-game-v1";
export const LEGACY_BACKUP_KEY = "hormuz-game-backup-v1";
const MIGRATED = "hormuz-v1-migration-complete";
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem"> & Partial<Pick<Storage, "key" | "length">>;

type SlotReader = Pick<StorageLike, "getItem" | "key" | "length">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function readJson(raw: string | null): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    return isRecord(value) ? value : null;
  } catch { return null; }
}
function validState(value: unknown): boolean {
  return isRecord(value) && value.version === 1 && isRecord(value.buildings) && isRecord(value.cards) && Array.isArray(value.towers);
}

export function parseSnapshot(raw: string | null): unknown | null {
  const envelope = readJson(raw);
  const state = envelope?.version === 2 ? envelope.state : envelope;
  return validState(state) ? state : null;
}

export class SaveFormatError extends Error {
  constructor(readonly reason: "newer" | "corrupt") {
    super(reason === "newer" ? "Newer local save" : "Unreadable local saves");
  }
}

function readSlots(storage: SlotReader, keys: string[], version: number) {
  return keys.map(key => {
    const raw = storage.getItem(key);
    const value = readJson(raw);
    if (typeof value?.version === "number" && value.version > version) throw new SaveFormatError("newer");
    const state = version === 2 ? value?.state : value;
    if (isRecord(state) && typeof state.version === "number" && state.version > 1) throw new SaveFormatError("newer");
    return { raw, state: value?.version === version && validState(state) ? state : null };
  });
}

function newerSlots(storage: SlotReader): string[] {
  const keys: string[] = [];
  for (let i = 0; storage.key && i < (storage.length ?? 0); i++) {
    const key = storage.key(i);
    const match = key?.match(/^hormuz-game-(?:backup-)?v(\d+)$/);
    if (key && match && Number(match[1]) > 2) keys.push(key);
  }
  return keys;
}

export function saveCandidates(storage: SlotReader): { state: unknown; recovered: boolean }[] {
  if (newerSlots(storage).length) throw new SaveFormatError("newer");
  const slots = readSlots(storage, [SAVE_KEY, SAVE_BACKUP_KEY], 2);
  if (!storage.getItem(MIGRATED)) slots.push(...readSlots(storage, [LEGACY_SAVE_KEY, LEGACY_BACKUP_KEY], 1));
  const valid = slots.flatMap(({state}, index) => state ? [{state, recovered: index % 2 === 1}] : []);
  if (!valid.length && slots.some(slot => slot.raw !== null)) throw new SaveFormatError("corrupt");
  return valid;
}

export function writeSnapshot(storage: StorageLike, state: unknown): void {
  if (!validState(state)) throw new Error("Invalid game snapshot");
  if (newerSlots(storage).length) throw new SaveFormatError("newer");
  const [current] = readSlots(storage, [SAVE_KEY, SAVE_BACKUP_KEY], 2);
  if (current.state && current.raw) {
    try { storage.setItem(SAVE_BACKUP_KEY, current.raw); } catch { /* primary replacement is atomic */ }
  }
  const next = JSON.stringify({version: 2, state});
  storage.setItem(SAVE_KEY, next);
  if (!storage.getItem(MIGRATED)) {
    if (!parseSnapshot(storage.getItem(SAVE_KEY))) throw new Error("Saved game did not round-trip");
    storage.setItem(MIGRATED, "1");
  }
}

/** A reset cannot bring a sealed v1 migration back, even if the process exits before autosave. */
export function resetSaveSlots(storage: StorageLike): void {
  storage.setItem(MIGRATED, "1");
  storage.removeItem(SAVE_KEY);
  storage.removeItem(SAVE_BACKUP_KEY);
}

export function localSaveArchive(storage: StorageLike) {
  return Object.fromEntries([SAVE_KEY, SAVE_BACKUP_KEY, LEGACY_SAVE_KEY, LEGACY_BACKUP_KEY, ...newerSlots(storage)]
    .map(key => [key, storage.getItem(key)]).filter(([, raw]) => raw !== null));
}
