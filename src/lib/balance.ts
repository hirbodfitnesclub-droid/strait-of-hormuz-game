/** Shared tuning values. Change deliberately and run test:core + balance report.
 * These defaults preserve the existing campaign while exposing its curves. */
export const BALANCE = {
  combat: { interceptLine: 0.85 },
  economy: { buildingCostGrowth: 1.15, offlineHours: 12, offlineEfficiency: 0.5, offlineGraceSeconds: 30, harborOfflineBonus: 1.2 },
  progression: { rankXp: [0,150,400,800,1400,2200,3400,5000,7500,11000,16000] },
} as const;
