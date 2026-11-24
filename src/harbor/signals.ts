import {modeRules, operations, profiles, roles, starRules, training, type Lane, type Operation, type Pattern, type Role} from "./catalog";

export type RunMode = "campaign" | "practice" | "endless" | "weekly";
export interface Signal {
  id:number; at:number; until:number; lane:Lane; pattern:Pattern; marked:boolean; signature:boolean; work:number;
}
export interface Voyage {
  id:number; op:number; mode:RunMode; radioBoost?:number; depth:number; role:Role; rank:number; grid:number; policy:"marked"|"soon";
  spaced:boolean; time:number; cursor:number; hp:number; cargo:number|null; chargeAt:number; flashAt:number;
  beamId:number; streak:number; bestStreak:number; manual:number; escaped:number; cleared:number;
  counts:{A:number;B:number;marked:number}; active:(Signal & {left:number})[]; done:boolean;
}
export const planFor = (v:Pick<Voyage,"mode"|"op">) => v.mode==="practice" ? training : operations[v.op-1];
const schedules = new Map<string,Signal[]>();
export function signalsFor(op:Operation, spaced:boolean, extraPressure=0):Signal[] {
  const key=[op.id,spaced,extraPressure].join("/");
  const cached=schedules.get(key);
  if(cached) return cached;
  const schedule=op.groups.flatMap(g=>Array.from({length:g.count},(_,i)=>{
    const pattern=g.pattern as Pattern;
    const profile=profiles[pattern];
    const signature=g.final_signature && i===g.count-1;
    const at=g.start_s+(op.spaced && spaced ? 3*(g.beat-1) : 0)+i*g.spacing_s;
    return {id:g.beat*100+i,at,until:at+profile.deadline_s+(signature?2:0),lane:g.channel as Lane,pattern,marked:g.objective_live,
      signature,work:Math.ceil(profile.model_work*(op.pressure+extraPressure)/100)+(signature?12:0)};
  })).sort((a,b)=>a.at-b.at||a.id-b.id);
  schedules.set(key,schedule);
  return schedule;
}
export function scheduleFor(v:Voyage) {
  const endless=modeRules.endless;
  const pressure=v.mode==="endless" ? Math.min(endless.pressure_extra_cap_pct,Math.floor((v.depth-1)/endless.count_per_cycle)*endless.pressure_extra_per_cycle_pct) : 0;
  return signalsFor(planFor(v),v.spaced,pressure);
}
export function launch(id:number,op:Operation,mode:RunMode,role:Role,rank:number,grid:number,spaced:boolean,depth=1):Voyage {
  return {id,op:op.id,mode,depth,role,rank,grid,policy:"soon",spaced:spaced&&op.spaced,time:0,cursor:0,hp:20,cargo:op.escort,
    chargeAt:0,flashAt:-10,beamId:0,streak:0,bestStreak:0,manual:0,escaped:0,cleared:0,counts:{A:0,B:0,marked:0},active:[],done:false};
}
function cleared(v:Voyage,signal:Signal) {
  v.cleared++;v.counts[signal.lane]++;
  if(signal.marked) v.counts.marked++;
}
function terminal(v:Voyage,schedule:Signal[]) {
  return v.hp<=0 || v.cargo===0 || (v.cursor===schedule.length && !v.active.length);
}
// Every simulation update uses a quarter second on any refresh rate. Tap commands occur between updates.
export function sail(input:Voyage):Voyage {
  if(input.done)return input;
  const schedule=scheduleFor(input);
  const v={...input,time:input.time+.25,counts:{...input.counts},active:input.active.map(s=>({...s}))};
  while(v.cursor<schedule.length && schedule[v.cursor].at<=v.time) {
    const s=schedule[v.cursor++];v.active.push({...s,left:s.work});
  }
  v.active.sort((a,b)=>(v.policy==="marked"?Number(b.marked)-Number(a.marked):0) || a.until-b.until || a.id-b.id);
  const station=roles.find(r=>r.id===v.role)!;
  // A handheld radio is always available. The first operation loans a lamp. A purchased station sustains a stronger beam.
  let energy=(v.rank===0 ? .6 : 2.25+v.rank*.86)*v.grid*.25;
  v.beamId=0;
  for(const s of v.active) {
    if(energy<=0) break;
    const efficiency=station.coefficients["abc".indexOf(s.pattern)]/100;
    const used=Math.min(energy,s.left/efficiency);
    s.left=Math.max(0,s.left-used*efficiency);energy-=used;
    v.beamId=s.id;
  }
  v.active=v.active.filter(s=>{
    if(s.left<=.000001){cleared(v,s);return false;}
    if(s.until>v.time)return true;
    v.hp=Math.max(0,v.hp-(s.signature?3:2));
    if(s.marked && v.cargo!==null)v.cargo=Math.max(0,v.cargo-2);
    v.escaped++;v.streak=0;
    return false;
  });
  v.done=terminal(v,schedule);
  return v;
}
export function illuminate(input:Voyage,id:number):Voyage {
  const target=input.active.find(s=>s.id===id);
  if(input.done||input.time<input.chargeAt||!target)return input;
  const v={...input,counts:{...input.counts},manual:input.manual+1,beamId:id,flashAt:input.time,chargeAt:input.time+1.25,
    active:input.active.map(s=>({...s}))};
  const s=v.active.find(s=>s.id===id)!;
  const crossing=(v.time-s.at)/(s.until-s.at);
  const inRing=crossing>=.30 && crossing<=.73;
  v.streak=inRing?v.streak+1:0;
  v.bestStreak=Math.max(v.bestStreak,v.streak);
  s.left-=(inRing ? 16+Math.min(4,v.streak)*2 : 7)*(v.radioBoost??1);
  if(s.left<=0){cleared(v,s);v.active=v.active.filter(item=>item.id!==s.id);}
  v.done=terminal(v,scheduleFor(v));
  return v;
}
export function score(v:Voyage) {
  const op=planFor(v),schedule=scheduleFor(v);
  const buckets:(Lane|"marked")[]=op.goal==="siege"?["A","B"]:["marked"];
  const quota=Math.min(...buckets.map(k=>{
    const count=schedule.filter(s=>k==="marked"?s.marked:s.lane===k).length;
    return count ? Math.floor(100*v.counts[k]/count) : 100;
  }));
  const win=v.hp>0 && v.cargo!==0 && (op.quota===null||quota>=op.quota);
  const stars=win?Math.min(v.hp>=starRules.three_min_hearts?3:v.hp>=starRules.two_min_hearts?2:1,
    op.escort!==null && v.cargo!==null && 2*v.cargo<op.escort?2:3):0;
  return {win,stars,quota,points:Math.max(0,1000*Number(win)+20*v.hp+(op.quota?5*quota:0)+10*v.cleared-Math.ceil(v.time))};
}
