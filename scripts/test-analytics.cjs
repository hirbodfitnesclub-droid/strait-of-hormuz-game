const assert=require('node:assert/strict');const {load}=require('./load-game.cjs');
const {appendEvent,retentionCohorts,DAY_MS:D}=load('src/lib/analytics.ts');
const install=(id,day)=>({version:1,installId:id,installedAt:0,events:[{id:'s-'+id,at:day*D,name:'session'}]});
const logs=[install('a',20),install('b',19),install('c',21),{...install('young',20),installedAt:20*D}];
let r=retentionCohorts([...logs,logs[0]],22*D);
assert.equal(r.immature,1);assert.deepEqual(r.cohorts,[{date:'1970-01-01',installed:3,returned:1,retention:1/3}]);
assert.equal(retentionCohorts(logs,20.5*D).cohorts.length,0,'partial day20 must remain censored');
const a=appendEvent(logs[0],{id:'another',at:20*D+100,name:'session'});assert.equal(a.events.length,1);
assert.throws(()=>retentionCohorts([logs[0],{...logs[0],installedAt:1}],22*D));
console.log('PASS exact D20, deduplicated installations, D19/D21 exclusion, immature cohorts, daily presence dedupe and inconsistent IDs');

let long=install("old",20);for(let d=21;d<=200;d++)long=appendEvent(long,{id:`day-${d}`,name:"session",at:d*D});assert.equal(retentionCohorts([long],201*D).cohorts[0].returned,1,"D20 history survives long play");
