import campaign from "../data/reopening/campaign.json";
import regional from "../data/reopening/regional_operations.json";
import infrastructure from "../data/reopening/capital_works.json";
import orders from "../data/reopening/port_contracts.json";
import modes from "../data/reopening/mode_rules.json";
import type { BuildingId } from "../lib/game";

export type Lane = "A" | "B";
export type Pattern = "a" | "b" | "c";
export type Goods = "oil" | "fuel" | "steel" | "ammo";
export type Role = "steady" | "pulse" | "weight" | "mixed";
export type Beat = {beat:number; start_s:number; spacing_s:number; count:number; pattern:string; channel:string; objective_live:boolean; final_signature:boolean};
export interface Operation {
  id:number; name:string; region:number; chapter:string; story:string; news:string;
  board:string; goal:string; escort:number|null; quota:number|null; pressure:number; spaced:boolean;
  groups:Beat[]; vulnerable:BuildingId[]; projects:string[]; firstCash:number; repeatCash:number; bonds:number;
}
export const regions = ["بندرعباس", "قشم و هنگام", "ابوموسی"];
export const regionArt = ["strait", "passage", "night"];
export const roleNames:Record<Role,string> = {steady:"فانوس ساحلی",pulse:"موج‌شکن",weight:"برج نوری",mixed:"دیده‌بان مه"};
export const roles = regional.towers.map(row => ({
  id:row.glyph as Role, name:roleNames[row.glyph as Role], cash:row.base_cash, steel:row.base_steel, mw:row.mw,
  from:row.unlocks_on_preparation_op ?? (row.unlocks_after_op ?? 0)+1, coefficients:row.coefficient_pct_abc,
}));
export const works = infrastructure.projects;
export const contracts = orders.contracts;
export const repeatContractRate = orders.repeat_cash_ratio[0] / orders.repeat_cash_ratio[1];
export const modeRules = modes;
export const profiles = campaign.abstract_reference_profiles;
export const starRules = campaign.result_stars;
export const operations:Operation[] = [
  ...campaign.operations.map(row => ({
    id:row.op,name:row.title_fa,region:1,chapter:campaign.chapters[row.arc-1].title_fa,story:row.briefing_fa,news:row.first_clear_news_fa,
    board:row.board,goal:row.objective,escort:row.objective_initial,quota:row.quota_min_pct,pressure:row.model_pressure_percent,spaced:row.allow_cadence_choice,
    groups:row.groups,vulnerable:row.damage_eligible_built_facilities as BuildingId[],projects:[],
    firstCash:row.op<=5 ? 80+10*row.op : 65+3*row.arc,repeatCash:20+2*row.op,bonds:modes.region1_first_account_bonds[String(row.op) as keyof typeof modes.region1_first_account_bonds]??0,
  })),
  ...regional.operations.map(row => ({
    id:row.op,name:row.title_fa,region:row.region,chapter:regions[row.region-1],story:row.intro_fa,news:row.first_news_fa,
    board:row.board,goal:row.objective,escort:row.objective_initial,quota:row.quota_min_pct,pressure:row.model_pressure_percent,spaced:row.allow_cadence_choice,
    groups:row.groups,vulnerable:row.damage_eligible_built_facilities as BuildingId[],projects:row.required_port_projects,
    firstCash:row.first_cash,repeatCash:row.repeat_cash,bonds:row.first_account_bonds,
  })),
];
export const goodsNames:Record<Goods,string> = {oil:"نفت",fuel:"سوخت",steel:"فولاد",ammo:"تدارکات"};
export const goodsKeys = Object.keys(goodsNames) as Goods[];
export const goalNames:Record<string,string> = {repel:"حفظ آبراه",escort:"اسکورت کاروان",airdef:"حفاظت از نشان‌ها",intercept:"رهگیری موج",structure:"حفاظت از اسکله",siege:"دفاع دو گذر",rescue:"نجات شناور",quota:"عبور سهمیه‌دار",hold:"حفظ چراغخانه"};
export const training:Operation = {
  ...operations[0],id:0,name:"تمرین فانوس",chapter:"بی‌سیم بندر",story:"دو شناور در مه مانده‌اند. روی حلقه بزن تا نور فانوس به آن برسد.",goal:"repel",pressure:85,
  groups:[{beat:1,start_s:1,spacing_s:2,count:3,pattern:"a",channel:"A",objective_live:false,final_signature:false},
    {beat:2,start_s:8,spacing_s:2,count:3,pattern:"b",channel:"B",objective_live:true,final_signature:false}],
};
const number = new Intl.NumberFormat("fa-IR",{maximumFractionDigits:0});
export const fa = (n:number) => number.format(Math.floor(n+1e-7));
export function duration(seconds:number) {
  const s=Math.max(0,Math.ceil(seconds));
  if(s>=3600) return fa(Math.floor(s/3600))+" ساعت و "+fa(Math.floor(s%3600/60))+" دقیقه";
  return fa(Math.floor(s/60))+":"+String(s%60).padStart(2,"0").replace(/\d/g,n=>"۰۱۲۳۴۵۶۷۸۹"[Number(n)]);
}
