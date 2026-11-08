import { db } from "@/db";
import { gameSaves } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const validId = (id: unknown): id is string =>
  typeof id === "string" && /^[a-zA-Z0-9-]{8,80}$/.test(id);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

// Record versioning lives in a small envelope inside the jsonb payload, so
// existing rows need no migration: a legacy row stores the raw game state
// and reads as version 0; new writes store
// { __hormuzSave: { version, updatedAt }, state } and the envelope is
// unwrapped here — clients only ever see the raw game state.
interface SaveEnvelope {
  __hormuzSave: { version: number; updatedAt: string };
  state: Record<string, unknown>;
}

function readRecord(stored: unknown): { state: unknown; version: number } {
  if (isRecord(stored) && isRecord(stored.__hormuzSave) && "state" in stored) {
    const version = stored.__hormuzSave.version;
    return {
      state: stored.state,
      version: typeof version === "number" && Number.isFinite(version) ? Math.floor(version) : 0,
    };
  }
  return { state: stored ?? null, version: 0 };
}

const rowUpdatedAt = (value: unknown) => (value ? new Date(value as string).toISOString() : null);

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!validId(id)) return Response.json({ error: "Invalid save id" }, { status: 400 });
  try {
    const [save] = await db.select().from(gameSaves).where(eq(gameSaves.id, id)).limit(1);
    if (!save) return Response.json({ state: null, version: 0, updatedAt: null });
    const record = readRecord(save.state);
    return Response.json({ state: record.state, version: record.version, updatedAt: rowUpdatedAt(save.updatedAt) });
  } catch {
    return Response.json({ error: "Save unavailable" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!isRecord(body) || !validId(body.id) || !body.state || typeof body.state !== "object" || Array.isArray(body.state)) {
      return Response.json({ error: "Invalid save" }, { status: 400 });
    }
    if (JSON.stringify(body.state).length > 200_000) {
      return Response.json({ error: "Save too large" }, { status: 413 });
    }
    // baseVersion is optional (legacy clients omit it), but when present it
    // must be a non-negative integer. An invalid value (string, float,
    // negative, ...) is a client error — 400 — and must never silently
    // degrade into a legacy unconditional write, which would bypass
    // conflict detection entirely.
    if (
      body.baseVersion !== undefined &&
      !(typeof body.baseVersion === "number" && Number.isInteger(body.baseVersion) && body.baseVersion >= 0)
    ) {
      return Response.json({ error: "Invalid baseVersion" }, { status: 400 });
    }
    const baseVersion = body.baseVersion === undefined ? null : (body.baseVersion as number);
    const saveId = body.id as string; // validated by validId above
    const result = await db.transaction(async transaction => {
      // Serialize writes per save id so the version check cannot race.
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${saveId}))`);
      const [existing] = await transaction.select().from(gameSaves).where(eq(gameSaves.id, saveId)).limit(1);
      const current = existing ? readRecord(existing.state) : { state: null, version: 0 };
      // Conflict policy: LAST-WRITER-WINS, guarded (official policy — see
      // fix-program.md, team SAVE). The version counter is owned by the
      // server: every successful write stores current + 1, so a client can
      // never jump the version. A client whose baseVersion is behind the
      // server has lost the race and gets a 409; per the client-side half
      // of this policy it then fetches the current server state, keeps a
      // timestamped local backup of it (localStorage key
      // "hormuz-server-backup-v1") and only then rebases onto the server
      // version and overwrites — last writer wins, but the overwritten
      // progress is never lost silently. Legacy clients that send no
      // baseVersion keep the old unconditional-write behaviour.
      if (baseVersion !== null && baseVersion < current.version) {
        return {
          conflict: true as const,
          serverVersion: current.version,
          baseVersion,
          updatedAt: existing ? rowUpdatedAt(existing.updatedAt) : null,
        };
      }
      const version = current.version + 1;
      const now = new Date();
      const envelope: SaveEnvelope = {
        __hormuzSave: { version, updatedAt: now.toISOString() },
        state: body.state as Record<string, unknown>,
      };
      await transaction
        .insert(gameSaves)
        .values({ id: saveId, state: envelope, updatedAt: now })
        .onConflictDoUpdate({ target: gameSaves.id, set: { state: envelope, updatedAt: now } });
      return { conflict: false as const, version, updatedAt: now.toISOString() };
    });
    if (result.conflict) {
      return Response.json(
        { error: "version_conflict", serverVersion: result.serverVersion, baseVersion: result.baseVersion, updatedAt: result.updatedAt },
        { status: 409 },
      );
    }
    return Response.json({ ok: true, version: result.version, updatedAt: result.updatedAt });
  } catch {
    return Response.json({ error: "Save unavailable" }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!validId(id)) return Response.json({ error: "Invalid save id" }, { status: 400 });
  try {
    await db.delete(gameSaves).where(eq(gameSaves.id, id));
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Save unavailable" }, { status: 503 });
  }
}
