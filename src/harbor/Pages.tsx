import {useState} from "react";
import {Anchor, ArrowLeft, BadgeCheck, BookOpen, Check, ChevronLeft, Clock3, Coins, Compass, Droplet, Factory, Flag, Hammer, LockKeyhole, Package, Radio, Ship, Sparkles, Star, Ticket, Trophy, Waves, Zap} from "lucide-react";
import {BUILDINGS,getStats,type BuildingId} from "../lib/game";
import {contracts,duration,fa,goodsKeys,goodsNames,operations,regionArt,regions,roles,works,type Role} from "./catalog";
import {clearedThrough,contractQuote,stationPrice,weeklyOp,weekKey,type Harbor} from "./session";
import type {HarborStore} from "./useHarbor";

export type Sheet={kind:"building";id:BuildingId}|{kind:"brief";op:number}|{kind:"order";id:string}|{kind:"treasury"|"dock"|"settings"|"honors"|"prestige"|"modes"|"crew"};
export interface PageProps {h:Harbor;store:HarborStore;open:(s:Sheet)=>void;toast:(s:string)=>void}
export const facilities:BuildingId[]=["tank","dock","oil","refinery","power","steel","water","city","welfare","optical","arms"];
export function PageTitle({eyebrow,title,children}:{eyebrow:string;title:string;children?:React.ReactNode}) {
  return <div className="page-title"><div><small>{eyebrow}</small><h1>{title}</h1></div>{children}</div>;
}
export function Stars({value}:{value:number}) {return <span className="stars" aria-label={fa(value)+" ستاره"}>{[1,2,3].map(i=><Star key={i} className={i<=value?"lit":""} size={16}/>)}</span>;}
export function RoleList({h,store,toast}:PageProps) {
  return <div className="entry-list">{roles.map((r,i)=>{
    const price=stationPrice(h,r.id),rank=h.roles[r.id],locked=clearedThrough(h)+1<r.from;
    const Glyph=[Radio,Waves,Anchor,Compass][i];
    return <div className="entry" key={r.id}><span className={'role-icon role-'+i}><Glyph/></span><div className="entry-body"><b>{r.name} {rank>0?'· '+fa(rank):''}</b><small>{locked?'پس از عملیات '+fa(r.from-1):['نور پیوسته برای موج‌های منظم','مناسب نوبت‌های فشرده','نور متمرکز روی نشان‌های سنگین','پوشش متوازن برای هر سه نشان'][i]}</small>{!locked&&rank<6&&<small>{fa(price.cash)} ریال · {fa(price.steel)} فولاد</small>}</div>
    <button className="outline" disabled={!price.available||h.port.cash<price.cash||h.port.steel<price.steel} onClick={()=>{store.command({type:"station",role:r.id,level:rank});toast(r.name+" آماده شد");}}>{locked?<LockKeyhole size={15}/>:rank>=6?'کامل':rank?'ارتقا':'ساخت'}</button></div>;
  })}</div>;
}
export function Workshop(props:PageProps) {
  const {h,open,store,toast}=props,[tab,setTab]=useState("industry");
  const stats=getStats(h.port),o=h.port.opening!,front=clearedThrough(h);
  return <section className="page scroll"><PageTitle eyebrow="زیرساخت و تجهیزات" title="کارگاه بندر"><Factory/></PageTitle>
    <div className="folio-banner" style={{backgroundImage:"url(/harbor/industry.webp)"}}><span><Zap/> شبکهٔ برق</span><strong>{fa(stats.powerUsed)} / {fa(stats.powerProduced)} <small>مگاوات</small></strong></div>
    <div className="segment">{[["industry","صنعت"],["signals","فانوس‌ها"],["projects","طرح‌ها"]].map(([id,label])=><button aria-pressed={tab===id} key={id} onClick={()=>setTab(id)}>{label}</button>)}</div>
    {tab==="industry"?<><div className="facilities">{facilities.map(id=><button className="facility" key={id} onClick={()=>open({kind:"building",id})}><img src={'/harbor/facilities/'+id+'.webp'} alt=""/><span><b>{BUILDINGS[id].short}</b><small>{o.wear?.[id]?'نیاز به تعمیر':h.port.buildings[id]?'سطح '+fa(h.port.buildings[id]):'آمادهٔ ساخت'}</small></span><ChevronLeft size={14}/></button>)}</div><button className="wide-row" onClick={()=>open({kind:"crew"})}><Radio/>مدیران شیفت<ChevronLeft/></button></>:
    tab==="signals"?<RoleList {...props}/>:<div className="entry-list">{works.map(w=><div className="entry" key={w.id}><span className="role-icon"><Hammer/></span><div className="entry-body"><b>{w.fa}</b><small>ورود به عملیات {fa(w.before_op)} · {fa(w.cash)} ریال و {fa(w.steel)} فولاد</small></div><button className="outline" disabled={front<w.reveal_after||o.works?.includes(w.id)||h.port.cash<w.cash||h.port.steel<w.steel} onClick={()=>{store.command({type:"works",id:w.id});toast(w.fa+" تکمیل شد");}}>{o.works?.includes(w.id)?<Check/>:front<w.reveal_after?<LockKeyhole size={15}/>:'ساخت'}</button></div>)}</div>}
  </section>;
}
export function Chart({h,open}:PageProps) {
  const front=clearedThrough(h),current=Math.min(front+1,45),[page,setPage]=useState(Math.floor((current-1)/5));
  const rows=operations.slice(page*5,page*5+5),r=rows[0].region;
  return <section className="page scroll"><PageTitle eyebrow="کارزار بازگشایی" title="نقشهٔ عملیات"><span className="count-chip"><Flag/>{fa(front)} / ۴۵</span></PageTitle>
    <div className="chart-banner" style={{backgroundImage:'url(/harbor/'+regionArt[r-1]+'.webp)'}}><small>فصل {fa(page+1)} · {regions[r-1]}</small><h2>{rows[0].chapter}</h2><div className="chapter-dots">{Array.from({length:9},(_,i)=><i key={i} className={i===page?'here':i*5<front?'past':''}/>)}</div></div>
    <div className="chapter-switch"><button className="square" disabled={!page} onClick={()=>setPage(page-1)} aria-label="فصل قبلی"><ChevronLeft className="mirror"/></button><b>عملیات {fa(rows[0].id)} تا {fa(rows[4].id)}</b><button className="square" disabled={page===8} onClick={()=>setPage(page+1)} aria-label="فصل بعدی"><ChevronLeft/></button></div>
    <div className="mission-list">{rows.map(op=><button key={op.id} className={'mission '+(op.id===current?'current':'')} onClick={()=>open({kind:"brief",op:op.id})}>
      <span className="op-no">{fa(op.id)}</span><span className="mission-name"><b>{op.name}</b><small>{h.stars[op.id]?'ثبت‌شده در دفتر بندر':op.id===current?'عملیات جاری':'پس از گذر '+fa(op.id-1)}</small></span>{h.stars[op.id]?<Stars value={h.stars[op.id]}/>:op.id>current?<LockKeyhole size={15}/>:<ArrowLeft size={19}/>}</button>)}</div>
    <button className="wide-row" onClick={()=>open({kind:"modes"})}><Trophy/>چالش هفتگی و شیفت آزاد<ChevronLeft/></button>
  </section>;
}
export function Logbook({h,open,store,toast}:PageProps) {
  const [tab,setTab]=useState("journal"),front=clearedThrough(h),o=h.port.opening!;
  return <section className="page scroll"><PageTitle eyebrow="بایگانی لنگرگاه" title="دفتر ناخدا"><BookOpen/></PageTitle>
    <div className="ledger-nums"><span><Flag/>{fa(front)}<small>گذر موفق</small></span><span><Star/>{fa(Object.values(h.archive).reduce((a,b)=>a+b,0))}<small>ستارهٔ ثبت‌شده</small></span><span><Ticket/>{fa(h.bonds)}<small>اوراق بندر</small></span></div>
    <div className="segment">{[["journal","رویدادها"],["orders","سفارش‌ها"],["flags","پرچم‌ها"]].map(([k,v])=><button key={k} aria-pressed={tab===k} onClick={()=>setTab(k)}>{v}</button>)}</div>
    {tab==="journal"?<><div className="journal"><h3><Flag size={17}/>گزارش شیفت</h3>{!h.history.length&&<p>مجوز بازگشایی رسید. ناخدا نوا اولین کشتی را به اسکله فراخواند.</p>}
      {h.history.map(r=><div className="journal-line" key={r.id}><BadgeCheck/><div><b>{operations[r.op-1]?.name}</b><small>{r.win?'+ '+fa(r.cash)+' ریال':'گذر ناتمام'} · {fa(r.seconds)} ثانیه</small></div><Stars value={r.stars}/></div>)}
      {o.firstTollAt!==null&&<p>اولین عوارض در ثانیهٔ {fa(o.firstTollAt)} ثبت شد.</p>}
      {o.recoveryReceipt&&<p>تولید با ارتقای مخزن در ثانیهٔ {fa(o.recoveryReceipt.positiveAt)} از سر گرفته شد.</p>}
      <div className="account-row"><span>فروش نفت</span><b>{fa(o.ledger.exportIncome)} ریال</b></div><div className="account-row"><span>عوارض عبور</span><b>{fa(o.ledger.tolls)} ریال</b></div></div>
      <button className="wide-row" onClick={()=>open({kind:"prestige"})}><Anchor/>راه‌اندازی بندر تازه<ChevronLeft/></button></>:
    tab==="orders"?<><div className="note-inline"><Package/>{front<25?'پس از عملیات ۲۵، اولین بارنامهٔ قشم باز می‌شود.':'موجودی محموله هنگام پذیرش از انبار کنار گذاشته می‌شود.'}</div>
      {h.jobs.map(job=><div className="job" key={job.ticket}><b><Ship/>{contracts.find(c=>c.id===job.sheet)?.title_fa}</b><small>{job.due<=h.wall?'آمادهٔ تسویه':duration(job.due-h.wall)+' تا رسیدن'}</small><div className="controls"><button className="primary" disabled={job.due>h.wall} onClick={()=>{store.command({type:"shipment",how:"settle",ticket:job.ticket});toast("بارنامه تسویه شد");}}>تسویه</button><button className="secondary" onClick={()=>store.command({type:"shipment",how:"cancel",ticket:job.ticket})}>بازگرداندن بار</button>{job.due>h.wall&&h.bonds>=25&&<button className="outline" onClick={()=>store.command({type:"shipment",how:"instant",ticket:job.ticket})}>فوری · ۲۵ اوراق</button>}</div></div>)}
      {contracts.map(c=><button className="wide-row" key={c.id} onClick={()=>open({kind:"order",id:c.id})}><Package/>{c.title_fa}<small>{h.stamps.includes('sheet/'+c.id)?'مهرشده':'عملیات '+fa(c.requires_op_cleared)}</small><ChevronLeft/></button>)}
      {front>=25&&!h.secondSlot&&<button className="secondary" disabled={h.bonds<280} onClick={()=>store.command({type:"second-slot"})}>جایگاه دوم · ۲۸۰ اوراق</button>}</>:
    <><p className="note-inline"><Ticket/>اولین پیروزی اوراق می‌دهد. پرچم انتخاب‌شده روی نفت‌کش برافراشته می‌شود.</p><div className="pennants">{['کهربا','مرجان','فیروزه','یاسی'].map((name,i)=><button key={name} className={'pennant flag-'+i} disabled={!h.flags.includes(i)&&h.bonds<2} onClick={()=>{store.command({type:"pennant",color:i});toast('پرچم '+name+' برافراشته شد');}}><Flag/><b>{name}</b><small>{h.pennant===i?'برافراشته':h.flags.includes(i)?'انتخاب':'۲ اوراق'}</small></button>)}</div></>}
  </section>;
}
export function Orders({id,h,store,toast,close}:PageProps&{id:string;close:()=>void}) {
  const c=contracts.find(c=>c.id===id)!;
  return <><div className="sheet-hero freight"/><h2>{c.title_fa}</h2><p>{c.brief_fa}</p>{c.options.map(opt=>{const q=contractQuote(h,id,opt.id)!;
    return <div className="order-choice" key={opt.id}><b>{opt.label_fa}</b><small>{goodsKeys.filter(k=>q.manifest[k]).map(k=>fa(q.manifest[k]!)+" "+goodsNames[k]).join(" · ")} · ذخیرهٔ سوخت {fa(opt.reserves_after.fuel)}</small><div className="account-row"><span><Clock3/>{duration(opt.service_wall_s)}</span><strong>{fa(q.cash)} ریال</strong></div>
      <button className="secondary" disabled={!q.affordable||clearedThrough(h)<c.requires_op_cleared||h.jobs.length>=(h.secondSlot?2:1)||h.jobs.some(j=>j.sheet===id)} onClick={()=>{store.command({type:"dispatch",sheet:id,option:opt.id,serial:h.serial});toast('محموله به اسکله رفت');close();}}>پذیرش بارنامه</button></div>;})}</>;
}
export function Modes({h,store,close}:PageProps&{close:()=>void}) {
  const week=weekKey(h.port.lastSavedAt),op=weeklyOp(week);
  const start=(mode:"weekly"|"endless")=>{store.command({type:"launch",mode,op:op.id,role:"steady",spaced:false,week});close();};
  return <><div className="sheet-hero night"/><h2>شیفت‌های ویژه</h2><div className="order-choice"><b><Trophy/> چالش هفتگی · {op.name}</b><p>هر هفته یک گذر با فانوس یکسان برای همه. رکورد این دستگاه {fa(h.bestWeek?.week===week?h.bestWeek.score:0)} امتیاز است.</p><button className="primary" onClick={()=>start("weekly")}>شروع چالش محلی<ArrowLeft/></button></div>
    <div className="order-choice"><b><Waves/>شیفت بی‌پایان</b><p>{h.archive[45]?'ایستگاه '+fa(h.depth)+' · بهترین عمق '+fa(h.bestDepth):'با ثبت آخرین عملیات، شیفت‌های پنج‌گذر باز می‌شوند.'}</p><button className="secondary" disabled={!h.archive[45]} onClick={()=>start("endless")}>ورود به شیفت آزاد</button></div></>;
}
