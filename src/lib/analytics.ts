/** Local diagnostics only: no network transport, advertising ID or personal data.
 * Export is initiated by the player from Settings. Installation identity survives
 * an in-game reset; reinstall/clearing app data creates a new installation. */
export const ANALYTICS_KEY = 'hormuz-diagnostics-v1';
export const DAY_MS = 86_400_000;
export type EventName = 'session' | 'battle_start' | 'battle_win' | 'battle_loss' | 'mission' | 'prestige';
export interface GameEvent { id: string; at: number; name: EventName; wave?: number; mode?: string; reason?: string }
export interface InstallationLog { version: 1; installId: string; installedAt: number; events: GameEvent[] }
export function readInstallation(raw: string | null): InstallationLog | null {
  try {
    const v = JSON.parse(raw ?? 'null');
    if (v?.version !== 1 || typeof v.installId !== 'string' || !Number.isFinite(v.installedAt) || v.installedAt < 0 || !Array.isArray(v.events)) return null;
    return { version: 1, installId: v.installId, installedAt: v.installedAt, events: v.events.filter((e: GameEvent) => e && typeof e.id === 'string' && Number.isFinite(e.at) && e.at >= v.installedAt && ['session','battle_start','battle_win','battle_loss','mission','prestige'].includes(e.name)).slice(-5000) };
  } catch { return null; }
}
export function appendEvent(log: InstallationLog, event: GameEvent): InstallationLog {
  if (event.at < log.installedAt || log.events.some(e => e.id === event.id)) return log;
  // One presence record per UTC day is enough for exact-day retention.
  if (event.name === 'session' && log.events.some(e => e.name === 'session' && Math.floor(e.at / DAY_MS) === Math.floor(event.at / DAY_MS))) return log;
  const events = [...log.events, event];
  // Preserve 90 daily presence records independently of high-volume combat.
  const presence = events.filter(e => e.name === 'session');
  const recent = new Set(presence.slice(-90).map(e => e.id));
  // Never discard the install cohort's D0–D20 history on long-lived saves.
  const firstDay = Math.floor(log.installedAt / DAY_MS);
  const sessions = presence.filter(e => Math.floor(e.at / DAY_MS) <= firstDay + 20 || recent.has(e.id));
  const detail = events.filter(e => e.name !== 'session').slice(-4000);
  return { ...log, events: [...sessions, ...detail].sort((a,b) => a.at-b.at) };
}
export function recordGameEvent(name: EventName, detail: Pick<GameEvent, 'wave' | 'mode' | 'reason'> = {}) {
  try {
    const now = Date.now();
    const log = readInstallation(localStorage.getItem(ANALYTICS_KEY)) ?? { version: 1, installId: crypto.randomUUID(), installedAt: now, events: [] };
    const next = appendEvent(log, { id: crypto.randomUUID(), at: now, name, ...detail });
    localStorage.setItem(ANALYTICS_KEY, JSON.stringify(next));
  } catch { /* Diagnostics must never block play or game saves. */ }
}
export async function exportDiagnostics(): Promise<void> {
  const log = readInstallation(localStorage.getItem(ANALYTICS_KEY));
  if (!log) return;
  const { exportJson } = await import('./export-file');
  await exportJson('hormuz-play-diagnostics.json', log);
}
/** Calendar-day retention in UTC; exclude cohorts whose whole target day has
 * not ended. Repeat exports of one installation are merged, never recounted. */
export function retentionCohorts(logs: InstallationLog[], now: number, day = 20) {
  const installs = new Map<string, InstallationLog>();
  for (const log of logs) {
    const old = installs.get(log.installId);
    if (old && old.installedAt !== log.installedAt) throw new Error('Inconsistent installation timestamp');
    installs.set(log.installId, old ? {...old, events:[...old.events,...log.events]} : log);
  }
  const cohorts = new Map<number, {installed: number; returned: number}>();
  let immature = 0;
  for (const log of installs.values()) {
    const cohort = Math.floor(log.installedAt / DAY_MS);
    if ((cohort + day + 1) * DAY_MS > now) { immature++; continue; }
    const row = cohorts.get(cohort) ?? {installed:0,returned:0};row.installed++;
    if (log.events.some(e => e.name === 'session' && e.at <= now && Math.floor(e.at / DAY_MS) === cohort + day)) row.returned++;
    cohorts.set(cohort,row);
  }
  return {day, timezone:'UTC', immature, cohorts:[...cohorts].sort((a,b)=>a[0]-b[0]).map(([date,r])=>({date:new Date(date*DAY_MS).toISOString().slice(0,10),...r,retention:r.returned/r.installed}))};
}
