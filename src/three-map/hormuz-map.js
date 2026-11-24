import { RenderPacer } from '../lib/render-pacer';
import { isRenderHidden, nativeVisibilityEvent } from '../lib/native-visibility';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { terrainHeightSampler } from './terrain-surface';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import React, { useEffect, useRef, useState } from 'react';

import coastData from './coastline.json';

// === map/geo.ts ===
// Geographic projection for the Expanded Persian Gulf, Strait of Hormuz & Sea of Oman map.
// World units: K = 68 units per degree latitude. North = -Z, East = +X, Up = +Y.
const LON0 = 49.8;
const LON1 = 60.6;
const LAT0 = 23.0;
const LAT1 = 29.8;
const K = 68; // units per degree latitude
const COS = Math.cos(26.4 * Math.PI / 180);
const WIDTH = (LON1 - LON0) * COS * K;
const HEIGHT = (LAT1 - LAT0) * K;
const CLON = (LON0 + LON1) / 2;
const CLAT = (LAT0 + LAT1) / 2;
// [lat, lon]
function project(lat, lon) {
  return [(lon - CLON) * COS * K, -(lat - CLAT) * K];
}
function unproject(x, z) {
  return [-z / K + CLAT, x / (COS * K) + CLON];
}
const p = ll => project(ll[0], ll[1]);

// === map/noise.ts ===
// Compact 2D simplex noise + fbm helpers (deterministic, seeded).
const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const grad = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
function mulberry32(a) {
  return function () {
    a |= 0;
    a = a + 0x6d2b79f5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const perm = new Uint8Array(512);
(() => {
  const r = mulberry32(1404);
  const p = Array.from({
    length: 256
  }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
})();
function simplex2(xin, yin) {
  const s = (xin + yin) * F2;
  const i = Math.floor(xin + s);
  const j = Math.floor(yin + s);
  const t = (i + j) * G2;
  const x0 = xin - (i - t);
  const y0 = yin - (j - t);
  const i1 = x0 > y0 ? 1 : 0;
  const j1 = x0 > y0 ? 0 : 1;
  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2;
  const y2 = y0 - 1 + 2 * G2;
  const ii = i & 255;
  const jj = j & 255;
  let n0 = 0,
    n1 = 0,
    n2 = 0;
  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 > 0) {
    const g = grad[perm[ii + perm[jj]] & 7];
    t0 *= t0;
    n0 = t0 * t0 * (g[0] * x0 + g[1] * y0);
  }
  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 > 0) {
    const g = grad[perm[ii + i1 + perm[jj + j1]] & 7];
    t1 *= t1;
    n1 = t1 * t1 * (g[0] * x1 + g[1] * y1);
  }
  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 > 0) {
    const g = grad[perm[ii + 1 + perm[jj + 1]] & 7];
    t2 *= t2;
    n2 = t2 * t2 * (g[0] * x2 + g[1] * y2);
  }
  return 70 * (n0 + n1 + n2); // -1..1
}

function fbm(x, y, oct = 5, lac = 2.03, gain = 0.5) {
  let a = 1,
    f = 1,
    s = 0,
    n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * simplex2(x * f, y * f);
    n += a;
    a *= gain;
    f *= lac;
  }
  return s / n;
}


const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;

// === map/catalog.ts ===

const CATALOG = [{
  type: 'autocannon',
  name: 'توپخانه سریع',
  en: 'Coastal Autocannon',
  icon: '🔫',
  targets: '🚢✈️',
  range: 2.2,
  cost: '120$ · 10🏗️',
  where: 'both',
  color: '#3ee6ff'
}, {
  type: 'howitzer',
  name: 'توپخانه سنگین',
  en: 'Heavy Howitzer',
  icon: '💥',
  targets: '🚢',
  range: 2.9,
  cost: '200$ · 25🏗️',
  where: 'land',
  color: '#ff9f43'
}, {
  type: 'missile',
  name: 'سیلوی موشک کروز',
  en: 'Cruise Missile Silo',
  icon: '🚀',
  targets: '🚢',
  range: 5.2,
  cost: '350$ · 40🏗️',
  where: 'both',
  color: '#ff5e57'
}, {
  type: 'airdef',
  name: 'پدافند و لیزر',
  en: 'Air Defense & Laser',
  icon: '🛡️',
  targets: '✈️🚢',
  range: 3.6,
  cost: '300$ · 30🏗️',
  where: 'land',
  color: '#a29bfe'
}, {
  type: 'ew',
  name: 'جنگ الکترونیک',
  en: 'EW & Slow Tower',
  icon: '📡',
  targets: '🚢✈️⚓',
  range: 2.5,
  cost: '260$ · 20🏗️',
  where: 'both',
  color: '#7cf3ff'
}, {
  type: 'garrison',
  name: 'آشیانه قایق رهگیر',
  en: 'Fast Boat Garrison',
  icon: '🚤',
  targets: '🚢⚓',
  range: 1.9,
  cost: '220$ · 20🏗️',
  where: 'land',
  color: '#55efc4'
}, {
  type: 'oilrig',
  name: 'سکوی نفتی دریایی',
  en: 'Offshore Oil Rig',
  icon: '🛢️',
  targets: '—',
  range: 0,
  cost: '100$',
  where: 'sea',
  color: '#ffb627'
}, {
  type: 'seaplatform',
  name: 'سکوی دفاعی شناور',
  en: 'Sea Defense Platform',
  icon: '⚓',
  targets: '🚢✈️',
  range: 2.4,
  cost: '250$ · 30🏗️',
  where: 'sea',
  color: '#3ee6ff'
}];
const catalogOf = t => CATALOG.find(c => c.type === t);
const rangeOf = (t, tier) => catalogOf(t).range * (1 + (tier - 1) * 0.12);

// === map/features.ts ===

const PLACES = [
// Seas, Strait & Countries
{
  name: 'خلیج فارس',
  en: 'PERSIAN GULF',
  ll: [26.35, 52.35],
  tier: 0,
  kind: 'sea'
}, {
  name: 'تنگه هرمز',
  en: 'STRAIT OF HORMUZ',
  ll: [26.25, 56.45],
  tier: 0,
  kind: 'strait'
}, {
  name: 'دریای عمان',
  en: 'GULF OF OMAN',
  ll: [24.45, 58.45],
  tier: 0,
  kind: 'sea'
}, {
  name: 'ایران',
  en: 'IRAN',
  ll: [28.25, 54.80],
  tier: 0,
  kind: 'country'
}, {
  name: 'عمان · مسندم',
  en: 'OMAN · MUSANDAM',
  ll: [25.10, 56.18],
  tier: 0,
  kind: 'country'
}, {
  name: 'عمان',
  en: 'OMAN',
  ll: [23.35, 57.85],
  tier: 0,
  kind: 'country'
}, {
  name: 'امارات متحده عربی',
  en: 'U.A.E',
  ll: [23.95, 54.60],
  tier: 0,
  kind: 'country'
}, {
  name: 'قطر',
  en: 'QATAR',
  ll: [24.85, 51.25],
  tier: 0,
  kind: 'country'
}, {
  name: 'بحرین',
  en: 'BAHRAIN',
  ll: [25.55, 50.56],
  tier: 1,
  kind: 'country'
}, {
  name: 'عربستان سعودی',
  en: 'SAUDI ARABIA',
  ll: [25.60, 49.98],
  tier: 0,
  kind: 'country'
},
// All 17 Iranian Islands (Enlarged for Tactical & Mobile Tower Defense)
{
  name: 'جزیره قشم',
  en: 'QESHM',
  ll: [26.65, 55.68],
  tier: 1,
  kind: 'island'
}, {
  name: 'جزیره هرمز',
  en: 'HORMUZ',
  ll: [26.94, 56.55],
  tier: 1,
  kind: 'island'
}, {
  name: 'جزیره لارک',
  en: 'LARAK',
  ll: [26.58, 56.38],
  tier: 1,
  kind: 'island'
}, {
  name: 'جزیره هنگام',
  en: 'HENGAM',
  ll: [26.28, 55.89],
  tier: 1,
  kind: 'island'
}, {
  name: 'تنب بزرگ',
  en: 'GREATER TUNB',
  ll: [26.03, 55.33],
  tier: 1,
  kind: 'island'
}, {
  name: 'تنب کوچک',
  en: 'LESSER TUNB',
  ll: [25.98, 54.94],
  tier: 1,
  kind: 'island'
}, {
  name: 'ابوموسی',
  en: 'ABU MUSA',
  ll: [25.49, 55.02],
  tier: 1,
  kind: 'island'
}, {
  name: 'جزیره سیری',
  en: 'SIRRI',
  ll: [25.58, 54.46],
  tier: 1,
  kind: 'island'
}, {
  name: 'جزیره فارور بزرگ',
  en: 'GREATER FARUR',
  ll: [26.23, 54.47],
  tier: 1,
  kind: 'island'
}, {
  name: 'جزیره فارور کوچک',
  en: 'FARURGAN',
  ll: [25.90, 54.44],
  tier: 1,
  kind: 'island'
}, {
  name: 'جزیره کیش',
  en: 'KISH',
  ll: [26.36, 54.00],
  tier: 1,
  kind: 'island'
}, {
  name: 'جزیره هندورابی',
  en: 'HENDOURABI',
  ll: [26.56, 53.50],
  tier: 1,
  kind: 'island'
}, {
  name: 'جزیره شیدور',
  en: 'SHIDVAR',
  ll: [26.68, 53.20],
  tier: 1,
  kind: 'island'
}, {
  name: 'جزیره لاوان',
  en: 'LAVAN',
  ll: [26.82, 52.80],
  tier: 1,
  kind: 'island'
}, {
  name: 'جزیره فارسی',
  en: 'FARSI',
  ll: [27.88, 50.24],
  tier: 1,
  kind: 'island'
}, {
  name: 'جزیره خارگ',
  en: 'KHARG',
  ll: [29.14, 50.24],
  tier: 1,
  kind: 'island'
}, {
  name: 'جزیره خارگو',
  en: 'KHARKO',
  ll: [29.42, 50.40],
  tier: 1,
  kind: 'island'
},
// Iranian Southern Coast Cities & Strategic Ports (West to East)
{
  name: 'بندر گناوه',
  en: 'GANAVEH',
  ll: [29.58, 50.56],
  tier: 1,
  kind: 'city'
}, {
  name: 'بوشهر',
  en: 'BUSHEHR',
  ll: [28.92, 50.88],
  tier: 1,
  kind: 'city'
}, {
  name: 'بندر دیر',
  en: 'DAYYER',
  ll: [27.86, 51.94],
  tier: 2,
  kind: 'city'
}, {
  name: 'بندر کنگان',
  en: 'KANGAN',
  ll: [27.83, 52.08],
  tier: 1,
  kind: 'city'
}, {
  name: 'عسلویه · پارس جنوبی',
  en: 'ASSALUYEH',
  ll: [27.49, 52.62],
  tier: 1,
  kind: 'city'
}, {
  name: 'پارسیان',
  en: 'PARSIAN',
  ll: [27.18, 53.12],
  tier: 2,
  kind: 'city'
}, {
  name: 'بندر چارک',
  en: 'CHARAK',
  ll: [26.75, 54.28],
  tier: 2,
  kind: 'city'
}, {
  name: 'بندر لنگه',
  en: 'BANDAR LENGEH',
  ll: [26.58, 54.88],
  tier: 1,
  kind: 'city'
}, {
  name: 'بندر خمیر',
  en: 'KHAMIR',
  ll: [26.98, 55.59],
  tier: 2,
  kind: 'city'
}, {
  name: 'بندرعباس',
  en: 'BANDAR ABBAS',
  ll: [27.20, 56.28],
  tier: 1,
  kind: 'city'
}, {
  name: 'میناب',
  en: 'MINAB',
  ll: [27.13, 57.08],
  tier: 1,
  kind: 'city'
}, {
  name: 'سیریک',
  en: 'SIRIK',
  ll: [26.52, 57.12],
  tier: 2,
  kind: 'city'
}, {
  name: 'بندر جاسک',
  en: 'JASK',
  ll: [25.68, 57.78],
  tier: 1,
  kind: 'city'
}, {
  name: 'کنارک',
  en: 'KONARAK',
  ll: [25.38, 60.38],
  tier: 1,
  kind: 'city'
}, {
  name: 'چابهار',
  en: 'CHABAHAR',
  ll: [25.30, 60.62],
  tier: 1,
  kind: 'city'
},
// Southern Gulf & Oman Cities (Shifted Southward)
{
  name: 'دمام',
  en: 'DAMMAM',
  ll: [25.88, 50.06],
  tier: 1,
  kind: 'city'
}, {
  name: 'منامه',
  en: 'MANAMA',
  ll: [25.62, 50.56],
  tier: 2,
  kind: 'city'
}, {
  name: 'دوحه',
  en: 'DOHA',
  ll: [24.78, 51.50],
  tier: 1,
  kind: 'city'
}, {
  name: 'ابوظبی',
  en: 'ABU DHABI',
  ll: [23.88, 54.42],
  tier: 1,
  kind: 'city'
}, {
  name: 'دبی',
  en: 'DUBAI',
  ll: [24.53, 55.28],
  tier: 1,
  kind: 'city'
}, {
  name: 'رأس‌الخیمه',
  en: 'RAS AL KHAIMAH',
  ll: [25.04, 55.96],
  tier: 1,
  kind: 'city'
}, {
  name: 'خصب',
  en: 'KHASAB',
  ll: [25.44, 56.25],
  tier: 1,
  kind: 'city'
}, {
  name: 'فجیره',
  en: 'FUJAIRAH',
  ll: [24.50, 56.34],
  tier: 2,
  kind: 'city'
}, {
  name: 'صحار',
  en: 'SOHAR',
  ll: [23.82, 56.74],
  tier: 1,
  kind: 'city'
}, {
  name: 'مسقط',
  en: 'MUSCAT',
  ll: [23.42, 58.55],
  tier: 1,
  kind: 'city'
},
// Strategic POIs
{
  name: 'اسکله شهید رجایی',
  en: 'SHAHID RAJAEE PORT',
  ll: [27.11, 56.05],
  tier: 2,
  kind: 'poi'
}, {
  name: 'پالایشگاه ستاره خلیج فارس',
  en: 'REFINERY',
  ll: [27.16, 56.13],
  tier: 2,
  kind: 'poi'
}, {
  name: 'جنگل حرا',
  en: 'HARA MANGROVES',
  ll: [26.80, 55.66],
  tier: 2,
  kind: 'poi'
}, {
  name: 'شهر قشم',
  en: 'QESHM CITY',
  ll: [26.86, 56.14],
  tier: 2,
  kind: 'city'
}, {
  name: 'دماغه مسندم',
  en: 'MUSANDAM CAPE',
  ll: [25.63, 56.38],
  tier: 2,
  kind: 'poi'
}, {
  name: 'تنگه خوران',
  en: 'KHURAN STRAIT',
  ll: [26.88, 55.78],
  tier: 2,
  kind: 'poi'
}, {
  name: 'پایانه نفتی خارگ',
  en: 'KHARG OIL TERMINAL',
  ll: [29.16, 50.25],
  tier: 2,
  kind: 'poi'
}, {
  name: 'پالایشگاه لاوان',
  en: 'LAVAN REFINERY',
  ll: [26.84, 52.82],
  tier: 2,
  kind: 'poi'
}, {
  name: 'خط گمرک',
  en: 'CUSTOMS LINE',
  ll: [26.32, 56.82],
  tier: 2,
  kind: 'poi'
}];
const ZONES = [{
  id: 1,
  name: 'ساحل بندرعباس',
  sub: 'قلب دفاع · اسکله شهید رجایی',
  ll: [27.13, 56.17],
  radius: 11,
  dist: 28
}, {
  id: 2,
  name: 'جزیره هرمز و لارک',
  sub: 'گلوگاه ورودی شرقی تنگه',
  ll: [26.78, 56.48],
  radius: 13,
  dist: 32
}, {
  id: 3,
  name: 'جزیره قشم و هنگام',
  sub: 'کانال میانی و جنگل حرا',
  ll: [26.56, 55.72],
  radius: 18,
  dist: 42
}, {
  id: 4,
  name: 'تنب‌ها، ابوموسی و سیری',
  sub: 'خط مقدم دفاعی تنگه',
  ll: [25.82, 54.92],
  radius: 22,
  dist: 52
}, {
  id: 5,
  name: 'کیش، هندورابی و لاوان',
  sub: 'قطب فرماندهی و انرژی میانی',
  ll: [26.58, 53.45],
  radius: 24,
  dist: 56
}, {
  id: 6,
  name: 'عسلویه و کنگان',
  sub: 'پایتخت انرژی · پارس جنوبی',
  ll: [27.55, 52.45],
  radius: 16,
  dist: 42
}, {
  id: 7,
  name: 'خارگ، فارسی و بوشهر',
  sub: 'پایانه نفتی و شمال خلیج فارس',
  ll: [28.75, 50.45],
  radius: 26,
  dist: 62
}, {
  id: 8,
  name: 'دریای عمان و چابهار',
  sub: 'سواحل مکران · جاسک تا چابهار',
  ll: [25.45, 59.20],
  radius: 28,
  dist: 68
}];
const L = (area, list, prefix) => list.map((ll, i) => ({
  id: `${prefix}${i + 1}`,
  area,
  ll,
  kind: 'land'
}));
const S = (area, list, prefix) => list.map((ll, i) => ({
  id: `${prefix}${i + 1}`,
  area,
  ll,
  kind: 'sea'
}));
const SLOT_DEFS = [
// 17 Iranian Islands (All enlarged with generous mobile-friendly spacing)
...L('جزیره هرمز', [[26.9607, 56.6302], [27.0001, 56.5848], [27.0092, 56.5101], [26.9319, 56.4571], [26.8685, 56.5457], [26.8956, 56.6116]], 'HRZ-'), ...L('جزیره لارک', [[26.6237, 56.4767], [26.6206, 56.3387], [26.5398, 56.2911], [26.5175, 56.3836]], 'LRK-'), ...L('جزیره قشم', [[26.5394, 55.8192], [26.5526, 55.5983], [26.6374, 55.5702], [26.5364, 55.5365], [26.5184, 55.496], [26.4813, 55.4341], [26.4176, 55.4667], [26.4629, 55.545], [26.4599, 55.5744], [26.4647, 55.6094]], 'QSM-'), ...L('جزیره هنگام', [[26.3009, 55.9407], [26.3075, 55.8584], [26.2013, 55.8704]], 'HNG-'), ...L('تنب بزرگ', [[26.0467, 55.3839], [26.08, 55.3165], [26.013, 55.2722], [25.979, 55.3492]], 'TNB-'), ...L('تنب کوچک', [[26.0066, 54.9854], [26.0149, 54.8846], [25.9213, 54.9366]], 'TNK-'), ...L('ابوموسی', [[25.4982, 55.0786], [25.5452, 55.0076], [25.477, 54.9716], [25.4417, 55.0366]], 'ABM-'), ...L('جزیره سیری', [[25.6099, 54.5127], [25.6135, 54.418], [25.5335, 54.4601]], 'SIR-'), ...L('جزیره فارور بزرگ', [[26.2439, 54.5271], [26.2826, 54.431], [26.174, 54.4377]], 'FRR-'), ...L('جزیره فارور کوچک', [[25.9312, 54.4792], [25.8665, 54.3979]], 'FRG-'), ...L('جزیره کیش', [[26.3655, 54.074], [26.414, 54.0339], [26.4274, 53.9075], [26.2971, 53.9545], [26.2918, 54.0516]], 'KSH-'), ...L('جزیره هندورابی', [[26.5747, 53.5562], [26.5988, 53.4816], [26.5227, 53.4934]], 'HND-'), ...L('جزیره شیدور', [[26.6922, 53.2429], [26.6684, 53.1592]], 'SHD-'), ...L('جزیره لاوان', [[26.8402, 52.888], [26.8923, 52.7793], [26.8025, 52.724], [26.7348, 52.8244]], 'LVN-'), ...L('جزیره فارسی', [[27.9059, 50.3199], [27.9165, 50.1944], [27.8127, 50.2216]], 'FRS-'), ...L('جزیره خارگ', [[29.1682, 50.3186], [29.2182, 50.2085], [29.1069, 50.148], [29.0601, 50.2721]], 'KRG-'), ...L('جزیره خارگو', [[29.4529, 50.4358], [29.3923, 50.3699]], 'KRK-'),
// Complete Southern Iranian Mainland Coast (West to East)
...L('ساحل بندرعباس', [[27.13, 56.00], [27.15, 56.10], [27.18, 56.20], [27.19, 56.33], [27.17, 56.44], [27.14, 56.58]], 'BND-'), ...L('سواحل هرمزگان و لنگه', [[26.97, 55.55], [26.82, 55.20], [26.59, 54.88], [26.72, 54.35]], 'CST-'), ...L('عسلویه و کنگان', [[27.20, 53.08], [27.49, 52.62], [27.68, 52.34], [27.84, 52.06]], 'ASL-'), ...L('بوشهر و گناوه', [[28.18, 51.32], [28.92, 50.86], [29.28, 50.66], [29.58, 50.54]], 'BSH-'), ...L('سواحل مکران و دریای عمان', [[26.90, 56.95], [26.52, 57.10], [25.68, 57.77], [25.44, 59.18], [25.38, 60.38], [25.31, 60.62]], 'MKR-'),
// Offshore Sea Slots (Oil Rigs & Floating Defense Platforms across Persian Gulf & Sea of Oman)
...S('آب‌های عمیق میانی', [[25.95, 55.68], [26.15, 55.95], [25.80, 55.85], [25.75, 55.45], [26.18, 56.22]], 'SEA-M'), ...S('خلیج فارس میانی و پارس جنوبی', [[25.55, 53.85], [25.85, 53.35], [26.15, 52.75], [26.55, 52.15], [26.95, 51.55], [27.45, 51.05], [28.35, 50.45]], 'SEA-W'), ...S('کانال شرقی و دریای عمان', [[26.75, 56.75], [26.35, 56.82], [25.75, 57.15], [25.05, 58.15], [24.85, 59.45]], 'SEA-E'), ...S('مسیر میانی تنگه', [[26.75, 56.25], [26.45, 56.12]], 'SEA-C')];

// Enemy fleet lanes (TD paths) — routed cleanly through open water channels around enlarged islands
const ENEMY_LANES = [{
  id: 'east',
  name: 'لاین شرقی · دریای عمان و مکران',
  pts: [[24.55, 59.85], [24.85, 58.65], [25.25, 57.55], [25.85, 56.92], [26.35, 56.78], [26.75, 56.74], [26.82, 56.34], [26.98, 56.30], [27.05, 56.18], [27.08, 56.06]]
}, {
  id: 'west',
  name: 'لاین غربی · خلیج فارس',
  pts: [[28.55, 50.65], [27.85, 50.85], [27.15, 51.45], [26.35, 52.35], [25.85, 53.45], [25.75, 54.08], [25.75, 54.72], [25.80, 55.45], [26.02, 55.98], [26.42, 56.16], [26.78, 56.26], [26.98, 56.26], [27.05, 56.15], [27.08, 56.06]]
}, {
  id: 'north',
  name: 'لاین شمالی · تنگه خوران',
  pts: [[26.20, 54.78], [26.42, 54.92], [26.62, 55.14], [26.78, 55.38], [26.92, 55.58], [26.93, 55.78], [26.96, 55.94], [27.04, 56.02], [27.08, 56.06]]
}];

// International trade corridor (Traffic Separation Scheme) — spanning full Persian Gulf to Sea of Oman
const TRADE_LANES = [{
  id: 'inbound',
  pts: [[24.25, 59.95], [24.65, 58.45], [25.15, 57.35], [25.85, 56.78], [26.22, 56.55], [26.15, 56.12], [25.82, 55.65], [25.25, 55.15], [25.18, 54.35], [25.55, 53.25], [26.15, 52.15], [27.15, 51.25], [27.95, 50.68], [28.65, 50.52]]
}, {
  id: 'outbound',
  pts: [[28.55, 50.38], [27.85, 50.52], [26.95, 51.05], [25.95, 51.95], [25.30, 53.10], [25.00, 54.35], [25.06, 55.20], [25.65, 55.78], [26.00, 56.22], [26.08, 56.65], [25.65, 56.95], [24.95, 57.50], [24.40, 58.55], [24.00, 59.95]]
}];
const CUSTOMS_LINE = [[25.95, 56.72], [26.55, 56.92]];
const CITIES = [
// Iranian Coast & Islands
{
  ll: [27.20, 56.28],
  radius: 4.2,
  count: 480,
  maxH: 0.9,
  style: 'iran'
},
// Bandar Abbas
{
  ll: [27.21, 56.38],
  radius: 2.0,
  count: 140,
  maxH: 0.5,
  style: 'iran'
}, {
  ll: [26.84, 56.12],
  radius: 2.0,
  count: 160,
  maxH: 0.5,
  style: 'iran'
},
// Qeshm City
{
  ll: [26.36, 54.02],
  radius: 2.8,
  count: 240,
  maxH: 0.85,
  style: 'modern'
},
// Kish
{
  ll: [26.59, 54.88],
  radius: 1.8,
  count: 140,
  maxH: 0.45,
  style: 'iran'
},
// Bandar Lengeh
{
  ll: [27.49, 52.62],
  radius: 2.8,
  count: 220,
  maxH: 0.65,
  style: 'iran'
},
// Assaluyeh
{
  ll: [27.84, 52.08],
  radius: 2.0,
  count: 140,
  maxH: 0.45,
  style: 'iran'
},
// Kangan
{
  ll: [28.92, 50.88],
  radius: 3.2,
  count: 280,
  maxH: 0.65,
  style: 'iran'
},
// Bushehr
{
  ll: [29.58, 50.56],
  radius: 1.8,
  count: 120,
  maxH: 0.40,
  style: 'iran'
},
// Ganaveh
{
  ll: [29.14, 50.24],
  radius: 1.6,
  count: 95,
  maxH: 0.45,
  style: 'iran'
},
// Kharg
{
  ll: [26.82, 52.80],
  radius: 1.5,
  count: 80,
  maxH: 0.40,
  style: 'iran'
},
// Lavan
{
  ll: [25.68, 57.78],
  radius: 1.4,
  count: 110,
  maxH: 0.38,
  style: 'village'
},
// Jask
{
  ll: [25.38, 60.38],
  radius: 1.6,
  count: 110,
  maxH: 0.40,
  style: 'iran'
},
// Konarak
{
  ll: [25.30, 60.62],
  radius: 2.4,
  count: 180,
  maxH: 0.55,
  style: 'iran'
},
// Chabahar
{
  ll: [27.13, 57.08],
  radius: 2.2,
  count: 140,
  maxH: 0.38,
  style: 'iran'
},
// Minab
{
  ll: [26.98, 55.59],
  radius: 1.2,
  count: 70,
  maxH: 0.32,
  style: 'village'
},
// Khamir
{
  ll: [26.96, 56.56],
  radius: 1.0,
  count: 55,
  maxH: 0.28,
  style: 'village'
},
// Hormuz

// Southern Gulf & Oman Cities (Shifted Southward)
{
  ll: [24.53, 55.28],
  radius: 4.5,
  count: 420,
  maxH: 2.8,
  style: 'skyline'
},
// Dubai
{
  ll: [24.66, 55.42],
  radius: 3.0,
  count: 240,
  maxH: 1.2,
  style: 'modern'
},
// Sharjah
{
  ll: [25.04, 55.96],
  radius: 2.2,
  count: 150,
  maxH: 0.7,
  style: 'modern'
},
// Ras Al Khaimah
{
  ll: [23.88, 54.42],
  radius: 3.6,
  count: 280,
  maxH: 1.6,
  style: 'skyline'
},
// Abu Dhabi
{
  ll: [24.78, 51.50],
  radius: 3.2,
  count: 260,
  maxH: 1.8,
  style: 'skyline'
},
// Doha
{
  ll: [25.60, 50.56],
  radius: 2.0,
  count: 150,
  maxH: 1.1,
  style: 'modern'
},
// Manama
{
  ll: [25.88, 50.06],
  radius: 2.8,
  count: 200,
  maxH: 0.9,
  style: 'modern'
},
// Dammam
{
  ll: [25.44, 56.25],
  radius: 1.2,
  count: 65,
  maxH: 0.32,
  style: 'village'
},
// Khasab
{
  ll: [23.82, 56.74],
  radius: 2.0,
  count: 130,
  maxH: 0.5,
  style: 'modern'
},
// Sohar
{
  ll: [23.42, 58.55],
  radius: 3.2,
  count: 240,
  maxH: 0.75,
  style: 'modern'
} // Muscat
];

// Pre-built oil rigs & offshore fields across the Persian Gulf
const PREBUILT_RIGS = [[25.65, 54.75], [25.42, 54.25], [25.75, 53.75], [26.25, 52.35], [26.75, 51.85], [27.65, 50.85], [25.88, 55.55], [28.65, 50.35]];

// === map/terrain.ts ===

const INF = 1e20;
function edt1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}
/** Squared euclidean distance transform; grid: 0 at features, INF elsewhere. */
function edt2d(grid, w, h) {
  const n = Math.max(w, h);
  const f = new Float64Array(n),
    d = new Float64Array(n),
    z = new Float64Array(n + 1);
  const v = new Int32Array(n);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) grid[y * w + x] = d[x];
  }
}
class TerrainField {
  // world units per pixel
  // signed distance (world units), + on land
  // component index per pixel (-1 water)
  compRegion = [];
  constructor(gw = 1536) {
    this.gw = gw;
    this.gh = Math.round(gw * HEIGHT / WIDTH);
    this.px = WIDTH / gw;
    const {
      gw: W,
      gh: H
    } = this;

    // --- rasterize coastline
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d', {
      willReadFrequently: true
    });
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    const rings = coastData;
    for (const r of rings) {
      ctx.beginPath();
      r.forEach(([lon, lat], i) => {
        const [x, z] = project(lat, lon);
        const cx = (x + WIDTH / 2) / WIDTH * W;
        const cy = (z + HEIGHT / 2) / HEIGHT * H;
        if (i === 0) ctx.moveTo(cx, cy);else ctx.lineTo(cx, cy);
      });
      ctx.closePath();
      ctx.fill();
    }
    const img = ctx.getImageData(0, 0, W, H).data;
    const land = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) land[i] = img[i * 4] > 127 ? 1 : 0;

    // --- signed distance
    const gL = new Float64Array(W * H),
      gW = new Float64Array(W * H);
    for (let i = 0; i < W * H; i++) {
      gL[i] = land[i] ? INF : 0; // distance from land px to water
      gW[i] = land[i] ? 0 : INF; // distance from water px to land
    }

    edt2d(gL, W, H);
    edt2d(gW, W, H);
    this.sd = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        let d = land[i] ? Math.sqrt(gL[i]) - 0.5 : -(Math.sqrt(gW[i]) - 0.5);
        d *= this.px;
        // organic coastline perturbation
        if (Math.abs(d) < 2.2) {
          const wx = x / W * WIDTH,
            wz = y / H * HEIGHT;
          d += fbm(wx * 0.55, wz * 0.55, 3) * 0.32 * (1 - smoothstep(0.8, 2.2, Math.abs(d)));
        }
        this.sd[i] = d;
      }
    }

    // --- connected components of land
    this.comp = new Int32Array(W * H).fill(-1);
    const stack = new Int32Array(W * H);
    let nc = 0;
    for (let i = 0; i < W * H; i++) {
      if (this.sd[i] <= 0 || this.comp[i] >= 0) continue;
      let sp = 0,
        size = 0,
        sy = 0,
        sx = 0;
      stack[sp++] = i;
      this.comp[i] = nc;
      while (sp) {
        const c = stack[--sp];
        size++;
        sy += c / W | 0;
        const cx = c % W;
        sx += cx;
        const nb = [c - 1, c + 1, c - W, c + W];
        for (let k = 0; k < 4; k++) {
          const nIdx = nb[k];
          if (nIdx < 0 || nIdx >= W * H) continue;
          if (k === 0 && cx === 0 || k === 1 && cx === W - 1) continue;
          if (this.sd[nIdx] > 0 && this.comp[nIdx] < 0) {
            this.comp[nIdx] = nc;
            stack[sp++] = nIdx;
          }
        }
      }
      const cyWorld = sy / size / H * HEIGHT - HEIGHT / 2;
      const cxWorld = sx / size / W * WIDTH - WIDTH / 2;
      const [lat, lon] = unproject(cxWorld, cyWorld);
      this.compRegion[nc] = size > 40000 ? lat > 26.2 ? 'iran' : 'arabia' : lon < 50.85 && lat < 26.0 ? 'arabia' : 'island';
      nc++;
    }

    // --- texture for water shader (R coarse ±16, G fine ±2)
    const tex = new Uint8Array(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      const d = this.sd[i];
      tex[i * 4] = Math.round(clamp(d / 16 * 0.5 + 0.5, 0, 1) * 255);
      tex[i * 4 + 1] = Math.round(clamp(d / 2 * 0.5 + 0.5, 0, 1) * 255);
      tex[i * 4 + 2] = 0;
      tex[i * 4 + 3] = 255;
    }
    this.sdTexture = new THREE.DataTexture(tex, W, H, THREE.RGBAFormat);
    this.sdTexture.magFilter = THREE.LinearFilter;
    this.sdTexture.minFilter = THREE.LinearFilter;
    this.sdTexture.flipY = false;
    this.sdTexture.needsUpdate = true;
  }
  toPix(x, z) {
    return [(x + WIDTH / 2) / WIDTH * this.gw - 0.5, (z + HEIGHT / 2) / HEIGHT * this.gh - 0.5];
  }
  sample(x, z) {
    const [fx, fy] = this.toPix(x, z);
    const x0 = clamp(Math.floor(fx), 0, this.gw - 2),
      y0 = clamp(Math.floor(fy), 0, this.gh - 2);
    const tx = clamp(fx - x0, 0, 1),
      ty = clamp(fy - y0, 0, 1);
    const i = y0 * this.gw + x0;
    const s = this.sd;
    return (s[i] * (1 - tx) + s[i + 1] * tx) * (1 - ty) + (s[i + this.gw] * (1 - tx) + s[i + this.gw + 1] * tx) * ty;
  }
  region(x, z) {
    const [fx, fy] = this.toPix(x, z);
    const i = clamp(Math.round(fy), 0, this.gh - 1) * this.gw + clamp(Math.round(fx), 0, this.gw - 1);
    const c = this.comp[i];
    return c < 0 ? 'sea' : this.compRegion[c];
  }

  height(x, z) {
    return this.surfaceHeight(x, z) ?? -0.12;
  }
  isLand(x, z) {
    return this.sample(x, z) > 0;
  }

  /** Snap to nearest pixel matching criteria (land: coastal band; sea: deep enough water). */
  snap(x, z, kind, range = 16) {
    const curSd = this.sample(x, z);
    if (kind === 'land' && curSd > 0.38 && curSd < 6.5) return [x, z];
    if (kind === 'sea' && curSd < -1.3) return [x, z];
    const [fx, fy] = this.toPix(x, z);
    const cx = Math.round(fx),
      cy = Math.round(fy);
    let best = null;
    let bd = Infinity;
    for (let dy = -range; dy <= range; dy++) {
      for (let dx = -range; dx <= range; dx++) {
        const px = cx + dx,
          py = cy + dy;
        if (px < 0 || py < 0 || px >= this.gw || py >= this.gh) continue;
        const s = this.sd[py * this.gw + px];
        const ok = kind === 'land' ? s > 0.42 && s < 3.2 : s < -1.4;
        if (!ok) continue;
        const dd = dx * dx + dy * dy;
        if (dd < bd) {
          bd = dd;
          best = [px, py];
        }
      }
    }
    if (!best) return [x, z];
    return [(best[0] + 0.5) / this.gw * WIDTH - WIDTH / 2, (best[1] + 0.5) / this.gh * HEIGHT - HEIGHT / 2];
  }
}

// Keep one ocean surface. The authored color and detail UVs travel with the
// GLB while the existing water shader supplies waves, weather and coastal foam.
function animateOcean(ocean, field) {
  const authored = ocean.material;
  ocean.geometry.setAttribute('waterDetailUv', ocean.geometry.getAttribute('uv1'));
  const uniforms = {
    uOceanColor: { value: authored.map },
    uOceanNormal: { value: authored.normalMap },
    uSd: {
      value: field.sdTexture
    },
    uTime: {
      value: 0
    },
    uSunDir: {
      value: new THREE.Vector3(0.5, 0.8, 0.3).normalize()
    },
    uSunColor: {
      value: new THREE.Color('#fff4dc')
    },
    uSky: {
      value: new THREE.Color('#8ec5e8')
    },
    uNight: {
      value: 0
    },
    uStorm: {
      value: 0
    },
    uFogColor: {
      value: new THREE.Color('#0b1a2a')
    },
    uFogDensity: {
      value: 0.0016
    }
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      attribute vec2 waterDetailUv; varying vec2 vDetail; varying vec2 vUv; varying vec3 vWorld;
      void main(){ vDetail = waterDetailUv; vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D uOceanColor; uniform sampler2D uOceanNormal; varying vec2 vDetail;
      uniform sampler2D uSd; uniform float uTime; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uSky;
      uniform float uNight; uniform float uStorm; uniform vec3 uFogColor; uniform float uFogDensity;
      varying vec2 vUv; varying vec3 vWorld;
      float sdAt(vec2 uv){ vec4 t = texture2D(uSd, uv); float c = (t.r*2.0-1.0)*16.0; float f = (t.g*2.0-1.0)*2.0; return abs(f) < 1.9 ? f : c; }
      float hash(vec2 p){ p = mod(p, 289.0); vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
      vec2 waveGrad(vec2 p, float t){
        vec2 g = vec2(0.0);
        vec2 d1 = normalize(vec2(1.0,0.35)); vec2 d2 = normalize(vec2(-0.4,1.0)); vec2 d3 = normalize(vec2(0.8,-0.7)); vec2 d4 = normalize(vec2(-1.0,-0.2));
        g += d1 * cos(dot(p,d1)*2.3 + t*1.7) * 0.5;
        g += d2 * cos(dot(p,d2)*3.7 + t*2.2) * 0.35;
        g += d3 * cos(dot(p,d3)*6.1 + t*2.9) * 0.22;
        g += d4 * cos(dot(p,d4)*9.3 + t*3.6) * 0.14;
        return g;
      }
      void main(){
        vec2 worldUv = vWorld.xz / vec2(${WIDTH}, ${HEIGHT}) + 0.5;
        float sd = sdAt(worldUv);
        vec3 V = normalize(cameraPosition - vWorld);
        float camD = length(cameraPosition - vWorld);
        float near = 1.0 - smoothstep(25.0, 160.0, camD);
        vec2 g = waveGrad(vWorld.xz, uTime) * (0.10 + 0.25*uStorm) * near;
        g += (vec2(vnoise(vWorld.xz*0.08 + uTime*0.03), vnoise(vWorld.xz*0.08 - uTime*0.03 + 9.0)) - 0.5) * 0.07;
        g += (texture2D(uOceanNormal, vDetail + vec2(uTime * 0.008, -uTime * 0.004)).rg * 2.0 - 1.0) * near * 0.16;
        vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
        float depth = clamp(-sd / 14.0, 0.0, 1.0);
        vec3 deep = vec3(0.025,0.17,0.30);
        vec3 mid = vec3(0.05,0.36,0.52);
        vec3 shallow = vec3(0.20,0.72,0.74);
        vec3 lagoon = vec3(0.50,0.84,0.76);
        vec3 col = mix(shallow, mid, smoothstep(0.0,0.25,depth));
        col = mix(col, deep, smoothstep(0.2,1.0,depth));
        col = mix(col, lagoon, smoothstep(-0.9, 0.0, sd) * 0.8);
        col = mix(col, sRGBTransferOETF(texture2D(uOceanColor, vUv)).rgb, 0.72);
        // caustic-like variation in shallow water
        float caus = vnoise(vWorld.xz*1.6 + vec2(uTime*0.4, -uTime*0.3)) * vnoise(vWorld.xz*1.9 - uTime*0.25);
        col += vec3(0.10,0.16,0.14) * caus * (1.0 - smoothstep(0.0, 0.25, depth)) * near;
        // lighting
        vec3 L = normalize(uSunDir);
        float diff = clamp(dot(N, L), 0.0, 1.0);
        col *= 0.65 + 0.45*diff;
        float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 4.0);
        col = mix(col, uSky, fres * 0.55);
        vec3 H = normalize(L + V);
        float spec = pow(clamp(dot(N,H),0.0,1.0), 180.0) * 1.4 + pow(clamp(dot(N,H),0.0,1.0), 30.0)*0.12;
        col += uSunColor * spec * (1.0 - uStorm*0.8);
        // shoreline foam
        float fn = vnoise(vWorld.xz*3.0 + uTime*0.5);
        float foamLine = smoothstep(-0.28, -0.02, sd);
        float band = smoothstep(0.6, 1.0, sin(sd*9.0 + uTime*1.8 + fn*3.0)) * smoothstep(-1.4, -0.2, sd) * near;
        float foam = clamp(foamLine*0.85 + band*0.45*fn, 0.0, 1.0);
        col = mix(col, vec3(0.96,0.98,1.0) * (0.55 + 0.45*diff), foam);
        // whitecaps in storm
        col += vec3(0.6) * smoothstep(0.82, 0.95, vnoise(vWorld.xz*2.2 + uTime*1.2)) * uStorm * near;
        // night
        col = mix(col, col * vec3(0.2,0.26,0.42) + vec3(0.0,0.015,0.04), uNight);
        col = mix(col, col * 0.55 + vec3(0.03,0.05,0.07), uStorm * 0.5);
        // map border fade
        float e = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
        col = mix(uFogColor * 1.2, col, smoothstep(0.0, 0.025, e));
        float fogF = 1.0 - exp(-uFogDensity*uFogDensity*camD*camD);
        col = mix(col, uFogColor, clamp(fogF, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  ocean.material = mat;
  authored.dispose();
  return uniforms;
}

// === map/models.ts ===

const M = {
  concrete: new THREE.MeshStandardMaterial({
    color: '#a7aeb2',
    roughness: 0.9
  }),
  concreteDark: new THREE.MeshStandardMaterial({
    color: '#6f777c',
    roughness: 0.9
  }),
  metal: new THREE.MeshStandardMaterial({
    color: '#3b434a',
    roughness: 0.5,
    metalness: 0.6
  }),
  steel: new THREE.MeshStandardMaterial({
    color: '#8d969d',
    roughness: 0.45,
    metalness: 0.7
  }),
  white: new THREE.MeshStandardMaterial({
    color: '#eef1f3',
    roughness: 0.6
  }),
  red: new THREE.MeshStandardMaterial({
    color: '#c0392b',
    roughness: 0.6
  }),
  yellow: new THREE.MeshStandardMaterial({
    color: '#e7b416',
    roughness: 0.6
  }),
  orange: new THREE.MeshStandardMaterial({
    color: '#e0662a',
    roughness: 0.6
  }),
  blue: new THREE.MeshStandardMaterial({
    color: '#2a6fb0',
    roughness: 0.6
  }),
  green: new THREE.MeshStandardMaterial({
    color: '#2f8f5b',
    roughness: 0.6
  }),
  black: new THREE.MeshStandardMaterial({
    color: '#1d2125',
    roughness: 0.7
  }),
  hullRed: new THREE.MeshStandardMaterial({
    color: '#8e2a22',
    roughness: 0.7
  }),
  wood: new THREE.MeshStandardMaterial({
    color: '#8a5a32',
    roughness: 0.9
  }),
  sail: new THREE.MeshStandardMaterial({
    color: '#f1e6cf',
    roughness: 0.9,
    side: THREE.DoubleSide
  }),
  sandbag: new THREE.MeshStandardMaterial({
    color: '#b8a274',
    roughness: 1
  }),
  glowCyan: new THREE.MeshStandardMaterial({
    color: '#0b3b44',
    emissive: '#22e3ff',
    emissiveIntensity: 1.6
  }),
  glowRed: new THREE.MeshStandardMaterial({
    color: '#400',
    emissive: '#ff3b2f',
    emissiveIntensity: 2
  }),
  glowGold: new THREE.MeshStandardMaterial({
    color: '#4a3500',
    emissive: '#ffc53d',
    emissiveIntensity: 1.4
  }),
  lamp: new THREE.MeshStandardMaterial({
    color: '#333',
    emissive: '#ffe6a8',
    emissiveIntensity: 0
  }),
  enemy: new THREE.MeshStandardMaterial({
    color: '#4a1414',
    emissive: '#ff2a1a',
    emissiveIntensity: 0.6,
    roughness: 0.5
  }),
  wire: new THREE.MeshBasicMaterial({
    color: '#c94b2b',
    wireframe: true
  }),
  wireSteel: new THREE.MeshBasicMaterial({
    color: '#9aa5ad',
    wireframe: true
  })
};
const MATS = M;
const TIER_MAT = [new THREE.MeshStandardMaterial({
  color: '#66734a',
  roughness: 0.75
}), new THREE.MeshStandardMaterial({
  color: '#8f8a7a',
  roughness: 0.55,
  metalness: 0.3
}), new THREE.MeshStandardMaterial({
  color: '#2b3a4a',
  roughness: 0.35,
  metalness: 0.6
})];

// ----------------------------------------------------------- helpers
function mesh(g, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  return o;
}
const box = (w, h, d, m, x = 0, y = 0, z = 0) => mesh(new THREE.BoxGeometry(w, h, d), m, x, y + h / 2, z);
const cyl = (rt, rb, h, m, x = 0, y = 0, z = 0, seg = 12) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y + h / 2, z);
function canvasTex(size, draw) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  draw(cv.getContext('2d'), size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const TEX = {
  glow: canvasTex(128, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
  }),
  flame: canvasTex(128, (c, s) => {
    const g = c.createRadialGradient(s / 2, s * 0.62, 2, s / 2, s * 0.55, s / 2);
    g.addColorStop(0, 'rgba(255,255,220,1)');
    g.addColorStop(0.2, 'rgba(255,200,60,0.95)');
    g.addColorStop(0.5, 'rgba(255,90,20,0.6)');
    g.addColorStop(1, 'rgba(120,20,0,0)');
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(s / 2, s * 0.55, s * 0.32, s * 0.45, 0, 0, Math.PI * 2);
    c.fill();
  }),
  cloud: canvasTex(256, (c, s) => {
    for (let i = 0; i < 22; i++) {
      const x = s * (0.2 + Math.random() * 0.6),
        y = s * (0.35 + Math.random() * 0.3),
        r = s * (0.08 + Math.random() * 0.16);
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, s, s);
    }
  }),
  shield: canvasTex(128, (c, s) => {
    c.translate(s / 2, s / 2);
    c.beginPath();
    c.arc(0, 0, s * 0.46, 0, Math.PI * 2);
    c.fillStyle = 'rgba(8,24,36,0.85)';
    c.fill();
    c.lineWidth = 6;
    c.strokeStyle = '#3ee6ff';
    c.stroke();
    c.beginPath();
    c.moveTo(0, -s * 0.28);
    c.lineTo(s * 0.22, -s * 0.18);
    c.quadraticCurveTo(s * 0.22, s * 0.16, 0, s * 0.3);
    c.quadraticCurveTo(-s * 0.22, s * 0.16, -s * 0.22, -s * 0.18);
    c.closePath();
    c.fillStyle = '#3ee6ff';
    c.fill();
    c.fillStyle = 'rgba(8,24,36,1)';
    c.fillRect(-s * 0.035, -s * 0.15, s * 0.07, s * 0.3);
    c.fillRect(-s * 0.13, -s * 0.035, s * 0.26, s * 0.07);
  }),
  rig: canvasTex(128, (c, s) => {
    c.translate(s / 2, s / 2);
    c.beginPath();
    c.arc(0, 0, s * 0.46, 0, Math.PI * 2);
    c.fillStyle = 'rgba(30,20,6,0.85)';
    c.fill();
    c.lineWidth = 6;
    c.strokeStyle = '#ffb627';
    c.stroke();
    c.fillStyle = '#ffb627';
    c.beginPath();
    c.moveTo(0, -s * 0.3);
    c.lineTo(s * 0.16, s * 0.22);
    c.lineTo(-s * 0.16, s * 0.22);
    c.closePath();
    c.fill();
    c.fillStyle = 'rgba(30,20,6,1)';
    c.fillRect(-s * 0.1, -s * 0.02, s * 0.2, s * 0.05);
    c.fillRect(-s * 0.13, s * 0.1, s * 0.26, s * 0.05);
  }),
  skull: canvasTex(128, (c, s) => {
    c.translate(s / 2, s / 2);
    c.beginPath();
    c.arc(0, 0, s * 0.46, 0, Math.PI * 2);
    c.fillStyle = 'rgba(60,0,0,0.9)';
    c.fill();
    c.lineWidth = 6;
    c.strokeStyle = '#ff4136';
    c.stroke();
    c.fillStyle = '#ffdddd';
    c.beginPath();
    c.arc(0, -s * 0.05, s * 0.22, 0, Math.PI * 2);
    c.fill();
    c.fillRect(-s * 0.12, s * 0.1, s * 0.24, s * 0.14);
    c.fillStyle = 'rgba(60,0,0,1)';
    c.beginPath();
    c.arc(-s * 0.09, -s * 0.05, s * 0.06, 0, Math.PI * 2);
    c.arc(s * 0.09, -s * 0.05, s * 0.06, 0, Math.PI * 2);
    c.fill();
  }),
  windows: (() => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const c = cv.getContext('2d');
    c.fillStyle = '#000';
    c.fillRect(0, 0, 64, 64);
    for (let y = 2; y < 64; y += 8) for (let x = 2; x < 64; x += 8) {
      if (Math.random() < 0.55) {
        c.fillStyle = Math.random() < 0.8 ? '#ffd88a' : '#bfe6ff';
        c.fillRect(x, y, 4, 4);
      }
    }
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })()
};
function glowSprite(color, size, opacity = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: TEX.glow,
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }));
  s.scale.setScalar(size);
  return s;
}
function flame(size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: TEX.flame,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }));
  s.scale.set(size * 0.7, size, 1);
  s.userData.flicker = size;
  return s;
}

/** Night searchlight beam (visible only at night). */
function searchlight(len = 1.6) {
  const g = new THREE.Group();
  const geo = new THREE.ConeGeometry(0.28, len, 16, 1, true);
  geo.translate(0, -len / 2, 0);
  geo.rotateX(-Math.PI / 2 - 0.35);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: '#fff3c4',
    transparent: true,
    opacity: 0.1,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  }));
  g.add(m);
  g.userData.night = true;
  g.userData.spin = 0.4 + Math.random() * 0.4;
  g.visible = false;
  return g;
}
function nightLamp(x, y, z, color = '#ffd27a', size = 0.18) {
  const s = glowSprite(color, size, 0.9);
  s.position.set(x, y, z);
  s.userData.night = true;
  s.visible = false;
  return s;
}

// ----------------------------------------------------------- pad (tower slot)
function buildPad(kind) {
  const g = new THREE.Group();
  if (kind === 'land') {
    g.add(cyl(0.34, 0.38, 0.05, M.concreteDark, 0, 0, 0, 6));
    g.add(cyl(0.3, 0.3, 0.012, M.concrete, 0, 0.05, 0, 6));
  } else {
    // floating platform base
    for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) g.add(cyl(0.03, 0.035, 0.32, M.yellow, x, -0.1, z, 6));
    g.add(box(0.56, 0.05, 0.56, M.steel, 0, 0.18, 0));
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.42, 6), new THREE.MeshBasicMaterial({
    color: kind === 'land' ? '#3ee6ff' : '#ffb627',
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    depthWrite: false
  }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = kind === 'land' ? 0.07 : 0.24;
  ring.userData.pulse = true;
  g.add(ring);
  g.userData.ring = ring;
  g.userData.top = kind === 'land' ? 0.062 : 0.23;
  return g;
}

// ----------------------------------------------------------- towers
function buildTower(type, tier) {
  const g = new THREE.Group();
  const T = TIER_MAT[tier - 1];
  const turret = new THREE.Group();
  turret.userData.aim = true;
  switch (type) {
    case 'autocannon':
      {
        g.add(cyl(0.14, 0.17, 0.07, M.concreteDark));
        turret.position.y = 0.07;
        turret.add(cyl(0.09, 0.11, 0.06, T));
        turret.add(box(0.16, 0.08, 0.14, T, 0, 0.06, -0.01));
        const barrels = tier === 3 ? 6 : tier === 2 ? 3 : 2;
        for (let i = 0; i < barrels; i++) {
          const a = i / barrels * Math.PI * 2;
          const b = mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.24, 6), M.metal, Math.cos(a) * 0.022, 0.1 + Math.sin(a) * 0.022, 0.16);
          b.rotation.x = Math.PI / 2;
          turret.add(b);
        }
        if (tier >= 2) turret.add(box(0.05, 0.05, 0.05, M.metal, 0.09, 0.08, -0.03));
        if (tier === 3) turret.add(mesh(new THREE.SphereGeometry(0.06, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.white, 0, 0.14, -0.03));
        break;
      }
    case 'howitzer':
      {
        g.add(cyl(0.18, 0.21, 0.07, M.concreteDark, 0, 0, 0, 8));
        turret.position.y = 0.07;
        turret.add(cyl(0.12, 0.13, 0.05, T, 0, 0, 0, 8));
        turret.add(box(0.2, 0.1, 0.22, T, 0, 0.05, -0.02));
        const len = 0.3 + tier * 0.05;
        const b = mesh(new THREE.CylinderGeometry(0.016 + tier * 0.002, 0.022 + tier * 0.002, len, 8), M.metal, 0, 0.13, 0.1 + len / 2 - 0.05);
        b.rotation.x = Math.PI / 2 - 0.3;
        b.position.y = 0.11 + Math.sin(0.3) * len * 0.4;
        turret.add(b);
        turret.add(box(0.04, 0.03, 0.04, M.metal, 0, 0.11 + Math.sin(0.3) * len * 0.85, 0.08 + len * 0.82));
        if (tier >= 2) for (let i = -1; i <= 1; i += 2) turret.add(box(0.02, 0.06, 0.18, M.metal, i * 0.11, 0.05, -0.02));
        if (tier === 3) turret.add(box(0.21, 0.015, 0.2, M.glowGold, 0, 0.15, -0.02));
        break;
      }
    case 'missile':
      {
        g.add(box(0.34, 0.06, 0.3, M.concrete));
        g.add(box(0.3, 0.04, 0.26, T, 0, 0.06, 0));
        turret.position.y = 0.1;
        const n = tier === 1 ? 1 : tier === 2 ? 2 : 4;
        for (let i = 0; i < n; i++) {
          const x = (i - (n - 1) / 2) * 0.07;
          const rail = new THREE.Group();
          rail.position.set(x, 0, -0.06);
          rail.rotation.x = -0.9;
          rail.add(box(0.05, 0.3, 0.05, M.metal, 0, 0, 0));
          const msl = new THREE.Group();
          msl.add(cyl(0.017, 0.017, 0.24, M.white, 0, 0.02, 0.035, 8));
          msl.add(mesh(new THREE.ConeGeometry(0.017, 0.06, 8), tier === 3 ? M.glowGold : M.red, 0, 0.29, 0.035));
          rail.add(msl);
          turret.add(rail);
        }
        g.add(box(0.06, 0.06, 0.06, M.concreteDark, 0.12, 0.06, 0.1));
        break;
      }
    case 'airdef':
      {
        g.add(cyl(0.16, 0.18, 0.05, M.concreteDark, 0, 0, 0, 10));
        turret.position.y = 0.05;
        turret.add(cyl(0.08, 0.09, 0.04, T));
        const launcher = new THREE.Group();
        launcher.position.set(0, 0.07, -0.02);
        launcher.rotation.x = -0.75;
        const cols = tier === 1 ? 2 : tier === 2 ? 3 : 4;
        for (let r = 0; r < 2; r++) for (let c = 0; c < cols; c++) launcher.add(box(0.045, 0.24, 0.045, T, (c - (cols - 1) / 2) * 0.05, 0, r * 0.05));
        turret.add(launcher);
        const radar = new THREE.Group();
        radar.position.set(0.12, 0.05, 0.1);
        radar.userData.spin = 2.2;
        radar.add(cyl(0.008, 0.008, 0.12, M.metal, 0, 0, 0, 6));
        const dish = mesh(new THREE.BoxGeometry(0.12, 0.06, 0.012), tier === 3 ? M.glowCyan : M.white, 0, 0.14, 0);
        radar.add(dish);
        g.add(radar);
        break;
      }
    case 'ew':
      {
        g.add(cyl(0.14, 0.17, 0.05, M.concreteDark, 0, 0, 0, 8));
        const h = 0.4 + tier * 0.08;
        const mast = mesh(new THREE.CylinderGeometry(0.03, 0.08, h, 4, 4, true), M.wireSteel, 0, 0.05 + h / 2, 0);
        g.add(mast);
        g.add(cyl(0.012, 0.012, h, M.metal, 0, 0.05, 0, 6));
        const top = new THREE.Group();
        top.position.y = 0.05 + h;
        top.userData.spin = 1.4;
        top.add(box(0.34, 0.07, 0.02, M.white, 0, 0, 0));
        top.add(box(0.36, 0.01, 0.022, tier === 3 ? M.glowCyan : M.metal, 0, 0.07, 0));
        g.add(top);
        for (let i = 0; i < tier; i++) {
          const d = mesh(new THREE.SphereGeometry(0.035, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.white, Math.cos(i * 2.1) * 0.05, 0.12 + i * 0.1, Math.sin(i * 2.1) * 0.05);
          d.rotation.z = Math.PI / 2;
          g.add(d);
        }
        // EW pulse
        const pulse = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.24, 32), new THREE.MeshBasicMaterial({
          color: '#7cf3ff',
          transparent: true,
          opacity: 0.6,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        }));
        pulse.rotation.x = -Math.PI / 2;
        pulse.position.y = 0.06;
        pulse.userData.ewPulse = true;
        g.add(pulse);
        break;
      }
    case 'garrison':
      {
        g.add(box(0.36, 0.04, 0.3, M.concrete));
        const hangar = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.24, 12, 1, false, 0, Math.PI), T, -0.06, 0.04, 0);
        hangar.rotation.z = Math.PI / 2;
        hangar.rotation.y = Math.PI / 2;
        hangar.position.y = 0.04;
        g.add(hangar);
        const n = tier === 1 ? 3 : tier === 2 ? 4 : 5;
        for (let i = 0; i < n; i++) {
          const b = speedboat(tier === 3 ? M.glowCyan : M.metal);
          b.scale.setScalar(0.6);
          b.position.set(0.11, 0.045, (i - (n - 1) / 2) * 0.06);
          b.rotation.y = Math.PI / 2;
          g.add(b);
        }
        g.add(box(0.04, 0.14, 0.04, M.metal, 0.14, 0.04, -0.12));
        break;
      }
  }
  g.add(turret);
  turret.rotation.y = Math.random() * Math.PI * 2;
  if (tier >= 2) {
    // sandbag / armor ring
    const ring = mesh(new THREE.TorusGeometry(0.22, 0.022, 4, 16), tier === 3 ? M.metal : M.sandbag, 0, 0.02, 0);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
  }
  if (tier === 3) {
    g.add(box(0.012, 0.22, 0.012, M.metal, -0.2, 0, -0.2));
    const flag = box(0.1, 0.06, 0.004, M.glowGold, -0.15, 0.16, -0.2);
    g.add(flag);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      g.add(box(0.03, 0.01, 0.03, M.glowCyan, Math.cos(a) * 0.24, 0.0, Math.sin(a) * 0.24));
    }
  }
  const sl = searchlight();
  sl.position.y = 0.25;
  g.add(sl);
  g.add(nightLamp(0, 0.35, 0, '#ff4a3a', 0.12));
  g.scale.setScalar([1, 1.12, 1.25][tier - 1]);
  return g;
}

// ----------------------------------------------------------- offshore
function buildOilRig(level = 1) {
  const g = new THREE.Group();
  for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) {
    g.add(cyl(0.028, 0.04, 0.36, M.yellow, x, -0.1, z, 8));
  }
  const brace = mesh(new THREE.BoxGeometry(0.4, 0.38, 0.4), M.wire, 0, 0.08, 0);
  g.add(brace);
  g.add(box(0.5, 0.05, 0.46, M.steel, 0, 0.26, 0));
  g.add(box(0.36, 0.05, 0.3, M.metal, 0.04, 0.38, -0.03));
  g.add(box(0.2, 0.12, 0.16, M.white, -0.13, 0.31, 0.12));
  g.add(box(0.12, 0.08, 0.12, M.orange, 0.15, 0.31, 0.12));
  // derrick
  const der = mesh(new THREE.CylinderGeometry(0.02, 0.1, 0.6, 4, 5, true), M.wire, 0.06, 0.73, -0.06);
  g.add(der);
  g.add(box(0.06, 0.04, 0.06, M.red, 0.06, 1.02, -0.06));
  // helipad
  const hp = cyl(0.12, 0.12, 0.012, M.green, -0.15, 0.31 + 0.12, 0.12, 16);
  g.add(hp);
  // flare boom
  const boom = mesh(new THREE.CylinderGeometry(0.01, 0.014, 0.6, 6), M.steel, 0.42, 0.42, 0);
  boom.rotation.z = -1.05;
  g.add(boom);
  const fl = flame(0.32 + level * 0.06);
  fl.position.set(0.68, 0.6, 0);
  g.add(fl);
  const fglow = glowSprite('#ff8a2a', 0.9, 0.55);
  fglow.position.copy(fl.position);
  fglow.userData.flicker = 0.9;
  fglow.userData.glow = true;
  g.add(fglow);
  // crane
  const crane = new THREE.Group();
  crane.position.set(-0.2, 0.42, -0.15);
  crane.add(cyl(0.02, 0.025, 0.12, M.yellow, 0, 0, 0, 6));
  const arm = box(0.35, 0.02, 0.02, M.yellow, 0.16, 0.1, 0);
  arm.rotation.z = 0.35;
  crane.add(arm);
  crane.userData.spin = 0.15;
  g.add(crane);
  g.add(nightLamp(0.06, 1.05, -0.06, '#ff3b2f', 0.15));
  g.add(nightLamp(-0.2, 0.45, 0.2, '#fff1c1', 0.3));
  g.add(nightLamp(0.2, 0.45, -0.2, '#fff1c1', 0.3));
  if (level >= 2) {
    g.add(box(0.3, 0.04, 0.2, M.steel, 0.35, 0.26, 0.25));
    g.add(cyl(0.05, 0.05, 0.12, M.white, 0.35, 0.3, 0.25, 10));
  }
  return g;
}
function buildSeaPlatform() {
  const g = new THREE.Group();
  const t = buildTower('autocannon', 2);
  t.position.y = 0.23;
  g.add(t);
  g.add(box(0.06, 0.18, 0.06, M.metal, -0.2, 0.23, -0.2));
  return g;
}

// ----------------------------------------------------------- ships
function speedboat(mat = M.metal) {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-0.04, -0.08);
  shape.lineTo(0.04, -0.08);
  shape.lineTo(0.04, 0.04);
  shape.lineTo(0, 0.1);
  shape.lineTo(-0.04, 0.04);
  shape.closePath();
  const hull = new THREE.ExtrudeGeometry(shape, {
    depth: 0.025,
    bevelEnabled: false
  });
  hull.rotateX(Math.PI / 2);
  hull.translate(0, 0.025, 0);
  g.add(mesh(hull, mat));
  g.add(box(0.04, 0.02, 0.04, M.white, 0, 0.025, -0.01));
  return g;
}
function hullGeo(len, w, h) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, -len / 2);
  s.lineTo(w / 2, -len / 2);
  s.lineTo(w / 2, len * 0.3);
  s.quadraticCurveTo(w / 2, len * 0.45, 0, len / 2);
  s.quadraticCurveTo(-w / 2, len * 0.45, -w / 2, len * 0.3);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {
    depth: h,
    bevelEnabled: false
  });
  g.rotateX(Math.PI / 2);
  g.translate(0, h, 0);
  return g;
}
function buildShip(kind) {
  const g = new THREE.Group();
  if (kind === 'tanker') {
    g.add(mesh(hullGeo(1.3, 0.24, 0.07), M.hullRed));
    g.add(mesh(hullGeo(1.3, 0.24, 0.05), M.black, 0, 0.06, 0));
    g.add(box(0.03, 0.02, 0.9, M.steel, 0, 0.11, 0.08));
    g.add(box(0.2, 0.16, 0.14, M.white, 0, 0.11, -0.52));
    g.add(box(0.05, 0.08, 0.05, M.red, 0, 0.27, -0.55));
    g.add(nightLamp(0, 0.3, -0.52, '#ffe9b0', 0.2));
    g.add(nightLamp(0, 0.14, 0.62, '#4dff7a', 0.12));
  } else if (kind === 'container' || kind === 'bulk') {
    g.add(mesh(hullGeo(1.2, 0.22, 0.08), kind === 'bulk' ? M.blue : M.black));
    g.add(box(0.18, 0.18, 0.12, M.white, 0, 0.08, -0.48));
    const cols = [M.red, M.blue, M.orange, M.green, M.yellow, M.steel];
    if (kind === 'container') {
      for (let i = 0; i < 7; i++) for (let j = 0; j < 2; j++) g.add(box(0.2, 0.05 + Math.random() * 0.06, 0.1, cols[(i * 3 + j) % 6], 0, 0.08 + j * 0.0, -0.32 + i * 0.12));
    } else {
      for (let i = 0; i < 5; i++) g.add(box(0.16, 0.03, 0.14, M.metal, 0, 0.08, -0.3 + i * 0.16));
    }
    g.add(nightLamp(0, 0.28, -0.48, '#ffe9b0', 0.2));
  } else if (kind === 'dhow') {
    g.add(mesh(hullGeo(0.32, 0.09, 0.04), M.wood));
    const mast = cyl(0.005, 0.005, 0.22, M.wood, 0, 0.04, 0.02, 4);
    g.add(mast);
    const sail = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.26, 0.02), new THREE.Vector3(0, 0.06, 0.16), new THREE.Vector3(0, 0.08, -0.08)]), M.sail);
    sail.geometry.computeVertexNormals();
    g.add(sail);
  } else if (kind === 'enemyBoat') {
    const b = speedboat(M.enemy);
    b.scale.setScalar(1.6);
    g.add(b);
  } else {
    g.add(mesh(hullGeo(0.6, 0.12, 0.05), M.enemy));
    g.add(box(0.08, 0.08, 0.14, M.metal, 0, 0.05, -0.05));
    g.add(box(0.02, 0.1, 0.02, M.metal, 0, 0.13, -0.05));
  }
  return g;
}

// ----------------------------------------------------------- industry
function buildRefinery() {
  const g = new THREE.Group();
  const tankGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.1, 14);
  const tanks = new THREE.InstancedMesh(tankGeo, M.white, 24);
  const m4 = new THREE.Matrix4();
  let k = 0;
  for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
    m4.makeTranslation(-1.2 + i * 0.3, 0.05, 0.4 + j * 0.3);
    tanks.setMatrixAt(k++, m4);
  }
  g.add(tanks);
  for (let i = 0; i < 4; i++) {
    g.add(cyl(0.035, 0.04, 0.5 + i * 0.08, M.steel, 0.3 + i * 0.16, 0, -0.2, 10));
    g.add(nightLamp(0.3 + i * 0.16, 0.55 + i * 0.08, -0.2, '#ffcf6e', 0.12));
  }
  g.add(box(0.7, 0.12, 0.35, M.concrete, 0.55, 0, 0.3));
  g.add(box(0.5, 0.03, 0.03, M.steel, 0.4, 0.2, -0.05));
  g.add(box(0.03, 0.03, 0.9, M.steel, 0.2, 0.2, 0.3));
  for (const [x, z] of [[1.0, -0.4], [1.15, -0.25]]) {
    g.add(cyl(0.015, 0.02, 0.7, M.red, x, 0, z, 6));
    const f = flame(0.3);
    f.position.set(x, 0.82, z);
    g.add(f);
    const gl = glowSprite('#ff8a2a', 1.0, 0.5);
    gl.position.set(x, 0.82, z);
    gl.userData.flicker = 1.0;
    gl.userData.glow = true;
    g.add(gl);
  }
  for (let i = 0; i < 6; i++) g.add(nightLamp(-1.2 + Math.random() * 2.4, 0.3, Math.random() * 1.2 - 0.3, '#ffd27a', 0.35));
  return g;
}
function buildPort() {
  const g = new THREE.Group();
  // piers (extend toward -z => south, into water)
  for (let i = 0; i < 4; i++) {
    g.add(box(0.28, 0.08, 1.6, M.concrete, -1.2 + i * 0.8, -0.04, 0.6));
  }
  g.add(box(3.2, 0.08, 0.5, M.concrete, -0.1, -0.04, -0.35));
  // containers
  const cGeo = new THREE.BoxGeometry(0.12, 0.05, 0.05);
  const cont = new THREE.InstancedMesh(cGeo, new THREE.MeshStandardMaterial({
    roughness: 0.7
  }), 260);
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  const palette = ['#c0392b', '#2a6fb0', '#e0662a', '#2f8f5b', '#e7b416', '#8e44ad', '#7f8c8d'];
  let k = 0;
  for (let i = 0; i < 20 && k < 260; i++) for (let j = 0; j < 4 && k < 260; j++) for (let l = 0; l < 3 && k < 260; l++) {
    if (Math.random() < 0.25) continue;
    m4.makeTranslation(-1.5 + i * 0.15, 0.025 + l * 0.05, -0.55 - j * 0.06);
    cont.setMatrixAt(k, m4);
    cont.setColorAt(k, col.set(palette[Math.random() * palette.length | 0]));
    k++;
  }
  cont.count = k;
  g.add(cont);
  // gantry cranes
  for (let i = 0; i < 6; i++) {
    const c = new THREE.Group();
    const x = -1.3 + i * 0.5;
    c.position.set(x, 0, 0.05);
    c.add(box(0.02, 0.35, 0.02, M.blue, -0.06, 0, 0));
    c.add(box(0.02, 0.35, 0.02, M.blue, 0.06, 0, 0));
    c.add(box(0.16, 0.03, 0.5, M.blue, 0, 0.35, 0.12));
    c.add(nightLamp(0, 0.4, 0.3, '#ff3b2f', 0.1));
    g.add(c);
  }
  for (let i = 0; i < 8; i++) g.add(nightLamp(-1.5 + i * 0.45, 0.2, -0.4, '#ffe2a0', 0.35));
  return g;
}

// ----------------------------------------------------------- buildings
function buildingMaterial() {
  return new THREE.MeshStandardMaterial({
    roughness: 0.8,
    emissive: '#ffffff',
    emissiveMap: TEX.windows,
    emissiveIntensity: 0
  });
}

// === map/HormuzMap.ts ===

const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
function disposeSceneAssets(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root.traverse(obj => {
    if (obj.geometry) geometries.add(obj.geometry);
    for (const material of Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : []) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      for (const uniform of Object.values(material.uniforms || {})) if (uniform.value?.isTexture) textures.add(uniform.value);
    }
  });
  geometries.forEach(value => value.dispose());
  materials.forEach(value => value.dispose());
  textures.forEach(value => value.dispose());
}

class HormuzMap {
  scene = new THREE.Scene();
  pacer = new RenderPacer();
  frameListeners = new Set();
  frameId = null;
  initialized = false;
  contextLost = false;
  // CSS labels live in identity-transform groups matching the map layer
  // switches. Projecting labels never needs to walk any GLB or terrain tile.
  labelScene = new THREE.Group();
  labelGroups = new Map();
  time = 0;

  // environment
  sun = new THREE.DirectionalLight('#fff4dc', 2.4);
  moon = new THREE.DirectionalLight('#8fb3ff', 0);
  hemi = new THREE.HemisphereLight('#bfe3ff', '#8a6f4d', 1.0);
  buildingMat = buildingMaterial();
  clouds = [];
  hours = 10.5;
  autoTime = false;
  storm = 0;
  stormTarget = 0;
  flash = 0;
  night = 0;

  // content
  layers = {
    enemy: new THREE.Group(),
    trade: new THREE.Group(),
    slots: new THREE.Group(),
    labels: new THREE.Group(),
    zones: new THREE.Group(),
    clouds: new THREE.Group(),
    ships: new THREE.Group()
  };
  layerOn = {
    enemy: true,
    trade: true,
    slots: true,
    labels: true,
    zones: false,
    clouds: true,
    ships: true
  };
  laneMats = [];
  laneScale = {
    value: 1
  };
  slots = new Map();
  pickables = [];
  labels = [];
  zoneLabels = [];
  movers = [];
  enemyGroup = new THREE.Group();
  wavePreview = false;
  enemyCurves = [];

  // registries
  nightObjs = [];
  flickers = [];
  spinners = [];
  aimers = [];
  pulses = [];
  ewPulses = [];
  selected = null;
  hovered = null;
  fly = null;
  fitDistance = 300;
  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  downAt = {
    x: 0,
    y: 0
  };
  disposed = false;
  lastZoomLevel = -1;
  // PERF state: live-enemy count fed by gamesync (label density rule, §16.6),
  // label off-view culling cadence, calm-render frame cap, shadow-cam throttle.
  battleDensity = 0;
  // Density-rule state WITH hysteresis: minor labels hide when density rises
  // above 12 and only return at <=9 (dead band), so an enemy count oscillating
  // around 12 mid-wave cannot flicker the whole minor-label set per spawn/kill.
  heavyLabels = false;
  _labelCullAt = -1;
  _labelVec = null;
  _camPrev = null;
  _camStillSince = 0;
  _shadowCamAt = -1;
  constructor(container, cb = {}) {
    this.container = container;
    this.cb = cb;
    const w = Math.max(container.clientWidth || window.innerWidth || 1280, 320),
      h = Math.max(container.clientHeight || window.innerHeight || 720, 240);
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    // PERF (§16.3): DPR cap 1.5 on touch/Android devices — rendering at 2.0 from the
    // top step was a primary phone-heat source. Desktop keeps the 2.0 ceiling.
    this.isTouchDevice = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent || '');
    this.dprCap = this.isTouchDevice ? 1.5 : 2;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.dprCap));
    this.renderer.setSize(w, h);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(w, h);
    const le = this.labelRenderer.domElement;
    le.style.position = 'absolute';
    le.style.inset = '0';
    le.style.pointerEvents = 'none';
    le.dir = 'ltr';
    le.style.left = '0';
    le.style.top = '0';
    container.appendChild(le);
    this.camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 4000);
    this.controls = new MapControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.zoomToCursor = true;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 1.6;
    this.controls.maxPolarAngle = 1.2;
    this.controls.zoomSpeed = 1.4;
    this.controls.touches = {
      ONE: THREE.TOUCH.PAN,
      TWO: THREE.TOUCH.DOLLY_ROTATE
    };
    this.rangeRing = this.makeRangeRing('#2ee86b');
    this.previewRing = this.makeRangeRing('#3aa0ff');
    this.scene.add(this.rangeRing, this.previewRing);
    Object.values(this.layers).forEach(g => this.scene.add(g));
    this.layers.enemy.add(this.enemyGroup);
    this.updateFit();
    const [cx, cz] = p([26.35, 55.25]);
    this.controls.target.set(cx, 0, cz);
    this.camera.position.set(cx, this.fitDistance * 0.72, cz + this.fitDistance * 0.28);
    this.controls.maxDistance = this.fitDistance * 1.15;
    this.controls.update();
    const el = this.renderer.domElement;
    el.addEventListener('webglcontextlost', this.onContextLost);
    el.addEventListener('webglcontextrestored', this.onContextRestored);
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointermove', this.onMove);
    window.addEventListener('resize', this.onResize);
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => this.onResize());
      ro.observe(container);
      this._ro = ro;
    }
  }

  // ------------------------------------------------------------------ build
  async init() {
    const P = this.cb.onProgress ?? (() => {});
    P('پردازش خطوط ساحلی واقعی تنگه هرمز…', 5);
    await nextFrame();
    if (this.disposed) return;
    const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
    P('بارگذاری نقشه و جزیره‌های تنگه هرمز…', 25);
    const { scene: coast } = await new GLTFLoader().loadAsync('/models/map/strait-of-hormuz.glb');
    if (this.disposed) {
      disposeSceneAssets(coast);
      return;
    }
    this.scene.add(coast);
    const terrain = coast.getObjectByName('Terrain_StraitOfHormuz');
    const ocean = coast.getObjectByName('Ocean_PersianGulf');
    terrain.receiveShadow = true;
    this.field = new TerrainField(mobile ? 1408 : 1920);
    this.field.surfaceHeight = terrainHeightSampler(terrain.geometry);
    P('آماده‌سازی آب و امواج ساحلی…', 55);
    this.waterU = animateOcean(ocean, this.field);
    this.buildEnvironment();
    P('ترسیم مسیرهای دشمن، کریدور تجاری و مناطق عملیاتی…', 65);
    await nextFrame();
    if (this.disposed) return;
    this.buildLanes();
    this.buildZones();
    P('استقرار جایگاه‌های برجک و سکوهای دریایی…', 75);
    await nextFrame();
    if (this.disposed) return;
    this.buildSlots();
    P('ساخت شهرها، پالایشگاه و اسکله شهید رجایی…', 85);
    await nextFrame();
    if (this.disposed) return;
    this.buildCities();
    this.buildInfrastructure();
    this.buildShips();
    this.buildLabels();
    P('آماده‌سازی نهایی…', 98);
    await nextFrame();
    if (this.disposed) return;
    this.onResize();
    this.setTime(this.hours);
    this.applyLayers();
    this.freezeStaticScene();
    // Restoring an established port attaches many GLBs and lights. Drawing after
    // each attachment recompiles lighting variants and stalls Android WebView.
    await this.cb.onReady?.();
    if (this.disposed) return;
    this.initialized = true;
    document.addEventListener('visibilitychange', this.syncFrameLoop);
    window.addEventListener(nativeVisibilityEvent, this.syncFrameLoop);
    this.syncFrameLoop();
  }

  /* PERF2 (D-020): the built world is ~3,000 objects whose local matrices
   * never change after construction, yet three.js recomposed every one of
   * them on every frame (audit2 team 1: matrixAutoUpdate is disabled
   * nowhere). Freeze every subtree that contains no animated object:
   * compose its local matrices once, here, and let the renderer reuse them.
   * The animated registries (clouds, flicker/spin/ewPulse nodes, lane
   * movers, aiming turrets, build-pop roots, sun/moon + their targets, the
   * selection rings, rain) keep live matrices — and so do all their
   * ancestors, because the freeze only lands on subtrees with no animated
   * descendant. A frozen node's matrix stays valid precisely because
   * nothing above it moves either. Objects gamesync adds later are frozen
   * by gamesync itself at placement time. */
  freezeStaticScene() {
    const animated = new Set();
    const add = o => { if (o) animated.add(o); };
    for (const c of this.clouds ?? []) add(c);
    for (const f of this.flickers ?? []) add(f);
    for (const s of this.spinners ?? []) add(s);
    for (const p of this.ewPulses ?? []) add(p);
    for (const m of this.movers ?? []) add(m.obj);
    for (const a of this.aimers ?? []) add(a.obj);
    add(this.sun); add(this.moon);
    add(this.sun?.target); add(this.moon?.target);
    add(this.rangeRing); add(this.previewRing); add(this.rain);
    // build-pop roots scale in updateAnimations while userData.pop < 1
    this.scene.traverse(o => { if (o.userData && o.userData.pop !== undefined) animated.add(o); });
    const hasAnim = new Map();
    const mark = o => {
      let h = animated.has(o);
      for (const c of o.children) h = mark(c) || h;
      hasAnim.set(o, h);
      return h;
    };
    for (const c of [...this.scene.children]) mark(c);
    const freeze = o => {
      if (!hasAnim.get(o)) {
        o.traverse(n => { n.updateMatrix(); n.matrixAutoUpdate = false; });
        return;
      }
      for (const c of [...o.children]) freeze(c);
    };
    for (const c of [...this.scene.children]) freeze(c);
  }
  register(o) {
    o.traverse(c => {
      if (c.userData.night) this.nightObjs.push(c);
      if (c.userData.flicker) this.flickers.push(c);
      if (c.userData.spin) this.spinners.push(c);
      if (c.userData.pulse) this.pulses.push(c);
      if (c.userData.ewPulse) this.ewPulses.push(c);
    });
  }
  unregister(o) {
    const set = new Set();
    o.traverse(c => set.add(c));
    const f = a => a.filter(x => !set.has(x));
    this.nightObjs = f(this.nightObjs);
    this.flickers = f(this.flickers);
    this.spinners = f(this.spinners);
    this.pulses = f(this.pulses);
    this.ewPulses = f(this.ewPulses);
    this.aimers = this.aimers.filter(a => !set.has(a.obj));
  }
  buildEnvironment() {
    // sky dome
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: {
          value: new THREE.Color('#3d7cc9')
        },
        uHorizon: {
          value: new THREE.Color('#bfe0f5')
        }
      },
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uTop; uniform vec3 uHorizon; varying vec3 vP; void main(){ float h = clamp(vP.y*1.6+0.08,0.0,1.0); gl_FragColor = vec4(mix(uHorizon, uTop, pow(h,0.6)),1.0); }`
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(2600, 32, 16), this.skyMat);
    sky.renderOrder = -10;
    this.scene.add(sky);
    this.scene.fog = new THREE.FogExp2('#bfe0f5', 0.0008); // VIS2 (D-025): matches the per-frame base in updateEnvironment

    // ocean "table" beyond the map
    const table = new THREE.Mesh(new THREE.PlaneGeometry(6500, 6500), new THREE.ShaderMaterial({
      uniforms: {
        uNight: this.waterU.uNight,
        uFogColor: this.waterU.uFogColor,
        uFogDensity: this.waterU.uFogDensity
      },
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform float uNight; uniform vec3 uFogColor; uniform float uFogDensity; varying vec3 vW;
          void main(){ vec3 c = vec3(0.02,0.13,0.23); vec2 g = abs(fract(vW.xz/20.0)-0.5); float line = 1.0 - smoothstep(0.0, 0.015, min(g.x,g.y));
          c += vec3(0.05,0.18,0.25)*line*0.5; c = mix(c, c*vec3(0.25,0.3,0.45), uNight);
          float d = length(cameraPosition - vW); float f = 1.0 - exp(-uFogDensity*uFogDensity*d*d); gl_FragColor = vec4(mix(c, uFogColor, f),1.0);} `
    }));
    table.rotation.x = -Math.PI / 2;
    table.position.y = -0.4;
    this.scene.add(table);

    // lights
    this.scene.add(this.hemi, this.sun, this.sun.target, this.moon);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024); // PERF (§16.5): 1024² shadow map is enough at game scale; 2048² doubled the shadow pass cost
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;

    // VIS2 (D-025): image-based fill light — the missing half of the
    // lighting model (audit2 team 6: `scene.environment` existed
    // nowhere, so GLB metals up to metalness 0.92 read flat black on
    // their shadow sides; hemisphere light alone cannot feed metals).
    // A tiny procedural equirect canvas — sky gradient, warm sun blob
    // near the day-anchor azimuth, sandy ground bounce matching the
    // hemisphere ground color — is enough: this is Style-A fill light,
    // not PBR realism. One static texture, ~zero per-frame cost; its
    // intensity is faded with the night factor in updateEnvironment.
    {
      const ec = document.createElement('canvas');
      ec.width = 256;
      ec.height = 128;
      const ectx = ec.getContext('2d');
      const grad = ectx.createLinearGradient(0, 0, 0, 128);
      grad.addColorStop(0, '#7db1e0');
      grad.addColorStop(0.48, '#cfe6f5');
      grad.addColorStop(0.56, '#cbb98f');
      grad.addColorStop(1, '#8a6f4d');
      ectx.fillStyle = grad;
      ectx.fillRect(0, 0, 256, 128);
      const rg = ectx.createRadialGradient(170, 34, 2, 170, 34, 46);
      rg.addColorStop(0, 'rgba(255,244,220,0.95)');
      rg.addColorStop(1, 'rgba(255,244,220,0)');
      ectx.fillStyle = rg;
      ectx.fillRect(0, 0, 256, 128);
      const envTex = new THREE.CanvasTexture(ec);
      envTex.mapping = THREE.EquirectangularReflectionMapping;
      envTex.colorSpace = THREE.SRGBColorSpace;
      this.scene.environment = envTex;
      this.scene.environmentIntensity = 0.5;
    }

    // stars
    const sg = new THREE.BufferGeometry();
    const sp = new Float32Array(2500 * 3);
    const r = mulberry32(7);
    for (let i = 0; i < 2500; i++) {
      const th = r() * Math.PI * 2,
        ph = Math.acos(r() * 0.95);
      sp[i * 3] = 1500 * Math.sin(ph) * Math.cos(th);
      sp[i * 3 + 1] = 1500 * Math.cos(ph);
      sp[i * 3 + 2] = 1500 * Math.sin(ph) * Math.sin(th);
    }
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({
      color: '#ffffff',
      size: 2.2,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      fog: false
    }));
    this.scene.add(this.stars);

    // clouds
    for (let i = 0; i < 46; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: TEX.cloud,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        fog: false
      }));
      const sc = 22 + r() * 40;
      s.scale.set(sc, sc * 0.6, 1);
      s.position.set((r() - 0.5) * WIDTH * 1.1, 22 + r() * 18, (r() - 0.5) * HEIGHT * 1.1);
      s.userData.base = 0.35 + r() * 0.35;
      this.clouds.push(s);
      this.layers.clouds.add(s);
    }

    // rain
    const N = 2600;
    this.rainBase = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      this.rainBase[i * 3] = r() - 0.5;
      this.rainBase[i * 3 + 1] = r();
      this.rainBase[i * 3 + 2] = r() - 0.5;
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 6), 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({
      color: '#cfe6ff',
      transparent: true,
      opacity: 0.45
    }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.scene.add(this.rain);
  }
  makeRibbon(curve, width, mat, y = 0.05) {
    const len = curve.getLength();
    const n = Math.max(20, Math.ceil(len / 0.25));
    const pos = [],
      uv = [],
      idx = [],
      nrm = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const pt = curve.getPointAt(t);
      const tg = curve.getTangentAt(t);
      const nx = -tg.z,
        nz = tg.x;
      const l = Math.hypot(nx, nz) || 1;
      pos.push(pt.x, y, pt.z, pt.x, y, pt.z);
      nrm.push(nx / l * width / 2, 1, nz / l * width / 2, -(nx / l) * width / 2, 1, -(nz / l) * width / 2);
      uv.push(t * len, 0, t * len, 1);
      if (i < n) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('aOff', new THREE.Float32BufferAttribute(nrm, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false;
    m.renderOrder = 3;
    return m;
  }
  laneMaterial(color, mode) {
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: {
          value: 0
        },
        uColor: {
          value: new THREE.Color(color)
        },
        uMode: {
          value: mode
        },
        uBoost: {
          value: 0
        },
        uScale: this.laneScale
      },
      vertexShader: `attribute vec3 aOff; uniform float uScale; varying vec2 vUv; void main(){ vUv = uv; vec3 p = position + vec3(aOff.x, 0.0, aOff.z) * uScale; vUv.x = uv.x / uScale; gl_Position = projectionMatrix*modelViewMatrix*vec4(p,1.0); }`,
      fragmentShader: `varying vec2 vUv; uniform float uTime; uniform vec3 uColor; uniform float uMode; uniform float uBoost;
        void main(){
          float ac = abs(vUv.y-0.5)*2.0; float al = vUv.x;
          float a = 0.0;
          if (uMode < 0.5) {
            // enemy: animated red dotted edges + chevrons
            float sp = 1.2 + uBoost*1.5;
            float f = fract(al*0.9 - uTime*sp*0.6 + ac*0.35);
            float chev = smoothstep(0.0,0.06,f)*(1.0-smoothstep(0.22,0.3,f)) * (1.0 - smoothstep(0.7,0.8,ac));
            float dots = step(0.5, fract(al*2.2 - uTime*sp)) * smoothstep(0.78,0.86,ac) * (1.0-smoothstep(0.94,1.0,ac));
            a = chev*0.75 + dots*0.95 + 0.10*(1.0-ac);
            a *= 0.55 + 0.45*uBoost;
          } else {
            float f = fract(al*0.5 - uTime*0.25 + ac*0.25);
            float chev = smoothstep(0.0,0.05,f)*(1.0-smoothstep(0.12,0.18,f)) * (1.0 - smoothstep(0.6,0.7,ac));
            float edge = smoothstep(0.8,0.88,ac)*(1.0-smoothstep(0.94,1.0,ac)) * step(0.4, fract(al*1.2));
            a = chev*0.55 + edge*0.5 + 0.05;
          }
          gl_FragColor = vec4(uColor * (1.0 + uBoost*0.6), a);
        }`
    });
    this.laneMats.push(m);
    return m;
  }
  toCurve(pts, y = 0.05) {
    return new THREE.CatmullRomCurve3(pts.map(ll => {
      const [x, z] = p(ll);
      return new THREE.Vector3(x, y, z);
    }), false, 'centripetal');
  }
  buildLanes() {
    for (const lane of ENEMY_LANES) {
      const c = this.toCurve(lane.pts);
      this.enemyCurves.push(c);
      this.layers.enemy.add(this.makeRibbon(c, 1.0, this.laneMaterial('#ff3b30', 0)));
      // spawn skull
      const start = c.getPointAt(0);
      const sk = new THREE.Sprite(new THREE.SpriteMaterial({
        map: TEX.skull,
        depthTest: false
      }));
      sk.scale.setScalar(1.6);
      sk.position.set(start.x, 1.3, start.z);
      sk.renderOrder = 10;
      this.layers.enemy.add(sk);
      const gl = glowSprite('#ff2a1a', 4, 0.6);
      gl.position.copy(start).setY(0.2);
      this.layers.enemy.add(gl);
      this.addLabel(this.layers.enemy, `<div class="lbl-enemy">💀 ${lane.name}</div>`, start.x, 2.4, start.z, 1);
    }
    // base (end) beacon
    const end = this.enemyCurves[0].getPointAt(1);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.6, 14, 16, 1, true), new THREE.MeshBasicMaterial({
      color: '#36ff9a',
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    }));
    beam.position.set(end.x, 7, end.z);
    this.layers.enemy.add(beam);
    this.addLabel(this.layers.enemy, `<div class="lbl-base">❤️ قلب دفاع · ۲۰/۲۰</div>`, end.x, 3, end.z, 1);
    for (const lane of TRADE_LANES) {
      const c = this.toCurve(lane.pts, 0.04);
      this.layers.trade.add(this.makeRibbon(c, 0.8, this.laneMaterial(lane.id === 'inbound' ? '#7fe8ff' : '#d6f6ff', 1), 0.04));
    }
    // customs line
    const [a, b] = CUSTOMS_LINE.map(ll => p(ll));
    const cl = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a[0], 0.08, a[1]), new THREE.Vector3(b[0], 0.08, b[1])]), new THREE.LineDashedMaterial({
      color: '#ffd166',
      dashSize: 0.5,
      gapSize: 0.3
    }));
    cl.computeLineDistances();
    this.layers.trade.add(cl);
    for (const q of [a, b]) {
      const buoy = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.3, 8), MATS.yellow);
      buoy.position.set(q[0], 0.1, q[1]);
      this.layers.trade.add(buoy);
      const lamp = glowSprite('#ffd166', 0.6, 0.9);
      lamp.position.set(q[0], 0.35, q[1]);
      this.layers.trade.add(lamp);
    }
    const [tlx, tlz] = p([25.68, 55.78]);
    this.addLabel(this.layers.trade, `<div class="lbl-trade">⚓ لاین بین‌المللی ترانزیت</div>`, tlx, 0.6, tlz, 1);
    this.addLabel(this.layers.trade, `<div class="lbl-customs">🛃 خط گمرک</div>`, (a[0] + b[0]) / 2, 0.8, (a[1] + b[1]) / 2, 2);
  }
  buildZones() {
    for (const z of ZONES) {
      const [x, zz] = p(z.ll);
      const pts = [];
      for (let i = 0; i <= 96; i++) {
        const a = i / 96 * Math.PI * 2;
        pts.push(new THREE.Vector3(x + Math.cos(a) * z.radius, 0.3, zz + Math.sin(a) * z.radius));
      }
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({
        color: '#ffd166',
        dashSize: 1.2,
        gapSize: 0.8,
        transparent: true,
        opacity: 0.9
      }));
      line.computeLineDistances();
      this.layers.zones.add(line);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(z.radius, 64), new THREE.MeshBasicMaterial({
        color: '#ffd166',
        transparent: true,
        opacity: 0.05,
        depthWrite: false
      }));
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(x, 0.12, zz);
      this.layers.zones.add(disc);
      const o = this.addLabel(this.layers.zones, `<div class="lbl-zone"><b>${z.id.toLocaleString('fa-IR')}</b><span>${z.name}<small>${z.sub}</small></span></div>`, x, 1.5, zz - z.radius * 0.75, -1);
      this.zoneLabels.push(o);
    }
  }
  buildSlots() {
    const placed = [];
    for (const def of SLOT_DEFS) {
      const [tx, tz] = p(def.ll);
      let [x, z] = this.field.snap(tx, tz, def.kind, 18);
      // avoid overlap
      for (let tries = 0; tries < 8 && placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 0.95); tries++) {
        const a = tries * 0.8;
        [x, z] = this.field.snap(tx + Math.cos(a) * 1.1, tz + Math.sin(a) * 1.1, def.kind, 10);
      }
      placed.push([x, z]);
      let y = 0;
      if (def.kind === 'land') {
        for (let i = 0; i < 7; i++) {
          const a = i / 6 * Math.PI * 2;
          y = Math.max(y, this.field.height(x + (i ? Math.cos(a) * 0.3 : 0), z + (i ? Math.sin(a) * 0.3 : 0)));
        }
      }
      const pad = buildPad(def.kind);
      pad.position.set(x, y, z);
      pad.scale.setScalar(1.28);
      if (def.kind === 'land') {
        const f = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 1, 6), MATS.concreteDark);
        f.position.y = -0.5;
        pad.add(f);
      }
      // Invisible expanded touch hit cylinder for easy mobile tapping
      const hitCyl = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 1.4, 8), new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.001,
        depthWrite: false
      }));
      hitCyl.position.y = 0.35;
      pad.add(hitCyl);
      const icon = new THREE.Sprite(new THREE.SpriteMaterial({
        map: def.kind === 'land' ? TEX.shield : TEX.rig,
        transparent: true,
        depthWrite: false
      }));
      icon.scale.setScalar(0.62);
      icon.position.set(0, 0.78, 0);
      icon.renderOrder = 8;
      pad.add(icon);
      pad.traverse(c => c.userData.slotId = def.id);
      this.pickables.push(pad);
      this.layers.slots.add(pad);
      this.register(pad);
      const label = this.addLabel(this.layers.slots, `<div class="lbl-slot ${def.kind}">${def.id}</div>`, x, y + 1.15, z, 3);
      this.slots.set(def.id, {
        def,
        x,
        z,
        y,
        pad,
        icon,
        label,
        built: null
      });
    }
  }
  buildCities() {
    const r = mulberry32(99);
    const list = [];
    const lights = [];
    const palettes = {
      iran: ['#efe4cc', '#e2d3b0', '#d8c7a4', '#f4efe4', '#cdb894'],
      modern: ['#f2f2f2', '#d9dee3', '#b8c6d1', '#e8e2d6'],
      skyline: ['#9fb6c6', '#b9c7d1', '#7f97a8', '#dfe6ea', '#6d8597'],
      village: ['#cfb48a', '#d8c39a', '#bfa47a', '#e3d2ae']
    };
    for (const c of CITIES) {
      const [cx, cz] = p(c.ll);
      let made = 0;
      for (let i = 0; i < c.count * 3 && made < c.count; i++) {
        const a = r() * Math.PI * 2;
        const rr = Math.pow(r(), 0.7) * c.radius;
        const x = cx + Math.cos(a) * rr * 1.25,
          z = cz + Math.sin(a) * rr * 0.85;
        const sd = this.field.sample(x, z);
        if (sd < 0.25) continue;
        const gy = this.field.height(x, z);
        if (gy > 1.6) continue;
        const centr = 1 - rr / c.radius;
        let h = 0.03 + Math.pow(r(), 2.2) * c.maxH * (0.35 + centr);
        if (c.style === 'skyline' && r() < 0.04) h = c.maxH * (0.8 + r() * 0.5);
        const w = 0.04 + r() * (c.style === 'village' ? 0.05 : 0.09);
        list.push({
          x,
          z,
          y: gy - 0.03,
          w,
          h,
          d: w * (0.7 + r() * 0.6),
          c: new THREE.Color(palettes[c.style][r() * palettes[c.style].length | 0]),
          rot: r() < 0.7 ? 0.1 : r() * Math.PI
        });
        if (r() < 0.45) lights.push(x, gy + 0.05, z);
        made++;
      }
      if (c.style === 'skyline') {
        // Burj Khalifa-ish tower
        const [bx, bz] = p([24.53, 55.28]);
        list.push({
          x: bx,
          z: bz,
          y: this.field.height(bx, bz),
          w: 0.07,
          h: 3.6,
          d: 0.07,
          c: new THREE.Color('#cfdbe3'),
          rot: 0
        });
      }
    }
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const inst = new THREE.InstancedMesh(geo, this.buildingMat, list.length);
    const m4 = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      s = new THREE.Vector3(),
      v = new THREE.Vector3();
    list.forEach((b, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.rot);
      m4.compose(v.set(b.x, b.y, b.z), q, s.set(b.w, b.h, b.d));
      inst.setMatrixAt(i, m4);
      inst.setColorAt(i, b.c);
    });
    inst.castShadow = true;
    inst.receiveShadow = true;
    this.scene.add(inst);

    // coastal road lights (from-space glow)
    for (let i = 0; i < 1400; i++) {
      const x = (r() - 0.5) * WIDTH,
        z = (r() - 0.5) * HEIGHT;
      const sd = this.field.sample(x, z);
      const reg = this.field.region(x, z);
      if (sd > 0.3 && sd < 3 && reg !== 'island' && r() < 0.6) lights.push(x, this.field.height(x, z) + 0.05, z);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lights, 3));
    this.cityLights = new THREE.Points(lg, new THREE.PointsMaterial({
      map: TEX.glow,
      color: '#ffc46b',
      size: 0.45,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    this.scene.add(this.cityLights);
  }
  placeOnLand(obj, ll, rot = 0) {
    let [x, z] = p(ll);
    if (!this.field.isLand(x, z)) [x, z] = this.field.snap(x, z, 'land', 20);
    obj.position.set(x, this.field.height(x, z), z);
    obj.rotation.y = rot;
    this.scene.add(obj);
    this.register(obj);
    return obj;
  }
  buildInfrastructure() {
    // Shahid Rajaee port: origin on shoreline, piers extend south
    const port = buildPort();
    const [px, pz] = p([27.112, 56.05]);
    port.position.set(px, 0.1, pz);
    this.scene.add(port);
    this.register(port);
    const ref = buildRefinery();
    this.placeOnLand(ref, [27.165, 56.12], 0.15);
    ref.position.y += 0.02;
    const ref2 = buildRefinery();
    ref2.scale.setScalar(0.85);
    this.placeOnLand(ref2, [26.64, 55.82], 0.6); // Qeshm industrial
    // Assaluyeh South Pars gas refinery complex
    const refAsl = buildRefinery();
    refAsl.scale.setScalar(1.1);
    this.placeOnLand(refAsl, [27.50, 52.62], -0.4);
    // Kharg Island oil export terminal
    const refKrg = buildRefinery();
    refKrg.scale.setScalar(0.95);
    this.placeOnLand(refKrg, [29.14, 50.24], 0.2);
    // Lavan Island oil refinery
    const refLvn = buildRefinery();
    refLvn.scale.setScalar(0.80);
    this.placeOnLand(refLvn, [26.82, 52.80], -0.3);
    // Chabahar oceanic port
    const portChb = buildPort();
    portChb.scale.setScalar(0.85);
    const [chx, chz] = p([25.29, 60.60]);
    portChb.position.set(chx, 0.1, chz);
    this.scene.add(portChb);
    this.register(portChb);
    // Kish command HQ
    const hq = new THREE.Group();
    hq.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.25, 8), MATS.white));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), MATS.glowCyan);
    dome.position.y = 0.25;
    hq.add(dome);
    const lampHQ = glowSprite('#3ee6ff', 1.4, 0.7);
    lampHQ.position.y = 0.6;
    lampHQ.userData.night = true;
    hq.add(lampHQ);
    this.placeOnLand(hq, [26.36, 53.94]);
    // offshore rigs
    const r = mulberry32(5);
    for (const ll of PREBUILT_RIGS) {
      const rig = buildOilRig(1 + (r() * 2 | 0));
      const [x, z] = p(ll);
      rig.position.set(x, 0, z);
      rig.rotation.y = r() * Math.PI;
      this.scene.add(rig);
      this.register(rig);
    }
  }
  buildShips() {
    const r = mulberry32(11);
    const kinds = ['tanker', 'container', 'bulk', 'tanker', 'dhow', 'container', 'tanker'];
    for (const lane of TRADE_LANES) {
      const c = this.toCurve(lane.pts, 0);
      const len = c.getLength();
      for (let i = 0; i < 9; i++) {
        const k = kinds[r() * kinds.length | 0];
        const s = buildShip(k);
        this.addWake(s, k === 'dhow' ? 0.4 : 1);
        this.layers.ships.add(s);
        this.register(s);
        this.movers.push({
          obj: s,
          curve: c,
          len,
          t: i / 9 + r() * 0.05,
          speed: k === 'tanker' ? 0.35 : k === 'dhow' ? 0.6 : 0.5,
          loop: true
        });
      }
    }
    // local dhow / ferry traffic
    const local = [[[27.12, 56.24], [27.06, 56.32], [27.02, 56.40]], [[27.10, 56.16], [26.95, 56.22], [26.80, 56.24]], [[26.56, 54.88], [26.48, 54.50], [26.42, 54.18]], [[27.45, 52.58], [27.15, 52.72], [26.92, 52.82]], [[25.62, 57.75], [25.35, 59.10], [25.24, 60.45]]];
    for (const route of local) {
      const c = this.toCurve(route, 0);
      for (let i = 0; i < 2; i++) {
        const s = buildShip('dhow');
        this.addWake(s, 0.4);
        this.layers.ships.add(s);
        this.movers.push({
          obj: s,
          curve: c,
          len: c.getLength(),
          t: r(),
          speed: 0.4,
          loop: false
        });
      }
    }
    // enemy ghost fleet (wave preview)
    for (const c of this.enemyCurves) {
      const len = c.getLength();
      for (let i = 0; i < 7; i++) {
        const s = buildShip(i % 3 === 2 ? 'enemyFrigate' : 'enemyBoat');
        const g = glowSprite('#ff2a1a', 0.9, 0.55);
        g.position.y = 0.1;
        s.add(g);
        this.addWake(s, 0.6);
        this.enemyGroup.add(s);
        this.movers.push({
          obj: s,
          curve: c,
          len,
          t: i * 0.06,
          speed: i % 3 === 2 ? 0.8 : 1.4,
          loop: true,
          enemy: true
        });
      }
    }
    this.enemyGroup.visible = false;
  }
  addWake(ship, size) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(0.35 * size, 1.6 * size), new THREE.MeshBasicMaterial({
      map: TEX.glow,
      color: '#ffffff',
      transparent: true,
      opacity: 0.35,
      depthWrite: false
    }));
    w.rotation.x = -Math.PI / 2;
    w.position.set(0, 0.02, -0.9 * size);
    ship.add(w);
  }
  addLabel(parent, html, x, y, z, tier) {
    const div = document.createElement('div');
    div.innerHTML = html;
    div.className = 'map-label';
    div.style.left = '0';
    div.style.top = '0';
    const o = new CSS2DObject(div);
    o.position.set(x, y, z);
    let group = this.labelGroups.get(parent);
    if (!group) {
      group = new THREE.Group();
      this.labelGroups.set(parent, group);
      this.labelScene.add(group);
    }
    group.add(o);
    if (tier >= 0) this.labels.push({
      obj: o,
      tier
    });
    return o;
  }
  buildLabels() {
    for (const pl of PLACES) {
      const [x, z] = p(pl.ll);
      const y = Math.max(0.3, this.field.height(x, z)) + (pl.tier === 0 ? 3 : 0.8);
      const cls = `lbl-${pl.kind} t${pl.tier}`;
      this.addLabel(this.layers.labels, `<div class="${cls}"><span>${pl.name}</span><small>${pl.en}</small></div>`, x, y, z, pl.tier);
    }
  }
  makeRangeRing(color) {
    const g = new THREE.Group();
    const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      depthTest: false
    }));
    fill.rotation.x = -Math.PI / 2;
    const edge = new THREE.Mesh(new THREE.RingGeometry(0.965, 1, 96), new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide
    }));
    edge.rotation.x = -Math.PI / 2;
    g.add(fill, edge);
    g.renderOrder = 20;
    fill.renderOrder = 20;
    edge.renderOrder = 21;
    g.visible = false;
    return g;
  }

  // ------------------------------------------------------------------ public API
  getSlotInfo(s) {
    const [lat, lon] = unproject(s.x, s.z);
    return {
      id: s.def.id,
      area: s.def.area,
      kind: s.def.kind,
      lat,
      lon,
      built: s.built ? {
        type: s.built.type,
        tier: s.built.tier
      } : null
    };
  }
  getSlots() {
    return [...this.slots.values()].map(s => this.getSlotInfo(s));
  }
  select(id, focus = false) {
    const s = id ? this.slots.get(id) ?? null : null;
    if (this.selected && this.selected !== s) this.selected.pad.userData.ring.material.color.set(this.selected.def.kind === 'land' ? '#3ee6ff' : '#ffb627');
    this.selected = s;
    this.previewRing.visible = false;
    if (s) {
      s.pad.userData.ring.material.color.set('#ffffff');
      if (focus) this.flyTo(s.x, s.z, Math.min(this.distance(), 9));
    }
    this.updateRangeRing();
    this.cb.onSelect?.(s ? this.getSlotInfo(s) : null);
  }
  updateRangeRing() {
    const s = this.selected;
    if (s?.built && rangeOf(s.built.type, s.built.tier) > 0) {
      const r = rangeOf(s.built.type, s.built.tier);
      this.rangeRing.visible = true;
      this.rangeRing.position.set(s.x, Math.max(0.1, s.y + 0.1), s.z);
      this.rangeRing.scale.setScalar(r);
    } else this.rangeRing.visible = false;
  }

  /** Show blue range preview (for hovering build/upgrade options). */
  previewRange(type, tier = 1) {
    const s = this.selected;
    if (!s || !type || rangeOf(type, tier) <= 0) {
      this.previewRing.visible = false;
      return;
    }
    this.previewRing.visible = true;
    this.previewRing.position.set(s.x, Math.max(0.12, s.y + 0.12), s.z);
    this.previewRing.scale.setScalar(rangeOf(type, tier));
  }
  build(id, type, tier = 1) {
    const s = this.slots.get(id);
    if (!s) return;
    if (s.built) {
      this.unregister(s.built.obj);
      s.pad.remove(s.built.obj);
    }
    let obj;
    if (type === 'oilrig') obj = buildOilRig(tier);else if (type === 'seaplatform') obj = buildSeaPlatform();else obj = buildTower(type, tier);
    if (type !== 'oilrig' && type !== 'seaplatform') obj.position.y = s.pad.userData.top;
    if (type === 'oilrig') obj.position.y = 0;
    obj.traverse(c => c.userData.slotId = id);
    s.pad.add(obj);
    s.icon.visible = false;
    s.built = {
      type,
      tier,
      obj
    };
    this.register(obj);
    obj.traverse(c => {
      if (c.userData.aim) this.aimers.push({
        obj: c,
        x: s.x,
        z: s.z,
        range: rangeOf(type, tier)
      });
    });
    // build pop animation
    obj.userData.pop = 0;
    if (this.selected === s) {
      this.updateRangeRing();
      this.cb.onSelect?.(this.getSlotInfo(s));
    }
  }
  upgrade(id) {
    const s = this.slots.get(id);
    if (!s?.built || s.built.tier >= 3) return;
    this.build(id, s.built.type, s.built.tier + 1);
  }
  demolish(id) {
    const s = this.slots.get(id);
    if (!s?.built) return;
    this.unregister(s.built.obj);
    s.pad.remove(s.built.obj);
    s.built = null;
    s.icon.visible = true;
    if (this.selected === s) {
      this.updateRangeRing();
      this.cb.onSelect?.(this.getSlotInfo(s));
    }
  }
  setLayer(name, on) {
    this.layerOn[name] = on;
    this.applyLayers();
  }
  applyLayers() {
    for (const [name, group] of Object.entries(this.layers)) {
      group.visible = this.layerOn[name];
      const labels = this.labelGroups.get(group);
      if (labels) labels.visible = group.visible;
    }
  }
  setWavePreview(on) {
    this.wavePreview = on;
    this.enemyGroup.visible = on;
    if (on && !this.layerOn.enemy) this.setLayer('enemy', true);
  }
  setTime(h) {
    this.hours = (h % 24 + 24) % 24;
  }
  setAutoTime(on) {
    this.autoTime = on;
  }
  setStorm(on) {
    this.stormTarget = on ? 1 : 0;
  }
  polarFor(d) {
    return lerp(1.0, 0.32, smoothstep(6, this.fitDistance * 0.85, d));
  }
  distance() {
    return this.camera.position.distanceTo(this.controls.target);
  }
  cancelFly() { this.fly = null; }
  flyTo(x, z, dist, dur = 1.4) {
    this.fly = {
      t: 0,
      dur,
      fromT: this.controls.target.clone(),
      toT: new THREE.Vector3(x, 0, z),
      fromD: this.distance(),
      toD: clamp(dist, this.controls.minDistance, this.fitDistance)
    };
  }
  flyToLL(ll, dist) {
    const [x, z] = p(ll);
    this.flyTo(x, z, dist);
  }
  zoomLevel(level) {
    const t = this.controls.target;
    if (level === 0) {
      const [cx, cz] = p([26.35, 55.25]);
      this.flyTo(cx, cz, this.fitDistance * 0.78);
    } else this.flyTo(t.x, t.z, level === 1 ? 55 : 10);
  }
  zoomBy(f) {
    const t = this.controls.target;
    this.flyTo(t.x, t.z, this.distance() * f, 0.5);
  }
  resetNorth() {
    const d = this.distance();
    const t = this.controls.target;
    const off = new THREE.Vector3(0, Math.cos(0.55), Math.sin(0.55)).multiplyScalar(d);
    this.camera.position.copy(t).add(off);
    this.controls.update();
  }

  // ------------------------------------------------------------------ events
  onDown = e => {
    this.downAt = {
      x: e.clientX,
      y: e.clientY
    };
    this.fly = null;
  };
  pick(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((e.clientX - rect.left) / rect.width * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    if (!this.layerOn.slots) return null;
    const hits = this.raycaster.intersectObjects(this.pickables, true);
    for (const h of hits) {
      const id = h.object.userData.slotId;
      if (id && h.object.visible) return this.slots.get(id) ?? null;
    }
    return null;
  }
  onUp = e => {
    if (Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 6) return;
    const s = this.pick(e);
    this.select(s ? s.def.id : null, !!s && this.distance() > 25);
  };
  onMove = e => {
    if (e.pointerType !== 'mouse') return;
    const s = this.pick(e);
    if (s !== this.hovered) {
      if (this.hovered && this.hovered !== this.selected) this.hovered.pad.scale.setScalar(1.28);
      this.hovered = s;
      if (s) s.pad.scale.setScalar(1.45);
      this.renderer.domElement.style.cursor = s ? 'pointer' : '';
    }
    // lat/lon under cursor (plane y=0)
    const ray = this.raycaster.ray;
    if (Math.abs(ray.direction.y) > 1e-4) {
      const t = -ray.origin.y / ray.direction.y;
      const x = ray.origin.x + ray.direction.x * t,
        z = ray.origin.z + ray.direction.z * t;
      const [lat, lon] = unproject(x, z);
      this.cb.onHover?.(lat, lon);
    }
  };
  onResize = () => {
    const w = Math.max(this.container.clientWidth || window.innerWidth || 1280, 320);
    const h = Math.max(this.container.clientHeight || window.innerHeight || 720, 240);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
    this.updateFit();
    if (!Number.isFinite(this.camera.position.y) || !Number.isFinite(this.camera.position.z)) {
      const [cx, cz] = p([26.4, 55.8]);
      this.controls.target.set(cx, 0, cz);
      this.camera.position.set(cx, this.fitDistance * 0.93, cz + this.fitDistance * 0.36);
      this.controls.update();
    }
  };
  updateFit() {
    const aspect = Number.isFinite(this.camera.aspect) && this.camera.aspect > 0.05 ? this.camera.aspect : 16 / 9;
    const vf = this.camera.fov * Math.PI / 180;
    const hf = 2 * Math.atan(Math.tan(vf / 2) * aspect);
    const dW = WIDTH * 0.55 / Math.tan(hf / 2);
    const dH = HEIGHT * 0.6 / Math.tan(vf / 2);
    this.fitDistance = clamp(Math.max(dW, dH) * 0.95, 200, 900);
    this.controls.maxDistance = this.fitDistance;
  }

  // ------------------------------------------------------------------ frame
  onBeforeFrame(callback) {
    this.frameListeners.add(callback);
    return () => this.frameListeners.delete(callback);
  }
  onContextLost = () => { this.contextLost = true; this.syncFrameLoop(); };
  onContextRestored = () => { this.contextLost = false; this.syncFrameLoop(); };
  syncFrameLoop = () => {
    if (this.disposed || !this.initialized || this.contextLost || isRenderHidden()) {
      if (this.frameId !== null) cancelAnimationFrame(this.frameId);
      this.frameId = null;
      this.pacer.reset();
    } else if (this.frameId === null) {
      this.frameId = requestAnimationFrame(this.loop);
    }
  };
  loop = (nowMs) => {
    this.frameId = null;
    this.syncFrameLoop();
    if (this.frameId === null) return;
    const calm = window.__hormuzCalmUi === true || window.__hormuzCalmPhase === true;
    // PERF2 (D-020): hard render ceiling — renders NEVER exceed 60/s in any
    // phase. In v0.5.0 the non-calm path rendered on every rAF tick, i.e.
    // at the display's 90/120Hz on high-refresh phones, for the whole
    // battle (audit2 team 1, top heat cause). The calm 30fps budget below
    // stays as the tighter cap when it applies; skipped rAF ticks only
    // accumulate dt — the environment step runs once per RENDERED frame
    // with the accumulated dt, so animation speed is unchanged.
    let budget = 1 / 60;
    if (calm) {
      const nowS = performance.now() / 1000;
      const cp = this.camera.position,
        ct = this.controls.target;
      if (!this._camPrev) {
        this._camPrev = { p: cp.clone(), t: ct.clone() };
        this._camStillSince = nowS;
      }
      if (cp.distanceToSquared(this._camPrev.p) > 0.0009 || ct.distanceToSquared(this._camPrev.t) > 0.0009) {
        this._camPrev.p.copy(cp);
        this._camPrev.t.copy(ct);
        this._camStillSince = nowS;
      }
      if (nowS - this._camStillSince > 0.3) budget = 1 / 30;
    }
    const dt = this.pacer.step(nowMs, budget);
    if (dt === null) return;
    this.time += dt;
    for (const update of this.frameListeners) update(nowMs, dt);
    this.tick(dt);
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.labelScene, this.camera);
    // PERF (§16): frame hook for the ?fpslog=1 evidence recorder — fired once
    // per RENDERED frame (after both renderers), so frame-time statistics
    // measure the real render cadence — including multi-second stalls and
    // the 30fps calm cap — never a private rAF clock. Absent subscriber =
    // one property read per frame.
    const fh = window.__hormuzFrameHook;
    if (typeof fh === 'function') { try { fh(performance.now()); } catch { /* a recorder must never break rendering */ } }
  };
  tick(dt) {
    const ctl = this.controls;
    // fly animation
    if (this.fly) {
      const f = this.fly;
      f.t += dt / f.dur;
      const k = f.t >= 1 ? 1 : 1 - Math.pow(1 - f.t, 3);
      const sph = new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(ctl.target));
      if (f.fromP === undefined) f.fromP = sph.phi;
      ctl.target.lerpVectors(f.fromT, f.toT, k);
      const d = Math.exp(lerp(Math.log(f.fromD), Math.log(f.toD), k));
      sph.radius = d;
      sph.phi = lerp(f.fromP, this.polarFor(f.toD), k);
      this.camera.position.copy(ctl.target).add(new THREE.Vector3().setFromSpherical(sph));
      if (f.t >= 1) this.fly = null;
    }
    let dist = this.distance();
    ctl.maxPolarAngle = lerp(1.28, 0.75, smoothstep(20, this.fitDistance * 0.9, dist));
    ctl.panSpeed = 1;
    ctl.update();
    // clamp pan inside map
    const t = ctl.target;
    const mx = WIDTH / 2 - 4,
      mz = HEIGHT / 2 - 4;
    const cx = clamp(t.x, -mx, mx),
      cz = clamp(t.z, -mz, mz);
    if (cx !== t.x || cz !== t.z) {
      const dx = cx - t.x,
        dz = cz - t.z;
      t.x = cx;
      t.z = cz;
      this.camera.position.x += dx;
      this.camera.position.z += dz;
    }
    // keep camera above terrain
    if (this.field) {
      const gh = Math.max(0, this.field.height(this.camera.position.x, this.camera.position.z)) + 0.6;
      if (this.camera.position.y < gh) this.camera.position.y = gh;
    }
    dist = this.distance();
    const near = clamp(dist * 0.015, 0.03, 6);
    if (Math.abs(near - this.camera.near) > 0.01) {
      this.camera.near = near;
      this.camera.updateProjectionMatrix();
    }
    const lvl = dist > this.fitDistance * 0.45 ? 0 : dist > 22 ? 1 : 2;
    if (lvl !== this.lastZoomLevel) {
      this.lastZoomLevel = lvl;
    }
    this.cb.onZoom?.(dist, lvl);
    this.laneScale.value = clamp(dist / 40, 0.45, 3.4);
    this.updateEnvironment(dt, dist);
    this.updateAnimations(dt, dist);
    if (this.time - this._labelCullAt > 0.25) {
      this._labelCullAt = this.time;
      this.updateLabelViewCulling();
    }
    this.updateLabels(dist);
    if (this.selected) {
      const v = new THREE.Vector3(this.selected.x, this.selected.y + 0.4, this.selected.z).project(this.camera);
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.cb.onScreenPos?.((v.x * 0.5 + 0.5) * rect.width, (-v.y * 0.5 + 0.5) * rect.height, v.z < 1);
    }
  }
  /* VIS2 (D-021): night lamps FADE with the day/night blend instead of
   * popping at the old `night > 0.45` threshold — with the 20 s gradual
   * transition a hard toggle would be the one remaining snap in the
   * whole lighting rig. Each registered object's fade-capable materials
   * are collected once (lazily, cached on the object): sprites and
   * already-transparent/additive materials — every lamp in the game is
   * one of those and owns its material (glowSprite / nightLamp /
   * gamesync attachNightLamps all create per-lamp materials). Base
   * opacity is stamped on the material the first time it is seen.
   * An object with no fade-capable material keeps the legacy
   * visibility toggle as a fallback. Visibility still turns fully off
   * at fade≈0, so daytime draw cost is unchanged. */
  applyNightFade(night) {
    const fade = smoothstep(0.15, 0.8, night);
    for (const o of this.nightObjs) {
      if (o.userData.__fadeMats === undefined) {
        const mats = [];
        o.traverse(n => {
          if (!n.material) return;
          for (const m of Array.isArray(n.material) ? n.material : [n.material]) {
            if (n.isSprite || m.transparent || m.blending === THREE.AdditiveBlending) {
              if (m.userData.__nb === undefined) m.userData.__nb = m.opacity;
              mats.push(m);
            }
          }
        });
        o.userData.__fadeMats = mats;
      }
      const mats = o.userData.__fadeMats;
      if (mats.length) {
        for (const m of mats) m.opacity = m.userData.__nb * fade;
        o.visible = fade > 0.02;
      } else {
        o.visible = night > 0.45;
      }
    }
  }
  updateEnvironment(dt, dist) {
    if (this.autoTime) this.hours = (this.hours + dt * 0.4) % 24; // 1 game hour = 2.5 s
    this.storm += (this.stormTarget - this.storm) * Math.min(1, dt * 0.8);
    const a = (this.hours - 6) / 12 * Math.PI;
    const elev = Math.sin(a);
    const sunDir = new THREE.Vector3(Math.cos(a) * 0.85, Math.max(elev, 0.04), 0.5).normalize();
    const night = 1 - smoothstep(-0.12, 0.16, elev);
    this.night = night;
    const dusk = (1 - smoothstep(0.0, 0.4, Math.abs(elev))) * (1 - night * 0.6);
    const storm = this.storm;
    if (storm > 0.5 && Math.random() < dt * 0.25) this.flash = 1;
    this.flash = Math.max(0, this.flash - dt * 3);
    const sunCol = new THREE.Color('#fff4dc').lerp(new THREE.Color('#ff9a4a'), dusk);
    this.sun.color.copy(sunCol);
    this.sun.intensity = (1 - night) * 2.6 * (1 - storm * 0.65);
    this.moon.intensity = night * 0.9;
    this.moon.position.set(-60, 120, -40).add(this.controls.target);
    this.moon.target.position.copy(this.controls.target);
    this.hemi.intensity = lerp(1.0, 0.4, night) * (1 - storm * 0.3) + this.flash * 2.5;
    this.hemi.color.set(night > 0.5 ? '#5a74b5' : '#bfe3ff');
    // VIS2 (D-025): the procedural env map (buildEnvironment) is a
    // daylight sky — fade its contribution with the same night factor
    // so models are not day-lit at midnight.
    if ('environmentIntensity' in this.scene) this.scene.environmentIntensity = lerp(0.5, 0.12, night);

    // shadows follow the camera target; disabled when far.
    // PERF: the frustum is already limited to the current view; quantize its size
    // to 0.5 steps and re-apply at most every 150ms so smooth zooms don't churn
    // the shadow camera (and its projection) every single frame.
    const S = Math.round(clamp(dist * 0.7, 3, 60) * 2) / 2;
    const sc = this.sun.shadow.camera;
    // VIS2 (D-025): cast shadows are ON at the opening framing too
    // (dist 120). v0.5.0 gated them to dist<80, so the game's default
    // view had no cast shadows at all and every model floated (audit2
    // team 6, top visual finding). The shadow window still caps at
    // ±60 units around the camera target, which bounds the caster
    // pass; the night gate stays — at full night the sun's intensity
    // is ~0, so a shadow pass there would buy nothing.
    this.sun.castShadow = night < 0.9;
    if (sc.right !== S && this.time - this._shadowCamAt > 0.15) {
      this._shadowCamAt = this.time;
      sc.left = -S;
      sc.right = S;
      sc.top = S;
      sc.bottom = -S;
      sc.near = 1;
      sc.far = 200;
      sc.updateProjectionMatrix();
    }
    this.sun.target.position.copy(this.controls.target);
    this.sun.position.copy(this.controls.target).addScaledVector(sunDir, 80);
    const dayTop = new THREE.Color('#3d7cc9'),
      dayHor = new THREE.Color('#cfe6f5');
    const duskTop = new THREE.Color('#3b4a8a'),
      duskHor = new THREE.Color('#ffb27a');
    const nightTop = new THREE.Color('#02060f'),
      nightHor = new THREE.Color('#0b1a33');
    const stormTop = new THREE.Color('#3b4651'),
      stormHor = new THREE.Color('#7d8a94');
    const top = dayTop.clone().lerp(duskTop, dusk).lerp(nightTop, night).lerp(stormTop.clone().multiplyScalar(1 - night * 0.8), storm * 0.8);
    const hor = dayHor.clone().lerp(duskHor, dusk).lerp(nightHor, night).lerp(stormHor.clone().multiplyScalar(1 - night * 0.8), storm * 0.8);
    if (this.flash > 0) {
      top.lerp(new THREE.Color('#dfe8ff'), this.flash * 0.5);
      hor.lerp(new THREE.Color('#dfe8ff'), this.flash * 0.5);
    }
    this.skyMat.uniforms.uTop.value.copy(top);
    this.skyMat.uniforms.uHorizon.value.copy(hor);
    const fog = this.scene.fog;
    fog.color.copy(hor);
    // VIS2 (D-025): base density 0.0012 -> 0.0008. At theater distance
    // (~700) the old density washed ~50% of the scene to fog color and
    // the textureless land read as white blobs (audit2 team 6, F5);
    // now ~27%. Close-range depth cueing is barely affected (at the
    // 120-unit opening the factor is ~1%) — the strait core reads its
    // depth from the sky/water gradients, as it already did.
    fog.density = 0.0008 + storm * 0.006 * (dist < 120 ? 1 : 0.5);
    this.waterU.uFogColor.value.copy(hor);
    this.waterU.uFogDensity.value = fog.density;
    this.waterU.uTime.value = this.time;
    this.waterU.uSunDir.value.copy(night > 0.5 ? new THREE.Vector3(-0.4, 0.8, -0.3).normalize() : sunDir);
    this.waterU.uSunColor.value.copy(night > 0.5 ? new THREE.Color('#9db8ff').multiplyScalar(0.5) : sunCol.clone().multiplyScalar(1 - storm * 0.8));
    this.waterU.uSky.value.copy(hor);
    this.waterU.uNight.value = night * 0.85;
    this.waterU.uStorm.value = storm;
    this.stars.material.opacity = night * (1 - storm);
    this.buildingMat.emissiveIntensity = night * 1.1;
    MATS.lamp.emissiveIntensity = night * 2;
    this.cityLights.material.opacity = night * 0.9;
    this.cityLights.material.size = clamp(dist * 0.004, 0.18, 1.1);
    this.applyNightFade(night);
    this.renderer.toneMappingExposure = 1.05 + night * 0.25;

    // clouds: visible mostly when zoomed out
    const cOp = smoothstep(55, 140, dist) * (1 - night * 0.6);
    for (const c of this.clouds) {
      c.position.x += dt * 1.2;
      if (c.position.x > WIDTH * 0.6) c.position.x = -WIDTH * 0.6;
      const m = c.material;
      m.opacity = (c.userData.base + storm * 0.4) * cOp;
      m.color.set(storm > 0.3 ? '#8a939b' : night > 0.5 ? '#4d5a70' : dusk > 0.4 ? '#ffd2b0' : '#ffffff');
    }

    // rain
    this.rain.visible = storm > 0.05 && dist < 110;
    if (this.rain.visible) {
      const Sx = clamp(dist * 1.3, 5, 90),
        Sy = Sx * 0.7,
        len = Sx * 0.025;
      const arr = this.rain.geometry.attributes.position.array;
      const tg = this.controls.target;
      const N = this.rainBase.length / 3;
      for (let i = 0; i < N; i++) {
        let y = this.rainBase[i * 3 + 1] - dt * 1.4;
        if (y < 0) y += 1;
        this.rainBase[i * 3 + 1] = y;
        const x = tg.x + this.rainBase[i * 3] * Sx,
          z = tg.z + this.rainBase[i * 3 + 2] * Sx,
          yy = y * Sy;
        arr[i * 6] = x;
        arr[i * 6 + 1] = yy;
        arr[i * 6 + 2] = z;
        arr[i * 6 + 3] = x + len * 0.25;
        arr[i * 6 + 4] = yy - len;
        arr[i * 6 + 5] = z;
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
      this.rain.material.opacity = 0.45 * storm;
    }
  }
  updateAnimations(dt, dist) {
    const tm = this.time;
    for (const m of this.laneMats) {
      m.uniforms.uTime.value = tm;
      if (m.uniforms.uMode.value === 0) m.uniforms.uBoost.value += ((this.wavePreview ? 1 : 0) - m.uniforms.uBoost.value) * Math.min(1, dt * 3);
    }
    for (const f of this.flickers) {
      const s = f.userData.flicker;
      const k = 0.85 + Math.sin(tm * 17 + f.id) * 0.08 + Math.sin(tm * 31 + f.id * 3) * 0.07;
      if (f.userData.glow) f.scale.setScalar(s * k);else f.scale.set(s * 0.7 * (2 - k), s * k, 1);
    }
    for (const s of this.spinners) s.rotation.y += dt * s.userData.spin;
    for (const p of this.pulses) {
      const m = p.material;
      m.opacity = 0.55 + Math.sin(tm * 3 + p.id) * 0.3;
    }
    for (const p of this.ewPulses) {
      const k = (tm * 0.6 + p.id * 0.1) % 1;
      p.scale.setScalar(1 + k * 9);
      p.material.opacity = 0.6 * (1 - k);
    }
    // turret aiming: track nearest preview enemy in range, else idle scan
    const enemies = this.wavePreview ? this.movers.filter(m => m.enemy) : [];
    for (const a of this.aimers) {
      let best = null,
        bd = a.range;
      for (const e of enemies) {
        const d = Math.hypot(e.obj.position.x - a.x, e.obj.position.z - a.z);
        if (d < bd) {
          bd = d;
          best = e.obj;
        }
      }
      let targetAng;
      if (best) targetAng = Math.atan2(best.position.x - a.x, best.position.z - a.z);else targetAng = a.obj.rotation.y + dt * 0.3 * Math.sin(tm * 0.3 + a.x);
      let diff = targetAng - a.obj.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      a.obj.rotation.y += diff * Math.min(1, dt * (best ? 6 : 2));
    }
    // pop-in animation for new builds
    for (const s of this.slots.values()) {
      const o = s.built?.obj;
      if (o && o.userData.pop !== undefined && o.userData.pop < 1) {
        o.userData.pop = Math.min(1, o.userData.pop + dt * 2.5);
        const k = o.userData.pop;
        const base = s.built.type === 'oilrig' || s.built.type === 'seaplatform' ? 1 : [1, 1.12, 1.25][s.built.tier - 1];
        o.scale.setScalar(base * (k < 0.7 ? k / 0.7 * 1.15 : 1.15 - (k - 0.7) / 0.3 * 0.15));
      }
      // slot icons only when near enough
      s.icon.visible = !s.built && dist < 115;
      if (s.icon.visible) s.icon.position.y = 0.75 + Math.sin(tm * 2 + s.x) * 0.06;
    }
    // ships
    for (const m of this.movers) {
      if (m.enemy && !this.wavePreview) continue;
      const sp = m.speed * (1 - this.storm * 0.3);
      if (m.loop) {
        m.t = (m.t + dt * sp / m.len) % 1;
      } else {
        m.t += dt * sp / m.len * (m.obj.userData.dir ?? 1);
        if (m.t > 1) {
          m.t = 1;
          m.obj.userData.dir = -1;
        }
        if (m.t < 0) {
          m.t = 0;
          m.obj.userData.dir = 1;
        }
      }
      const pt = m.curve.getPointAt(m.t);
      const tg = m.curve.getTangentAt(m.t);
      const dir = m.obj.userData.dir === -1 ? -1 : 1;
      m.obj.position.set(pt.x, 0.0 + Math.sin(tm * 2 + m.t * 50) * 0.01, pt.z);
      m.obj.rotation.y = Math.atan2(tg.x * dir, tg.z * dir);
      m.obj.rotation.z = Math.sin(tm * 1.5 + m.t * 30) * 0.03 * (1 + this.storm * 3);
    }
  }
  /** PERF (§16.6): gamesync reports the live enemy count; in heavy battles
   *  (>12 enemies) minor map labels (tier 2/3) are hidden entirely. The state
   *  is a dead band (hide >12, show again <=9) so counts hovering at the
   *  threshold do not flicker ~125 minor labels on every spawn/kill. */
  setBattleDensity(n) {
    this.battleDensity = n | 0;
    if (this.battleDensity > 12) this.heavyLabels = true;
    else if (this.battleDensity <= 9) this.heavyLabels = false;
  }
  /** PERF (§16.6): refresh which labels are outside the camera frustum (checked
   *  at ~250ms cadence from tick, not per frame). Off-view labels get
   *  visible=false, so the CSS2D renderer skips their per-frame transform
   *  writes entirely instead of projecting 72 elements every frame. */
  updateLabelViewCulling() {
    const v = this._labelVec ?? (this._labelVec = new THREE.Vector3());
    for (const l of this.labels) {
      l.obj.getWorldPosition(v);
      v.project(this.camera);
      l.offView = !(v.z < 1 && Math.abs(v.x) < 1.08 && Math.abs(v.y) < 1.08);
    }
  }
  updateLabels(dist) {
    if (this.labelRenderer && this.labelRenderer.domElement) this.labelRenderer.domElement.classList.toggle('labels-far', dist > 175);
    const heavyBattle = this.heavyLabels;
    for (const l of this.labels) {
      let vis = true,
        op = 1;
      switch (l.tier) {
        case 0:
          vis = dist > 22;
          op = smoothstep(22, 45, dist);
          break;
        case 1:
          vis = dist < 240 && dist > 3;
          op = 1 - smoothstep(195, 240, dist);
          break;
        case 2:
          vis = dist < 85;
          op = 1 - smoothstep(62, 85, dist);
          break;
        case 3:
          vis = dist < 40;
          op = 1 - smoothstep(28, 40, dist);
          break;
      }
      if (heavyBattle && l.tier >= 2) vis = false;
      if (l.offView) vis = false;
      if (l.obj.parent && !l.obj.parent.visible) vis = false;
      l.obj.visible = vis && op > 0.02;
      l.obj.element.style.opacity = String(op);
    }
    for (const z of this.zoneLabels) z.visible = this.layerOn.zones && dist > 12;
  }
  dispose() {
    this.disposed = true;
    this.syncFrameLoop();
    this.frameListeners.clear();
    document.removeEventListener('visibilitychange', this.syncFrameLoop);
    window.removeEventListener(nativeVisibilityEvent, this.syncFrameLoop);
    window.removeEventListener('resize', this.onResize);
    this._ro?.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('webglcontextlost', this.onContextLost);
    canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    canvas.removeEventListener('pointerdown', this.onDown);
    canvas.removeEventListener('pointerup', this.onUp);
    canvas.removeEventListener('pointermove', this.onMove);
    this.controls.dispose();
    disposeSceneAssets(this.scene);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.labelRenderer.domElement.remove();
  }
}
export { project };

// === App.tsx ===

const fa = n => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]);
const LEVELS = ['استراتژیک', 'عملیاتی', 'تاکتیکی'];
const LAYER_UI = [{
  key: 'enemy',
  label: 'مسیر دشمن',
  icon: '💀'
}, {
  key: 'trade',
  label: 'لاین تجاری',
  icon: '🚢'
}, {
  key: 'slots',
  label: 'جایگاه برجک',
  icon: '🛡️'
}, {
  key: 'ships',
  label: 'کشتی‌ها',
  icon: '⛴️'
}, {
  key: 'labels',
  label: 'نام‌ها',
  icon: '🏷️'
}, {
  key: 'zones',
  label: 'مناطق عملیاتی',
  icon: '🗺️'
}, {
  key: 'clouds',
  label: 'ابرها',
  icon: '☁️'
}];
function App() {
  const hostRef = useRef(null);
  const mapRef = useRef(null);
  const radialRef = useRef(null);
  const coordRef = useRef(null);
  const [progress, setProgress] = useState({
    msg: 'در حال آماده‌سازی…',
    pct: 0
  });
  const [ready, setReady] = useState(false);
  const [level, setLevel] = useState(0);
  const [sel, setSel] = useState(null);
  const [layers, setLayers] = useState({
    enemy: true,
    trade: true,
    slots: true,
    labels: true,
    zones: false,
    clouds: true,
    ships: true
  });
  const [hours, setHours] = useState(10.5);
  const [autoTime, setAutoTime] = useState(false);
  const [storm, setStorm] = useState(false);
  const [wave, setWave] = useState(false);
  const [panel, setPanel] = useState(false);
  const [builtCount, setBuiltCount] = useState(0);
  const [totalSlots, setTotalSlots] = useState(0);
  useEffect(() => {
    if (!hostRef.current) return;
    const map = new HormuzMap(hostRef.current, {
      onProgress: (msg, pct) => setProgress({
        msg,
        pct
      }),
      onReady: () => {
        setTotalSlots(map.getSlots().length);
        // demo: a few pre-built defenses
        map.build('HRZ-1', 'missile', 2);
        map.build('HRZ-4', 'autocannon', 3);
        map.build('LRK-2', 'ew', 2);
        map.build('QSM-1', 'airdef', 1);
        map.build('BND-3', 'howitzer', 2);
        map.build('SEA-M1', 'oilrig', 2);
        map.build('SEA-E1', 'seaplatform', 1);
        map.build('TNB-1', 'missile', 2);
        map.build('ABM-1', 'airdef', 2);
        map.build('KSH-1', 'ew', 2);
        map.build('LVN-1', 'autocannon', 2);
        map.build('KRG-1', 'missile', 3);
        setBuiltCount(map.getSlots().filter(s => s.built).length);
        setTimeout(() => setReady(true), 300);
      },
      onSelect: s => setSel(s),
      onHover: (lat, lon) => {
        if (coordRef.current) coordRef.current.textContent = `${lat.toFixed(3)}°N · ${lon.toFixed(3)}°E`;
      },
      onZoom: (_d, l) => setLevel(prev => prev === l ? prev : l),
      onScreenPos: (x, y, vis) => {
        const el = radialRef.current;
        if (!el) return;
        el.style.transform = `translate(${x}px, ${y}px)`;
        el.style.opacity = vis ? '1' : '0';
      }
    });
    mapRef.current = map;
    window.__map = map;
    map.init();
    return () => map.dispose();
  }, []);
  useEffect(() => {
    if (!autoTime) return;
    const id = setInterval(() => mapRef.current && setHours(mapRef.current.hours), 250);
    return () => clearInterval(id);
  }, [autoTime]);
  const m = () => mapRef.current;
  const toggleLayer = k => {
    const v = !layers[k];
    setLayers({
      ...layers,
      [k]: v
    });
    m().setLayer(k, v);
  };
  const doBuild = t => {
    if (!sel) return;
    m().build(sel.id, t, 1);
    m().previewRange(null);
    setBuiltCount(m().getSlots().filter(s => s.built).length);
  };
  const options = sel ? CATALOG.filter(c => sel.kind === 'land' ? c.where !== 'sea' : c.where !== 'land') : [];
  const night = hours < 6 || hours > 18.5;
  return /*#__PURE__*/React.createElement("div", {
    dir: "rtl",
    className: "fixed inset-0 overflow-hidden bg-[#06121f] text-white select-none",
    style: {
      fontFamily: 'Vazirmatn, Tahoma, sans-serif',
      position: 'fixed',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      width: '100vw',
      height: '100vh'
    }
  }, /*#__PURE__*/React.createElement("div", {
    ref: hostRef,
    className: "absolute inset-0",
    style: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      width: "100%",
      height: "100%"
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pointer-events-auto rounded-2xl border border-cyan-300/20 bg-slate-950/70 px-4 py-2.5 shadow-xl backdrop-blur-md"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-xl"
  }, "\u2693"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    className: "text-sm font-extrabold leading-tight sm:text-base"
  }, "\u0646\u0642\u0634\u0647 \u062A\u0627\u06A9\u062A\u06CC\u06A9\u06CC \u062A\u0646\u06AF\u0647 \u0647\u0631\u0645\u0632"), /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] text-cyan-200/70 sm:text-[11px]"
  }, "\u0641\u0631\u0645\u0627\u0646\u0631\u0648\u0627\u06CC\u06CC \u0622\u0628\u200C\u0647\u0627\u06CC \u0622\u0632\u0627\u062F \xB7 Map Engine v1"))), /*#__PURE__*/React.createElement("div", {
    className: "mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-300"
  }, /*#__PURE__*/React.createElement("span", {
    className: "rounded-full bg-cyan-400/15 px-2 py-0.5 text-cyan-200"
  }, "\u0628\u0632\u0631\u06AF\u200C\u0646\u0645\u0627\u06CC\u06CC: ", LEVELS[level]), /*#__PURE__*/React.createElement("span", {
    className: "rounded-full bg-amber-400/15 px-2 py-0.5 text-amber-200"
  }, "\u0628\u0631\u062C\u06A9\u200C\u0647\u0627: ", fa(builtCount), "/", fa(totalSlots)), /*#__PURE__*/React.createElement("span", {
    dir: "ltr",
    ref: coordRef,
    className: "hidden font-mono text-slate-400 sm:inline"
  }))), /*#__PURE__*/React.createElement("button", {
    onClick: () => setPanel(!panel),
    className: "pointer-events-auto rounded-2xl border border-cyan-300/20 bg-slate-950/70 px-3 py-2.5 text-sm font-bold shadow-xl backdrop-blur-md hover:bg-slate-800/80"
  }, panel ? '✕ بستن' : '⚙️ لایه‌ها و محیط')), panel && /*#__PURE__*/React.createElement("div", {
    className: "absolute left-3 top-[76px] z-20 w-[min(300px,calc(100vw-24px))] rounded-2xl border border-cyan-300/20 bg-slate-950/85 p-3 shadow-2xl backdrop-blur-md"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "mb-2 text-xs font-bold text-cyan-200"
  }, "\u0644\u0627\u06CC\u0647\u200C\u0647\u0627\u06CC \u0646\u0642\u0634\u0647"), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 gap-1.5"
  }, LAYER_UI.map(l => /*#__PURE__*/React.createElement("button", {
    key: l.key,
    onClick: () => toggleLayer(l.key),
    className: `flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-[11px] transition ${layers[l.key] ? 'bg-cyan-500/25 text-white ring-1 ring-cyan-300/40' : 'bg-slate-800/60 text-slate-400'}`
  }, /*#__PURE__*/React.createElement("span", null, l.icon), l.label))), /*#__PURE__*/React.createElement("h3", {
    className: "mb-1 mt-3 text-xs font-bold text-cyan-200"
  }, "\u0632\u0645\u0627\u0646 \u0631\u0648\u0632: ", fa(Math.floor(hours).toString().padStart(2, '0')), ":", fa(Math.floor(hours % 1 * 60).toString().padStart(2, '0')), " ", night ? '🌙' : '☀️'), /*#__PURE__*/React.createElement("input", {
    type: "range",
    min: 0,
    max: 24,
    step: 0.05,
    value: hours,
    onChange: e => {
      const v = +e.target.value;
      setHours(v);
      m().setTime(v);
    },
    className: "w-full accent-cyan-400",
    dir: "ltr"
  }), /*#__PURE__*/React.createElement("div", {
    className: "mt-2 grid grid-cols-2 gap-1.5 text-[11px]"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setAutoTime(!autoTime);
      m().setAutoTime(!autoTime);
    },
    className: `rounded-xl px-2 py-1.5 ${autoTime ? 'bg-indigo-500/40 ring-1 ring-indigo-300/50' : 'bg-slate-800/60'}`
  }, "\uD83D\uDD04 \u0686\u0631\u062E\u0647 \u0634\u0628 \u0648 \u0631\u0648\u0632"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setStorm(!storm);
      m().setStorm(!storm);
    },
    className: `rounded-xl px-2 py-1.5 ${storm ? 'bg-slate-400/40 ring-1 ring-slate-200/50' : 'bg-slate-800/60'}`
  }, "\u26C8\uFE0F \u0637\u0648\u0641\u0627\u0646 \u0645\u0648\u0646\u0633\u0648\u0646"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setHours(12);
      m().setTime(12);
    },
    className: "rounded-xl bg-slate-800/60 px-2 py-1.5"
  }, "\u2600\uFE0F \u0638\u0647\u0631"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setHours(22);
      m().setTime(22);
    },
    className: "rounded-xl bg-slate-800/60 px-2 py-1.5"
  }, "\uD83C\uDF19 \u0634\u0628")), /*#__PURE__*/React.createElement("p", {
    className: "mt-3 text-[10px] leading-5 text-slate-400"
  }, "\u062F\u0627\u062F\u0647 \u062E\u0637 \u0633\u0627\u062D\u0644\u06CC: Natural Earth 1:10m (\u0648\u0627\u0642\u0639\u06CC). \u0627\u0631\u062A\u0641\u0627\u0639\u0627\u062A \u0628\u0647\u200C\u0635\u0648\u0631\u062A \u0631\u0648\u06CC\u0647\u200C\u0627\u06CC \u0628\u0627 \u0627\u063A\u0631\u0627\u0642 \u0639\u0645\u0648\u062F\u06CC \u0633\u0627\u062E\u062A\u0647 \u0634\u062F\u0647\u200C\u0627\u0646\u062F.")), /*#__PURE__*/React.createElement("div", {
    className: "absolute right-3 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-1.5"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => m().zoomBy(0.55),
    className: "tool-btn"
  }, "+"), /*#__PURE__*/React.createElement("button", {
    onClick: () => m().zoomBy(1.8),
    className: "tool-btn"
  }, "\u2212"), /*#__PURE__*/React.createElement("div", {
    className: "my-1 h-px bg-cyan-300/20"
  }), LEVELS.map((l, i) => /*#__PURE__*/React.createElement("button", {
    key: l,
    onClick: () => m().zoomLevel(i),
    className: `tool-btn text-[10px] ${level === i ? 'ring-2 ring-cyan-300 bg-cyan-500/30' : ''}`,
    title: l
  }, fa(i + 1), "x")), /*#__PURE__*/React.createElement("div", {
    className: "my-1 h-px bg-cyan-300/20"
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => m().resetNorth(),
    className: "tool-btn",
    title: "\u0634\u0645\u0627\u0644"
  }, "\uD83E\uDDED")), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setWave(!wave);
      m().setWavePreview(!wave);
    },
    className: `absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-2xl border px-3 py-3 text-xs font-bold shadow-xl backdrop-blur-md transition ${wave ? 'border-red-400/70 bg-red-600/60 animate-pulse' : 'border-red-400/30 bg-slate-950/70 hover:bg-red-900/50'}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-2xl"
  }, "\uD83D\uDC80"), /*#__PURE__*/React.createElement("div", {
    className: "mt-1 leading-4"
  }, wave ? 'توقف' : 'پیش‌نمایش', /*#__PURE__*/React.createElement("br", null), "\u0645\u0648\u062C \u062F\u0634\u0645\u0646")), /*#__PURE__*/React.createElement("div", {
    className: "absolute inset-x-0 bottom-0 z-10 p-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "no-scrollbar flex gap-2 overflow-x-auto pb-1"
  }, ZONES.map(z => /*#__PURE__*/React.createElement("button", {
    key: z.id,
    onClick: () => m().flyToLL(z.ll, z.dist),
    className: "shrink-0 rounded-2xl border border-amber-300/25 bg-slate-950/75 px-3 py-2 text-right shadow-lg backdrop-blur-md hover:border-amber-300/60 hover:bg-slate-900/80"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: "grid h-6 w-6 place-items-center rounded-full bg-amber-400 text-xs font-black text-slate-900"
  }, fa(z.id)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "text-xs font-bold"
  }, z.name), /*#__PURE__*/React.createElement("div", {
    className: "text-[10px] text-slate-400"
  }, z.sub))))))), sel && /*#__PURE__*/React.createElement("div", {
    ref: radialRef,
    className: "pointer-events-none absolute left-0 top-0 z-30",
    style: {
      transition: 'opacity .15s'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "relative -translate-x-1/2 -translate-y-1/2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "radial-ring"
  }), (sel.built ? builtActions(sel) : options.map(o => ({
    key: o.type,
    icon: o.icon,
    label: o.name,
    sub: `${o.targets}`,
    color: o.color,
    onHover: () => m().previewRange(o.type, 1),
    run: () => doBuild(o.type)
  }))).map((a, i, arr) => {
    const ang = -Math.PI / 2 + i / arr.length * Math.PI * 2;
    const R = arr.length > 4 ? 86 : 74;
    return /*#__PURE__*/React.createElement("button", {
      key: a.key,
      className: "radial-btn pointer-events-auto",
      style: {
        transform: `translate(${Math.cos(ang) * R}px, ${Math.sin(ang) * R}px)`,
        borderColor: a.color,
        animationDelay: `${i * 30}ms`
      },
      onMouseEnter: a.onHover,
      onMouseLeave: () => m().previewRange(null),
      onClick: a.run
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-lg leading-none"
    }, a.icon), /*#__PURE__*/React.createElement("span", {
      className: "radial-tip"
    }, /*#__PURE__*/React.createElement("b", null, a.label), /*#__PURE__*/React.createElement("small", null, a.sub)));
  }), /*#__PURE__*/React.createElement("button", {
    className: "radial-center pointer-events-auto",
    onClick: () => m().select(null),
    title: "\u0628\u0633\u062A\u0646"
  }, "\u2715"))), sel && /*#__PURE__*/React.createElement("div", {
    className: "absolute bottom-[86px] right-3 z-20 w-[min(280px,calc(100vw-24px))] rounded-2xl border border-cyan-300/25 bg-slate-950/85 p-3 shadow-2xl backdrop-blur-md"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "text-xs text-slate-400"
  }, sel.kind === 'land' ? '🛡️ جایگاه برجک ساحلی' : '🛢️ جایگاه سکوی دریایی'), /*#__PURE__*/React.createElement("div", {
    className: "text-sm font-extrabold"
  }, sel.area, " \xB7 ", /*#__PURE__*/React.createElement("span", {
    dir: "ltr",
    className: "font-mono text-cyan-300"
  }, sel.id))), /*#__PURE__*/React.createElement("button", {
    onClick: () => m().select(null),
    className: "rounded-lg bg-slate-800 px-2 py-1 text-xs"
  }, "\u2715")), /*#__PURE__*/React.createElement("div", {
    dir: "ltr",
    className: "mt-1 text-right font-mono text-[10px] text-slate-500"
  }, sel.lat.toFixed(4), "\xB0N ", sel.lon.toFixed(4), "\xB0E"), sel.built ? /*#__PURE__*/React.createElement("div", {
    className: "mt-2 rounded-xl bg-slate-800/60 p-2 text-xs"
  }, /*#__PURE__*/React.createElement("div", {
    className: "font-bold"
  }, catalogOf(sel.built.type).icon, " ", catalogOf(sel.built.type).name, " ", /*#__PURE__*/React.createElement("span", {
    className: "text-amber-300"
  }, "\xB7 \u0633\u0637\u062D ", fa(sel.built.tier))), /*#__PURE__*/React.createElement("div", {
    className: "mt-0.5 text-[10px] text-slate-400"
  }, catalogOf(sel.built.type).en, " \xB7 \u0627\u0647\u062F\u0627\u0641: ", catalogOf(sel.built.type).targets), /*#__PURE__*/React.createElement("div", {
    className: "mt-1 flex gap-1"
  }, [1, 2, 3].map(t => /*#__PURE__*/React.createElement("span", {
    key: t,
    className: `h-1.5 flex-1 rounded-full ${t <= sel.built.tier ? 'bg-amber-400' : 'bg-slate-700'}`
  }))), sel.built.tier === 3 && /*#__PURE__*/React.createElement("div", {
    className: "mt-1.5 text-[10px] text-amber-200"
  }, "\u2B50 \u0622\u0645\u0627\u062F\u0647 \u0627\u0646\u0634\u0639\u0627\u0628 \u0628\u0647 \u0628\u0631\u062C \u0648\u06CC\u0698\u0647 \u0633\u0637\u062D \u06F4 (\u062F\u0631 \u0645\u0648\u062A\u0648\u0631 \u0628\u0627\u0632\u06CC)")) : /*#__PURE__*/React.createElement("div", {
    className: "mt-2 text-[11px] text-slate-300"
  }, "\u06CC\u06A9\u06CC \u0627\u0632 \u06AF\u0632\u06CC\u0646\u0647\u200C\u0647\u0627\u06CC \u0645\u0646\u0648\u06CC \u062F\u0627\u06CC\u0631\u0647\u200C\u0627\u06CC \u0631\u0627 \u0628\u0631\u0627\u06CC \u0633\u0627\u062E\u062A \u0627\u0646\u062A\u062E\u0627\u0628 \u06A9\u0646\u06CC\u062F. \u062F\u0627\u06CC\u0631\u0647 \u0622\u0628\u06CC = \u0628\u0631\u062F.")), !ready && /*#__PURE__*/React.createElement("div", {
    className: "absolute inset-0 z-50 grid place-items-center bg-[radial-gradient(ellipse_at_center,#0b2a45_0%,#050d18_70%)]"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-[min(420px,86vw)] text-center"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-3 text-5xl"
  }, "\uD83C\uDF0A"), /*#__PURE__*/React.createElement("h2", {
    className: "text-xl font-black"
  }, "\u062A\u0646\u06AF\u0647 \u0647\u0631\u0645\u0632"), /*#__PURE__*/React.createElement("p", {
    className: "mb-6 text-xs text-cyan-200/70"
  }, "Strait of Hormuz \xB7 Sovereign of the High Seas"), /*#__PURE__*/React.createElement("div", {
    className: "h-2 overflow-hidden rounded-full bg-slate-800"
  }, /*#__PURE__*/React.createElement("div", {
    className: "h-full rounded-full bg-gradient-to-l from-cyan-300 to-blue-500 transition-all duration-500",
    style: {
      width: `${progress.pct}%`
    }
  })), /*#__PURE__*/React.createElement("p", {
    className: "mt-3 text-xs text-slate-300"
  }, progress.msg))));
  function builtActions(s) {
    const b = s.built;
    const acts = [];
    if (b.tier < 3) acts.push({
      key: 'up',
      icon: '⬆️',
      label: `ارتقا به سطح ${fa(b.tier + 1)}`,
      sub: 'دلار + فولاد',
      color: '#ffc53d',
      onHover: () => m().previewRange(b.type, b.tier + 1),
      run: () => m().upgrade(s.id)
    });else acts.push({
      key: 'sp',
      icon: '⭐',
      label: 'انشعاب ویژه',
      sub: 'برج ویژه الف / ب',
      color: '#ffc53d',
      run: () => {
        m().flyTo(m().slots.get(s.id).x, m().slots.get(s.id).z, 6);
      }
    });
    acts.push({
      key: 'focus',
      icon: '🎯',
      label: 'تمرکز دوربین',
      sub: 'زوم تاکتیکی',
      color: '#3ee6ff',
      run: () => m().flyTo(m().slots.get(s.id).x, m().slots.get(s.id).z, 5)
    });
    acts.push({
      key: 'sell',
      icon: '💰',
      label: 'فروش / تخریب',
      sub: 'بازگشت ۶۰٪',
      color: '#ff5e57',
      run: () => {
        m().demolish(s.id);
        setBuiltCount(m().getSlots().filter(x => x.built).length);
      }
    });
    return acts;
  }
}


export { App };

export { HormuzMap };
