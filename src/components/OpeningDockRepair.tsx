import type { Dispatch } from "react";
import { Wrench } from "lucide-react";
import type { Action, GameState } from "@/lib/game";
import { openingDockEfficiency, openingRepairQuote } from "@/lib/opening-operations";
import { fa } from "./game-ui";

export default function OpeningDockRepair({game, dispatch}: {game: GameState; dispatch: Dispatch<Action>}) {
  const quote = openingRepairQuote(game);
  if (!quote || !game.opening) return null;
  const service = quote.serviceDue !== null;
  return <section className="opening-dock-order" aria-label="برگ تعمیر اسکله">
    <strong><Wrench size={16}/> برگ تعمیر اسکله</strong>
    <p>خسارت باقی‌مانده {fa(quote.remaining)} · بازده اسکله {fa(Math.round(openingDockEfficiency(game) * 100))}٪</p>
    <p>تعمیر یک واحد · {fa(quote.cash)} اعتبار بندر و {fa(quote.steel)} فولاد</p>
    <button type="button" className="result-next" disabled={service} onClick={() => dispatch({
      type:"repair-opening-dock", receipt:quote.key, method:quote.affordable ? "paid" : "service", allowCollection:quote.fromBank,
    })}>{service ? `سرویس در حال انجام · ${fa(Math.max(0,Math.ceil(quote.serviceDue! - game.opening.activeSeconds - game.opening.remainder)))} ثانیه`
      : quote.affordable ? (quote.fromBank ? "وصول موجودی صندوق و تعمیر یک واحد" : "تعمیر یک واحد") : `درخواست سرویس کسری · ${fa(quote.serviceDuration)} ثانیهٔ فعال`}</button>
  </section>;
}
