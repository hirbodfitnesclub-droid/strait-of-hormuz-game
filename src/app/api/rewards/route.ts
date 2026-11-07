import { db } from "@/db";
import { dailyRewards } from "@/db/schema";
import { dailyReward } from "@/lib/daily";
import { count, eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";
const validId = (id: unknown): id is string => typeof id === "string" && /^[a-zA-Z0-9-]{8,80}$/.test(id);
// The daily boundary follows the player's day (Asia/Tehran), not UTC — a UTC
// day would reset the reward at 03:30 local time. Built from formatToParts
// so the YYYY-MM-DD shape does not depend on a locale's default ordering.
const tehranDayFormat = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" });
const serverDay = () => {
  const parts = tehranDayFormat.formatToParts(new Date());
  const part = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!validId(id)) return Response.json({ error: "Invalid player" }, { status: 400 });
  try {
    const day = serverDay();
    const [existing] = await db.select().from(dailyRewards).where(eq(dailyRewards.id, `${id}:${day}`)).limit(1);
    const [total] = await db.select({ value: count() }).from(dailyRewards).where(eq(dailyRewards.playerId, id));
    return Response.json({ available: !existing, step: existing?.step ?? total.value % 7 + 1, serverDay: day, reward: existing?.reward ?? null });
  } catch { return Response.json({ error: "Rewards unavailable" }, { status: 503 }); }
}

export async function POST(request: Request) {
  try {
    const { id } = await request.json();
    if (!validId(id)) return Response.json({ error: "Invalid player" }, { status: 400 });
    const day = serverDay();
    const result = await db.transaction(async transaction => {
      // Serialize claims for one player; repeated requests replay the same receipt.
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${id}))`);
      const key = `${id}:${day}`;
      const [existing] = await transaction.select().from(dailyRewards).where(eq(dailyRewards.id, key)).limit(1);
      if (existing) return { available: false, step: existing.step, serverDay: day, reward: existing.reward };
      const [total] = await transaction.select({ value: count() }).from(dailyRewards).where(eq(dailyRewards.playerId, id));
      const step = total.value % 7 + 1, reward = dailyReward(`daily-${key}`, step);
      await transaction.insert(dailyRewards).values({ id: key, playerId: id, day, step, reward });
      return { available: false, step, serverDay: day, reward };
    });
    return Response.json(result);
  } catch { return Response.json({ error: "Rewards unavailable" }, { status: 503 }); }
}
