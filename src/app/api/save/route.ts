import { db } from "@/db";
import { gameSaves } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const validId = (id: unknown): id is string =>
  typeof id === "string" && /^[a-zA-Z0-9-]{8,80}$/.test(id);

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!validId(id)) return Response.json({ error: "Invalid save id" }, { status: 400 });
  try {
    const [save] = await db.select().from(gameSaves).where(eq(gameSaves.id, id)).limit(1);
    return Response.json({ state: save?.state ?? null });
  } catch {
    return Response.json({ error: "Save unavailable" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!validId(body.id) || !body.state || typeof body.state !== "object" || Array.isArray(body.state)) {
      return Response.json({ error: "Invalid save" }, { status: 400 });
    }
    if (JSON.stringify(body.state).length > 200_000) {
      return Response.json({ error: "Save too large" }, { status: 413 });
    }
    await db.insert(gameSaves).values({ id: body.id, state: body.state, updatedAt: new Date() })
      .onConflictDoUpdate({ target: gameSaves.id, set: { state: body.state, updatedAt: new Date() } });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Save unavailable" }, { status: 503 });
  }
}
