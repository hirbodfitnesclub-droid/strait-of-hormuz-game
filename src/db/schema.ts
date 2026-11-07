import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { Reward } from "@/lib/progression";

export const dailyRewards = pgTable("daily_rewards", {
  id: text("id").primaryKey(),
  playerId: text("player_id").notNull(),
  day: text("day").notNull(),
  step: integer("step").notNull(),
  reward: jsonb("reward").$type<Reward>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const gameSaves = pgTable("game_saves", {
  id: text("id").primaryKey(),
  state: jsonb("state").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
