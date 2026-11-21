'use client';
import { Download, Upload } from 'lucide-react';
import Image from 'next/image';
import { useRef, type Dispatch } from 'react';
import { hydrateGame, type Action, type GameState } from '@/lib/game';
import { exportJson } from '@/lib/export-file';
import { writeSnapshot } from '@/lib/save-storage';

export default function SaveBackup({ game, dispatch, notify, close }: {game: GameState; dispatch: Dispatch<Action>; notify: (s:string)=>void; close:()=>void}) {
  const input = useRef<HTMLInputElement>(null);
  return <div className="diagnostics-settings backup-settings"><strong><Image src="/assets/workshop/command/folio.webp" width={40} height={40} alt="" unoptimized />پشتیبان پیشرفت</strong><p>برای انتقال به دستگاه دیگر، یک فایل پشتیبان نگه دارید. بازی در دستگاه تازه از همین نقطه ادامه پیدا می‌کند.</p>
    <button onClick={() => { void exportJson('hormuz-save.json', {format:'hormuz-save',version:1,state:{...game,shots:[],popups:[],lastSavedAt:Date.now()}}).catch(()=>notify('فایل ذخیره نشد؛ دوباره تلاش کنید.')); }}><Download size={17} />دریافت فایل پشتیبان</button>
    <button onClick={() => input.current?.click()}><Upload size={17} />بازیابی از فایل</button>
    <input ref={input} type="file" accept="application/json,.json" hidden onChange={async event => {
      const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
      try {
        if (file.size > 2_000_000) throw new Error('size');
        const value = JSON.parse(await file.text());
        if (value.format !== 'hormuz-save' || value.version !== 1) throw new Error('format');
        const restored = hydrateGame({...value.state,lastSavedAt:Date.now()});
        if (!restored) throw new Error('state');
        if (!window.confirm('پیشرفت فعلی با فایل انتخاب‌شده جایگزین شود؟')) return;
        // A transferred save cannot redeem a daily receipt already used here.
        restored.game.idle.appliedDailyIds = [...new Set([...restored.game.idle.appliedDailyIds,...game.idle.appliedDailyIds])].slice(-64);
        writeSnapshot(localStorage,restored.game);
        dispatch({type:'hydrate',game:restored.game}); close(); notify('پیشرفت بازیابی شد. نبرد تا انتخاب ادامه، متوقف است.');
      } catch { notify('بازیابی انجام نشد؛ فایل معتبر و فضای خالی دستگاه را بررسی کنید.'); }
    }}/>
  </div>;
}
