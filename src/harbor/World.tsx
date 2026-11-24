import {Anchor, BatteryCharging, Coins, Droplet, MapPin, Radio, Waves, Wind} from "lucide-react";
import {openingCapacity} from "../lib/opening-industry";
import {fa,regions} from "./catalog";
import type {OpeningFocus} from "../lib/opening-attention";
import {clearedThrough,type Harbor} from "./session";

export type PortPoint="tank"|"treasury"|"dock"|"power";
export function World({h,point,focus}:{h:Harbor;point:(p:PortPoint)=>void;focus:OpeningFocus|null}) {
  const p=h.port,o=p.opening!,tank=p.idle.port.tanker,front=clearedThrough(h);
  const region=front<25?0:front<35?1:2;
  const ready=tank?.stage==="loading";
  const loading=tank?.progress??0;
  const travel=tank?.stage==="depart"?1-loading:loading;
  const tx=ready?67:tank?.stage==="depart"?67+travel*65:130-travel*63;
  const ty=ready?42:tank?.stage==="depart"?42+travel*22:64-travel*22;
  const fullness=Math.min(100,100*p.oil/openingCapacity(p));
  return <div className="world" aria-label="بندر زنده">
    <div className="tableau">
      <img className="paint" src="/harbor/harbor.webp" alt="" draggable={false}/>
      <div className="water-light"/><i className="lamp-sweep"/>
      {p.fuel>0 && <div className="smokestack"><i/><i/><i/></div>}
      {tank&&<button className={'vessel export '+(!ready?'moving ':'')+(tank.stage==="approach"?'west':'')} style={{left:tx+'%',top:ty+'%'}} onClick={()=>point("dock")} aria-label="نفت‌کش صادراتی">
        <span className="wake"/><img src="/harbor/tanker.webp" alt=""/><i className={'maritime-flag flag-'+h.pennant}/></button>}
      {p.merchants.map(m=><button key={m.id} className={'vessel merchant moving '+(m.inbound?'west':'')}
        style={{left:((m.inbound?1-m.progress:m.progress)*132-16)+'%',top:(m.inbound?70-5*m.progress:62-5*m.progress)+'%'}}
        onClick={()=>point("treasury")} aria-label="کشتی عبوری"><span className="wake"/><img src="/harbor/merchant.webp" alt=""/></button>)}
      <button aria-label="مخزن نفت" onClick={()=>point("tank")} className={'berth tank '+(o.stalled?'amber ':'')+(focus==="tank"?'focus':'')}>
        <Droplet/><span>مخزن نفت<small>{fa(p.oil)} / {fa(openingCapacity(p))}</small><i className="meter"><i style={{width:fullness+'%'}}/></i></span></button>
      <button aria-label="خزانه بندر" onClick={()=>point("treasury")} className={'berth treasury '+(focus?.startsWith("treasury")?'focus':'')}>
        <Coins/><span>خزانه<small>{fa(p.idle.bank)} ریال</small></span></button>
      {front>=3&&<button aria-label="نیروگاه بندر" className="berth power" onClick={()=>point("power")}><BatteryCharging/></button>}
      {front>=5&&<div className="flags" aria-label="پرچم‌های فصل‌های کامل‌شده">{Array.from({length:Math.floor(front/5)},(_,i)=><i key={i}/>)}</div>}
    </div>
    <div className="location"><small><MapPin size={12}/>{regions[region]} <b>·</b> شیفت {fa(Math.floor(front/5)+1)}</small><h1>لنگرگاه هرمز</h1></div>
    <button className="dock-status" onClick={()=>point("dock")}><Anchor size={15}/>{ready?"بارگیری نفت‌کش":tank?.stage==="depart"?"خروج نفت‌کش":tank?"ورود نفت‌کش":"اسکله آزاد"}<span className="mini-lamp"/></button>
    <div className="world-bottom"><span><Wind size={14}/> {o.stalled?"پمپ در انتظار ظرفیت":o.generated>0?"پمپ روشن":"آغاز شیفت"}</span><span><Waves size={14}/>{fa(p.trafficCount)} شناور</span></div>
  </div>;
}
export function RadioNote({name="ناخدا نوا",children}:{name?:string;children:React.ReactNode}) {
  return <div className="radio-note"><img src="/harbor/pilot.webp" alt="ناخدا نوا"/><div><small><Radio size={14}/>{name}</small><p>{children}</p></div></div>;
}
