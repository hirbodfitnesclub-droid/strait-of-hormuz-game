import { useEffect, useState } from "react";
import { dismissHint, emptyHintMemory, visitHint, visibleHint, type HintMemory, type OpeningFocus } from "@/lib/opening-attention";

function loadMemory(key: string): HintMemory {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    if (value && typeof value.episode === "string" && Number.isFinite(value.since) && Array.isArray(value.dismissed)) return value;
  } catch { /* Optional hint history can restart if local storage is unavailable. */ }
  return emptyHintMemory();
}

export function useOpeningHint(key: string | null, episode: string, target: OpeningFocus | null, time: number, covered: boolean) {
  const [history, setHistory] = useState<{key: string; memory: HintMemory} | null>(null);
  useEffect(() => {
    // Restore a profile's hint timing only after its save and browser storage are ready.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHistory(key ? {key, memory:loadMemory(key)} : null);
  }, [key]);
  useEffect(() => {
    if (!history || history.key !== key) return;
    try { localStorage.setItem(history.key, JSON.stringify(history.memory)); } catch { /* Progress remains playable without storage. */ }
  }, [history, key]);

  const current = key && history?.key === key ? history.memory : null;
  const memory = current && !covered ? visitHint(current, episode, target, time) : current;
  if (key && current && memory && memory !== current) setHistory({key, memory});
  return {
    highlight: memory && !covered ? visibleHint(memory, time) : null,
    canDismiss: !!(memory && !covered && target && !memory.dismissed.includes(target)),
    dismiss: () => { if (key && memory) setHistory({key, memory:dismissHint(memory)}); },
  };
}
