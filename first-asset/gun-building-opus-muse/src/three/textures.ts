import * as THREE from "three";

const cache = new Map<string, THREE.CanvasTexture>();

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function make(key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, srgb = true) {
  const hit = cache.get(key);
  if (hit) return hit;
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const c = cv.getContext("2d")!;
  draw(c);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

type Rect = [number, number, number, number];
let layout: Rect[] | null = null;
function panelLayout(): Rect[] {
  if (layout) return layout;
  const r = rng(7);
  const out: Rect[] = [];
  const split = (x: number, y: number, w: number, h: number, d: number) => {
    if (d > 4 || (w < 90 && h < 90) || (d > 1 && r() < 0.18)) {
      out.push([x, y, w, h]);
      return;
    }
    if (w > h ? r() < 0.75 : r() < 0.25) {
      const s = w * (0.3 + r() * 0.4);
      split(x, y, s, h, d + 1);
      split(x + s, y, w - s, h, d + 1);
    } else {
      const s = h * (0.3 + r() * 0.4);
      split(x, y, w, s, d + 1);
      split(x, y + s, w, h - s, d + 1);
    }
  };
  split(0, 0, 512, 512, 0);
  layout = out;
  return out;
}

function noise(c: CanvasRenderingContext2D, w: number, h: number, amt: number, seed: number) {
  const r = rng(seed);
  const img = c.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * amt;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  c.putImageData(img, 0, 0);
}

/** پنل‌های زرهی با درز، پرچ و چرک‌شدگی */
export function panelMap(base: string) {
  return make("panel" + base, 512, 512, (c) => {
    const r = rng(11);
    c.fillStyle = base;
    c.fillRect(0, 0, 512, 512);
    for (const [x, y, w, h] of panelLayout()) {
      const v = r();
      c.fillStyle = v > 0.5 ? `rgba(255,255,255,${(v - 0.5) * 0.12})` : `rgba(0,0,0,${(0.5 - v) * 0.22})`;
      c.fillRect(x, y, w, h);
      c.strokeStyle = "rgba(0,0,0,0.55)";
      c.lineWidth = 2.5;
      c.strokeRect(x + 1, y + 1, w - 2, h - 2);
      c.strokeStyle = "rgba(255,255,255,0.08)";
      c.lineWidth = 1;
      c.strokeRect(x + 3, y + 3, w - 6, h - 6);
      c.fillStyle = "rgba(0,0,0,0.5)";
      for (const [px, py] of [[x + 7, y + 7], [x + w - 7, y + 7], [x + 7, y + h - 7], [x + w - 7, y + h - 7]]) {
        c.beginPath();
        c.arc(px, py, 2, 0, 7);
        c.fill();
      }
    }
    // رگه‌های چرک عمودی
    for (let i = 0; i < 40; i++) {
      const x = r() * 512;
      const g = c.createLinearGradient(0, r() * 300, 0, 512);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, `rgba(20,14,8,${0.08 + r() * 0.12})`);
      c.fillStyle = g;
      c.fillRect(x, 0, 2 + r() * 6, 512);
    }
    noise(c, 512, 512, 18, 3);
  });
}

export function panelBump() {
  return make("panelBump", 512, 512, (c) => {
    c.fillStyle = "#909090";
    c.fillRect(0, 0, 512, 512);
    for (const [x, y, w, h] of panelLayout()) {
      c.strokeStyle = "#1a1a1a";
      c.lineWidth = 3;
      c.strokeRect(x + 1, y + 1, w - 2, h - 2);
      c.fillStyle = "#ffffff";
      for (const [px, py] of [[x + 7, y + 7], [x + w - 7, y + 7], [x + 7, y + h - 7], [x + w - 7, y + h - 7]]) {
        c.beginPath();
        c.arc(px, py, 2.2, 0, 7);
        c.fill();
      }
    }
    noise(c, 512, 512, 10, 5);
  }, false);
}

export function hazardMap() {
  return make("hazard", 256, 64, (c) => {
    c.fillStyle = "#f2b81c";
    c.fillRect(0, 0, 256, 64);
    c.fillStyle = "#111";
    for (let x = -64; x < 320; x += 48) {
      c.beginPath();
      c.moveTo(x, 64);
      c.lineTo(x + 24, 64);
      c.lineTo(x + 88, 0);
      c.lineTo(x + 64, 0);
      c.fill();
    }
    noise(c, 256, 64, 30, 9);
  });
}

export function concreteMap() {
  return make("concrete", 512, 512, (c) => {
    const r = rng(21);
    c.fillStyle = "#7d7a74";
    c.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 900; i++) {
      c.fillStyle = `rgba(${r() > 0.5 ? 255 : 0},${r() > 0.5 ? 255 : 0},${r() > 0.5 ? 255 : 0},0.03)`;
      const s = 4 + r() * 40;
      c.fillRect(r() * 512, r() * 512, s, s);
    }
    c.strokeStyle = "rgba(0,0,0,0.35)";
    c.lineWidth = 2;
    for (let i = 1; i < 4; i++) {
      c.beginPath();
      c.moveTo(0, i * 128);
      c.lineTo(512, i * 128);
      c.moveTo(i * 128, 0);
      c.lineTo(i * 128, 512);
      c.stroke();
    }
    c.strokeStyle = "rgba(0,0,0,0.25)";
    c.lineWidth = 1;
    for (let i = 0; i < 14; i++) {
      let x = r() * 512, y = r() * 512;
      c.beginPath();
      c.moveTo(x, y);
      for (let j = 0; j < 8; j++) {
        x += (r() - 0.5) * 40;
        y += (r() - 0.5) * 40;
        c.lineTo(x, y);
      }
      c.stroke();
    }
    noise(c, 512, 512, 26, 13);
  });
}

export function deckMap() {
  return make("deck", 256, 256, (c) => {
    c.fillStyle = "#2b313b";
    c.fillRect(0, 0, 256, 256);
    // ورق آجدار
    c.fillStyle = "rgba(255,255,255,0.07)";
    for (let y = 0; y < 256; y += 16)
      for (let x = (y / 16) % 2 ? 8 : 0; x < 256; x += 16) {
        c.save();
        c.translate(x + 4, y + 4);
        c.rotate((y / 16) % 2 ? 0.8 : -0.8);
        c.fillRect(-5, -1.5, 10, 3);
        c.restore();
      }
    noise(c, 256, 256, 14, 17);
  });
}

export function windowsMap() {
  return make("windows", 256, 256, (c) => {
    const r = rng(31);
    c.fillStyle = "#000";
    c.fillRect(0, 0, 256, 256);
    for (let y = 12; y < 256; y += 32)
      for (let x = 10; x < 256; x += 26)
        if (r() > 0.35) {
          c.fillStyle = r() > 0.7 ? "#9fe8ff" : "#ffd28a";
          c.fillRect(x, y, 14, 14);
        }
  });
}

export function wakeMap() {
  return make("wake", 128, 256, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "rgba(255,255,255,0.95)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(54, 0);
    c.lineTo(74, 0);
    c.lineTo(128, 256);
    c.lineTo(0, 256);
    c.fill();
    c.globalCompositeOperation = "destination-out";
    const r = rng(41);
    for (let i = 0; i < 300; i++) {
      c.fillStyle = `rgba(0,0,0,${r() * 0.6})`;
      c.beginPath();
      c.arc(r() * 128, r() * 256, 1 + r() * 5, 0, 7);
      c.fill();
    }
  });
}
