"use client";

import { useEffect, useRef } from "react";

export function useDialog<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = ref.current;
    if (!root) return;
    const focusable = () => [...root.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"], summary')]
      .filter(element => element.getClientRects().length > 0);
    const timer = window.setTimeout(() => {
      (root.querySelector<HTMLElement>("[data-autofocus]") ?? focusable()[0] ?? root).focus();
    }, 40);
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeRef.current();
      }
      if (event.key === "Tab") {
        const items = focusable();
        const first = items[0], last = items[items.length - 1];
        if (!first) { event.preventDefault(); root.focus(); return; }
        if (event.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) {
          event.preventDefault(); first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKey, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", handleKey, true);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return ref;
}
