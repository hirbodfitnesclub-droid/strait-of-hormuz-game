import {gameReducer, hydrateGame} from "../lib/game";
import {saveCandidates, SaveFormatError} from "../lib/save-storage";
import {newHarbor,type Harbor} from "./session";
import {roles} from "./catalog";

export const LIVE="hormuz-lantern-1", BACKUP="hormuz-lantern-backup-1";
export interface ClockSample {boot:string; ms:number; wall:number}
type StorageLike=Pick<Storage,"getItem"|"setItem"|"removeItem">;
const record=(x:unknown):x is Record<string,unknown>=>typeof x==="object"&&x!==null&&!Array.isArray(x);
const number=(x:unknown,min=0):x is number=>typeof x==="number"&&Number.isFinite(x)&&x>=min;
function sum(value:string) {
  let n=2166136261;
  for(let i=0;i<value.length;i++)n=Math.imul(n^value.charCodeAt(i),16777619);
  return (n>>>0).toString(16);
}
export function encode(h:Harbor,sample:ClockSample) {
  const body=JSON.stringify({harbor:h,sample});
  return JSON.stringify({version:1,checksum:sum(body),body});
}
export function decode(raw:string) {
  const packet:unknown=JSON.parse(raw);
  if(record(packet)&&number(packet.version)&&packet.version>1)throw new SaveFormatError("newer");
  if(!record(packet)||packet.version!==1||typeof packet.body!=="string"||sum(packet.body)!==packet.checksum)throw new SaveFormatError("corrupt");
  const data=JSON.parse(packet.body);
  const h=data?.harbor as Harbor,c=data?.sample as ClockSample;
  if(!record(h)||!record(h.port)||!h.port.opening||!record(h.roles)||!record(h.settings)||!record(h.stars)||!record(h.archive)||
    ![h.history,h.stamps,h.jobs,h.terminal,h.flags].every(Array.isArray)||!roles.every(r=>Number.isInteger(h.roles[r.id])&&h.roles[r.id]>=0&&h.roles[r.id]<=6)||
    ![h.run,h.serial,h.wall,h.bonds,h.depth,h.tradeBadges,h.totalBase,h.port.lastSavedAt].every(v=>number(v))||
    !c||typeof c.boot!=="string"||!number(c.ms)||!number(c.wall))throw new SaveFormatError("corrupt");
  if(h.voyage && (!["practice","campaign","weekly","endless"].includes(h.voyage.mode)||!Array.isArray(h.voyage.active)||!number(h.voyage.time)||
    !Number.isInteger(h.voyage.op)||h.voyage.op<(h.voyage.mode==="practice"?0:1)||h.voyage.op>45||!roles.some(r=>r.id===h.voyage!.role)))throw new SaveFormatError("corrupt");
  const restored=hydrateGame(h.port,h.port.lastSavedAt);
  if(!restored?.game.opening)throw new SaveFormatError("corrupt");
  return {harbor:{...h,port:restored.game},sample:c};
}
export function resume(h:Harbor,old:ClockSample,now:ClockSample) {
  const sameBoot=!!now.boot && old.boot===now.boot;
  const elapsed=sameBoot?Math.max(0,(now.ms-old.ms)/1000):0;
  const industry=sameBoot?elapsed:Math.max(0,(now.wall-old.wall)/1000);
  const to=h.port.lastSavedAt+industry*1000;
  return {...h,wall:h.wall+elapsed,port:gameReducer(h.port,{type:"offline-elapsed",seconds:industry,now:to})};
}
export function loadHarbor(storage:StorageLike,now:ClockSample) {
  let broken=false;
  for(const key of [LIVE,BACKUP]) {
    const raw=storage.getItem(key);
    if(!raw)continue;
    try {
      const saved=decode(raw);
      return {harbor:resume(saved.harbor,saved.sample,now),recovered:key===BACKUP,wallHigh:Math.max(now.wall,saved.sample.wall)};
    } catch(e){if(e instanceof SaveFormatError&&e.reason==="newer")throw e;broken=true;}
  }
  if(broken)throw new SaveFormatError("corrupt");
  for(const slot of saveCandidates(storage)) {
    const restored=hydrateGame(slot.state);
    if(!restored)continue;
    let p=restored.game;
    if(p.idle.lastBattle&&!p.idle.lastBattle.claimed)p=gameReducer(p,{type:"claim-battle"});
    if(p.idle.offline)p=gameReducer(p,{type:"claim-offline"});
    return {harbor:newHarbor(p,true),recovered:slot.recovered,wallHigh:now.wall};
  }
  return {harbor:newHarbor(),recovered:false,wallHigh:now.wall};
}
export function saveHarbor(storage:StorageLike,h:Harbor,c:ClockSample) {
  const previous=storage.getItem(LIVE);
  if(previous) {
    const packet=(()=>{try{return JSON.parse(previous);}catch{return null;}})();
    if(packet?.version>1)throw new SaveFormatError("newer");
    if(packet?.version===1 && typeof packet.body==="string" && sum(packet.body)===packet.checksum) {
      try{storage.setItem(BACKUP,previous);}catch{/* Replacing the primary can still fit. */}
    }
  }
  storage.setItem(LIVE,encode(h,c));
}
