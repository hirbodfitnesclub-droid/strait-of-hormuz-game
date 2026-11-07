import type { Reward } from "./progression";

export const DAILY_REWARDS = [
  { cash: 500, xp: 35, chests: 0, boosts: 1 },
  { cash: 800, xp: 50, chests: 1, boosts: 0 },
  { cash: 1200, xp: 65, chests: 0, boosts: 2 },
  { cash: 1500, xp: 80, chests: 1, boosts: 0 },
  { cash: 2000, xp: 100, chests: 0, boosts: 2 },
  { cash: 2500, xp: 120, chests: 1, boosts: 1 },
  { cash: 4000, xp: 180, chests: 2, boosts: 2 },
];
export function dailyReward(id: string, step: number): Reward {
  return { id, type: "daily", title: "هدیهٔ امروز شما", subtitle: `روز ${new Intl.NumberFormat("fa-IR").format(step)} از ۷ · پیشرفت، هر روز`, ...DAILY_REWARDS[step - 1] };
}
export type DailyStatus = { available: boolean; step: number; serverDay: string; reward: Reward | null };
