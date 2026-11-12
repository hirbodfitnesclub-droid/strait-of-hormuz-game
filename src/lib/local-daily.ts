import { dailyReward, type DailyStatus } from './daily';

export type DailyReceipt = { day: number; step: number; id: string };
const DAY = 86_400_000;
/** Device-local rewards are available offline. A rolled-back clock cannot
 * mint another receipt. No local-only game can prevent deliberate save edits. */
export function localDailyStatus(receipt: DailyReceipt | null, now: number): DailyStatus {
  const day = Math.floor(now / DAY);
  const claimed = !!receipt && receipt.day >= day;
  const step = claimed ? receipt!.step : receipt && day === receipt.day + 1 ? receipt.step % 7 + 1 : 1;
  return { available: !claimed, step, serverDay: String(day), reward: claimed ? dailyReward(receipt!.id, step) : null };
}
export function readDailyReceipt(raw: string | null): DailyReceipt | null {
  try {
    const v = JSON.parse(raw ?? 'null');
    return v && Number.isSafeInteger(v.day) && v.day >= 0 && Number.isInteger(v.step) && v.step >= 1 && v.step <= 7 && typeof v.id === 'string' ? v : null;
  } catch { return null; }
}
