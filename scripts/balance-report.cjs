const {load}=require('./load-game.cjs');
const {initialGame,BUILDINGS,upgradeCost,getStats,getOfflineReward}=load('src/lib/game.ts');
const assert=require('node:assert/strict');
const rows=[];
for(const id of Object.keys(BUILDINGS))for(const level of [1,10,25,50,99]){
 const s=initialGame();s.buildings[id]=level;const stats=getStats(s),cost=upgradeCost(id,level);
 assert.ok(Number.isFinite(cost)&&cost>0);assert.ok(upgradeCost(id,level+1)>cost);
 for(const value of Object.values(stats))if(typeof value==='number')assert.ok(Number.isFinite(value),`${id} ${level}`);
 rows.push({building:id,level,nextLevelCost:cost,exportDollarsPerSecond:stats.avgExportRate,grid:stats.grid});
}
const s=initialGame();s.lastSavedAt=100000;
assert.equal(getOfflineReward(s,100000+72*3600000).seconds,43200);
assert.equal(getOfflineReward(s,0).amount,0);
console.log(JSON.stringify({curves:rows,checks:'finite stats, increasing costs, offline cap, clock rollback'},null,2));
