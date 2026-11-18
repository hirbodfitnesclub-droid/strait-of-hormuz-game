import { getRange, getStats, heroPower, INTERCEPT_LINE, positionAt, SLOTS, towerDps, waveComposition, distance, type GameState } from './game';
import { scenarioForWave } from './news';
import { conditionRangeFactor, objectiveTypeOf, scenarioContextFor } from './scenario-mechanics';
import type { MissionTarget } from './progression';

export type PreparationTip = { id: string; text: string; target: MissionTarget };
/** A preparation aid, never a win prediction. Coverage samples the actual lane
 * and distinguishes damage, detection, power and consumable availability. */
export function operationReadiness(game: GameState, wave = game.wave, mode = game.mode) {
  const scenario = scenarioForWave(wave, mode, scenarioContextFor(game));
  const units = waveComposition(wave, scenario);
  const stats = getStats(game);
  const cutoff = objectiveTypeOf(scenario.objective) === 'intercept' ? INTERCEPT_LINE : 1;
  // Read the base range, then apply the upcoming operation's visibility once.
  // A current storm and scenario fog take the minimum, as in getRange;
  // the short-range challenge also applies before its battle has started.
  const planning = { ...game, phase: 'peace' as const, event: null };
  const rangeFactor = Math.min(game.event === 'storm' ? .8 : 1, conditionRangeFactor(scenario.specialCondition))
    * (mode === 'challenge' && (game.idle.challengeRuns ?? 0) % 3 === 0 ? .5 : 1);
  const covers = (slot: number, range: number) => {
    let count = 0;
    for (let i = 1; i <= 40; i++) if (distance(SLOTS[slot], positionAt(cutoff * i / 40, game.layout)) <= range) count++;
    return count / 40;
  };
  const towers = game.towers.map(tower => ({ tower, coverage: covers(tower.slot, getRange(planning, tower) * rangeFactor) }));
  const tips: PreparationTip[] = [];
  if (!towers.some(t => t.coverage > 0)) tips.push({id:'coverage',text:'کنار مسیر ورود دشمن برجک بساز؛ جایگاه دور از مسیر فرصت شلیک ندارد.',target:{kind:'tower'}});
  if (units.some(u => u.kind === 'air') && !towers.some(t => t.coverage > 0 && t.tower.kind === 'air')) tips.push({id:'air',text:'این عملیات دشمن هوایی دارد؛ پدافند هوایی را کنار آبراه مستقر کن.',target:{kind:'tower'}});
  if (units.some(u => u.kind === 'sub' || (u.kind === 'boss' && u.boss === 2)) && !towers.some(t => t.coverage > 0 && ['ew','boat'].includes(t.tower.kind))) tips.push({id:'sub',text:'زیردریایی‌ها به آشکارسازی نیاز دارند؛ جنگ الکترونیک یا آشیانهٔ قایق نزدیک مسیر بساز.',target:{kind:'tower'}});
  if (stats.grid < .9) tips.push({id:'power',text:'کسری برق سرعت تولید و قدرت شلیک را کم می‌کند؛ نیروگاه را تقویت کن.',target:{kind:'building',id:'power'}});
  if (game.fuel < 60 || !game.buildings.refinery) tips.push({id:'fuel',text:'پالایشگاه و سهم پالایش نفت را بررسی کن تا سوخت نیروگاه تمام نشود.',target:{kind:'building',id:'refinery'}});
  if (game.ammo < 200) tips.push({id:'ammo',text:'ذخیرهٔ مهمات کم است؛ قبل از شروع، زنجیرهٔ سوخت، فولاد و مهمات را آماده کن.',target:{kind:'building',id:'arms'}});
  const coveredPower = towers.reduce((sum, t) => sum + towerDps(game, t.tower) * t.coverage, 0) + heroPower(game);
  return { tips, coveredPower, units, objective: scenario.objective, condition: scenario.specialCondition, cutoff };
}
