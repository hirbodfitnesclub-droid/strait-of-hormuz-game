import { gameReducer, hydrateGame, type GameState } from "../lib/game";
import { restoreOpeningOperations } from "../lib/opening-operations";
import {
  parseSnapshot,
  saveCandidates,
  SaveFormatError,
} from "../lib/save-storage";
import {
  act,
  advance,
  clearedThrough,
  newHarbor,
  type Harbor,
  type Intent,
} from "./session";
import { operations, roles } from "./catalog";
import { BACKUP, decode, LIVE, type ClockSample } from "./storage";

export type RegionalBook = Omit<Harbor, "port"> & {
  substep?: number;
  serviceClock?: ClockSample;
};
type BaseAction = Parameters<typeof gameReducer>[1];
export type RestoredAction =
  | BaseAction
  | { type: "regional"; intent: Intent }
  | { type: "service-elapsed"; seconds: number };
export const IMPORTED_PREVIEW = "hormuz-3d-preview-imported";

function unpack(h: Harbor, substep = 0): GameState {
  const { port, ...book } = h;
  return { ...port, regional: { ...book, substep } };
}

export function harborFor(port: GameState): Harbor {
  if (port.regional) return { ...port.regional, port };
  // The original campaign can be loaded mid-battle. Build only the regional
  // ledger from a copy, so opening the logbook never mutates the live scene.
  const seed = newHarbor(structuredClone(port), true);
  return {
    ...seed,
    port: { ...port, opening: port.opening ?? seed.port.opening },
  };
}

function syncOriginalFrontier(harbor: Harbor) {
  const p = harbor.port;
  const frontier = Math.min(25, clearedThrough(harbor));
  p.highestWave = Math.max(p.highestWave, frontier);
  p.idle.modeBest.campaign = Math.max(p.idle.modeBest.campaign, frontier);
  for (let n = 1; n <= frontier; n++) {
    const stars = harbor.stars[n];
    p.idle.stars[String(n)] = Math.max(stars, p.idle.stars[String(n)] ?? 0);
    p.idle.stars["campaign:" + n] = Math.max(
      stars,
      p.idle.stars["campaign:" + n] ?? 0,
    );
  }
  p.wave = Math.min(25, frontier + 1);
  p.phase = frontier >= 25 ? "victory" : "peace";
  if (p.opening) {
    p.openingOperations = restoreOpeningOperations(p.openingOperations);
    for (const n of [1, 2, 3]) {
      if (
        harbor.terminal.includes(n) &&
        !p.openingOperations.firstTerminal.includes(n)
      )
        p.openingOperations.firstTerminal.push(n);
      if (harbor.stars[n] && !p.openingOperations.cleared.includes(n))
        p.openingOperations.cleared.push(n);
    }
  }
}

export function importPreview(raw: string): GameState {
  const { harbor, sample } = decode(raw);
  syncOriginalFrontier(harbor);
  const port = unpack(harbor);
  port.regional!.serviceClock = sample;
  return port;
}

export function priorPreview(
  storage: Pick<Storage, "getItem">,
): GameState | null {
  if (storage.getItem(IMPORTED_PREVIEW)) return null;
  let corrupt = false;
  for (const key of [LIVE, BACKUP]) {
    const raw = storage.getItem(key);
    if (raw === null) continue;
    try {
      return importPreview(raw);
    } catch (error) {
      if (error instanceof SaveFormatError && error.reason === "newer")
        throw error;
      corrupt = true;
    }
  }
  if (corrupt) throw new SaveFormatError("corrupt");
  return null;
}

export function serviceGap(
  previous: ClockSample | undefined,
  current: ClockSample,
) {
  return previous &&
    previous.boot &&
    previous.boot === current.boot &&
    Number.isFinite(previous.ms)
    ? Math.max(0, (current.ms - previous.ms) / 1000)
    : 0;
}

export function snapshotPort(port: GameState, clock: ClockSample): GameState {
  return {
    ...port,
    shots: [],
    popups: [],
    lastSavedAt: clock.wall,
    ...(port.regional
      ? { regional: { ...port.regional, serviceClock: clock } }
      : {}),
  };
}

export function readPortBackup(raw: string, now: ClockSample): GameState {
  const file = JSON.parse(raw);
  if (!file || typeof file !== "object") throw new SaveFormatError("corrupt");
  let port: unknown;
  if ("body" in file || "checksum" in file) port = importPreview(raw);
  else if (file.format === "hormuz-save" && [1, 2].includes(file.version))
    port = file.state;
  else {
    port = parseSnapshot(raw);
    if (!port) {
      const keys = Object.keys(file);
      const reader = {
        length: keys.length,
        key: (i: number) => keys[i] ?? null,
        getItem: (key: string) =>
          typeof file[key] === "string" ? file[key] : null,
      };
      port = saveCandidates(reader)[0]?.state ?? priorPreview(reader);
    }
  }
  if (!port || typeof port !== "object") throw new SaveFormatError("corrupt");
  // Import deliberately transfers the recorded balance, without awarding time on another machine.
  const result = restorePort({ ...port, lastSavedAt: now.wall }, now.wall);
  if (!result) throw new SaveFormatError("corrupt");
  return snapshotPort(result.game, now);
}

export function restorePort(
  raw: unknown,
  at = Date.now(),
  clock?: ClockSample,
) {
  const restored = hydrateGame(raw, at);
  if (!restored?.game.regional) return restored;
  const b = restored.game.regional;
  if (
    !Array.isArray(b.terminal) ||
    !Array.isArray(b.jobs) ||
    !Array.isArray(b.stamps) ||
    !Array.isArray(b.history) ||
    !Array.isArray(b.flags) ||
    !b.stars ||
    !b.archive ||
    !b.settings ||
    !b.roles ||
    !roles.every(
      (r) =>
        Number.isInteger(b.roles[r.id]) &&
        b.roles[r.id] >= 0 &&
        b.roles[r.id] <= 6,
    ) ||
    ![b.run, b.serial, b.wall, b.bonds].every(
      (x) => Number.isFinite(x) && x >= 0,
    ) ||
    (b.voyage &&
      (!Array.isArray(b.voyage.active) ||
        !Number.isFinite(b.voyage.time) ||
        !(b.voyage.mode === "practice" || operations[b.voyage.op - 1])))
  )
    throw new SaveFormatError("corrupt");
  if (clock)
    restored.game.regional = {
      ...b,
      wall: b.wall + serviceGap(b.serviceClock, clock),
      serviceClock: clock,
    };
  return restored;
}

function recordOriginalClear(state: GameState, next: GameState): GameState {
  const report = next.idle.lastBattle;
  if (
    !report?.victory ||
    state.phase !== "battle" ||
    next.phase === "battle" ||
    state.mode !== "campaign"
  )
    return next;
  const h = harborFor(next);
  const n = state.wave;
  const stars = next.idle.stars[String(n)] ?? 1;
  const stamp = "op/" + n;
  const recorded = state.regional
    ? state.regional.stamps.includes(stamp)
    : !!state.idle.stars[String(n)];
  return unpack({
    ...h,
    stars: { ...h.stars, [n]: Math.max(h.stars[n] ?? 0, stars) },
    archive: { ...h.archive, [n]: Math.max(h.archive[n] ?? 0, stars) },
    terminal: h.terminal.includes(n) ? h.terminal : [...h.terminal, n],
    stamps: h.stamps.includes(stamp) ? h.stamps : [...h.stamps, stamp],
    bonds: h.bonds + (recorded ? 0 : (operations[n - 1]?.bonds ?? 0)),
  });
}

export function restoredReducer(
  state: GameState,
  action: RestoredAction,
): GameState {
  if (action.type === "service-elapsed") {
    const b = state.regional;
    return b && Number.isFinite(action.seconds) && action.seconds > 0
      ? { ...state, regional: { ...b, wall: b.wall + action.seconds } }
      : state;
  }
  if (action.type === "regional") {
    if (
      state.phase === "battle" ||
      (state.idle.lastBattle && !state.idle.lastBattle.claimed)
    )
      return state;
    const intent = action.intent;
    if (
      intent.type === "launch" &&
      intent.mode === "campaign" &&
      intent.op <= 25
    )
      return state;
    const h = harborFor(state);
    const next = act(h, intent);
    return next === h ? state : unpack(next, state.regional?.substep);
  }
  if (
    state.regional?.voyage &&
    (action.type === "start" ||
      action.type === "mode" ||
      action.type === "select-operation")
  )
    return state;
  const next = gameReducer(state, action);
  if (action.type !== "advance") return next;
  const earned = recordOriginalClear(state, next);
  const book = earned.regional;
  if (!book) return earned;
  const elapsed = Math.max(0, action.openingElapsed ?? 0);
  const battleTime =
    book.voyage && !action.battlePaused
      ? (book.substep ?? 0) + Math.min(4, action.steps) * 0.125
      : (book.substep ?? 0);
  const steps = Math.floor(battleTime * 4);
  const h = { ...book, port: earned, wall: book.wall + elapsed };
  const advanced = advance(h, 0, steps / 4);
  if (
    book.voyage?.mode === "campaign" &&
    book.voyage.op <= 25 &&
    advanced.result?.win &&
    !advanced.voyage
  ) {
    syncOriginalFrontier(advanced);
  }
  return unpack(advanced, book.voyage ? battleTime - steps / 4 : 0);
}
