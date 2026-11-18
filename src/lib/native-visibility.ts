// Android may report onPause before WebView fires visibilitychange.
let inactive = false;
export const nativeVisibilityEvent = 'hormuz:native-visibility';
export function setNativeBackgrounded(next: boolean) {
  if (inactive === next) return;
  inactive = next;
  window.dispatchEvent(new Event(nativeVisibilityEvent));
}
export function isRenderHidden() { return inactive || document.hidden; }
