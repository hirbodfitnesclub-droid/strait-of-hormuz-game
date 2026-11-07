"use client";

import { useEffect, useState } from "react";
import { Check, Download, Smartphone } from "lucide-react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
let deferred: InstallEvent | null = null;
const subscribers = new Set<() => void>();

export default function MobileExperience() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }
    const onInstall = (event: Event) => { event.preventDefault(); deferred = event as InstallEvent; subscribers.forEach(fn => fn()); };
    const onInstalled = () => { deferred = null; subscribers.forEach(fn => fn()); };
    window.addEventListener("beforeinstallprompt", onInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onInstall); window.removeEventListener("appinstalled", onInstalled); };
  }, []);
  return null;
}

export function InstallGameButton() {
  const [installed,setInstalled]=useState(false),[instructions,setInstructions]=useState(false),[ready,setReady]=useState(false);
  useEffect(()=>{
    const update=()=>{setReady(!!deferred);setInstalled(window.matchMedia('(display-mode: standalone)').matches);};
    update();subscribers.add(update);return()=>{subscribers.delete(update);};
  },[]);
  const install=async()=>{
    if(!deferred){setInstructions(!instructions);return;}
    try { const prompt=deferred;await prompt.prompt();const choice=await prompt.userChoice;if(choice.outcome==="accepted")setInstalled(true);deferred=null;setReady(false); } catch { setInstructions(true); }
  };
  return <div className="install-game"><span className="install-icon"><Smartphone size={23}/></span><div><strong>{installed?"نسخهٔ صفحهٔ اصلی فعال است":"بازی همیشه کنار شما"}</strong><p>اجرای تمام‌صفحه و بازگشت به بازی بدون اینترنت پس از اولین بارگذاری.</p></div><button onClick={install} disabled={installed} aria-label="افزودن بازی به صفحه اصلی">{installed?<Check size={18}/>:<Download size={18}/>}<span>{installed?"فعال":ready?"نصب":"راهنما"}</span></button>{instructions&&<p className="install-instructions">در Chrome اندروید، منوی سه‌نقطه ← «افزودن به صفحهٔ اصلی» را بزنید. در Safari آیفون، Share ← Add to Home Screen. هدیهٔ روزانه و ذخیرهٔ سرور به اینترنت نیاز دارند.</p>}</div>;
}
