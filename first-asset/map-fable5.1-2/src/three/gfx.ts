// ============================================================
// gfx.ts — بافت‌های رویه‌ای، شیدر آب، پچ شیدر زمین
// ============================================================
import * as THREE from 'three';
import { mulberry } from './world';

// ---------- بافت‌های کانوسی ----------
export function canvasTex(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void, srgb = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  draw(ctx, size);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
export const makeGlowTex = () => canvasTex(128, (ctx, s) => {
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.2, 'rgba(255,255,255,0.8)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
});
export const makeFlameTex = () => canvasTex(128, (ctx, s) => {
  const g = ctx.createRadialGradient(s / 2, s * 0.65, 2, s / 2, s * 0.5, s * 0.5);
  g.addColorStop(0, 'rgba(255,255,235,1)'); g.addColorStop(0.25, 'rgba(255,205,90,0.95)');
  g.addColorStop(0.55, 'rgba(255,110,25,0.55)'); g.addColorStop(1, 'rgba(255,50,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
});
export const makeSmokeTex = () => canvasTex(128, (ctx, s) => {
  for (let i = 0; i < 9; i++) {
    const x = s * (0.3 + Math.random() * 0.4), y = s * (0.3 + Math.random() * 0.4), r = s * (0.18 + Math.random() * 0.15);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(235,235,235,0.35)'); g.addColorStop(1, 'rgba(235,235,235,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  }
});
export const makeCloudTex = (seed: number) => canvasTex(256, (ctx, s) => {
  const rnd = mulberry(seed);
  // سایه زیرین
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < 22; i++) {
      const x = s * (0.18 + rnd() * 0.64), y = s * (0.34 + rnd() * 0.32), r = s * (0.08 + rnd() * 0.14);
      const g = ctx.createRadialGradient(x, y - (pass ? r * 0.25 : -r * 0.15), 0, x, y, r);
      if (pass === 0) { g.addColorStop(0, 'rgba(170,182,200,0.55)'); g.addColorStop(1, 'rgba(170,182,200,0)'); }
      else { g.addColorStop(0, 'rgba(255,255,255,0.85)'); g.addColorStop(0.6, 'rgba(250,252,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); }
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
  }
});
export const makeWakeTex = () => canvasTex(128, (ctx, s) => {
  const g = ctx.createLinearGradient(0, 0, 0, s);
  g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(s * 0.4, 0); ctx.lineTo(s * 0.6, 0); ctx.lineTo(s, s); ctx.lineTo(0, s); ctx.closePath(); ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  const g2 = ctx.createLinearGradient(0, 0, s, 0);
  g2.addColorStop(0.3, 'rgba(0,0,0,0)'); g2.addColorStop(0.5, 'rgba(0,0,0,0.75)'); g2.addColorStop(0.7, 'rgba(0,0,0,0)');
  ctx.fillStyle = g2; ctx.fillRect(0, s * 0.15, s, s);
});
export const makeHelipadTex = () => canvasTex(128, (ctx, s) => {
  ctx.fillStyle = '#2c333b'; ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = '#f5d142'; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(s / 2, s / 2, s * 0.4, 0, 7); ctx.stroke();
  ctx.fillStyle = '#ffffff'; ctx.font = `900 ${s * 0.5}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('H', s / 2, s / 2 + 3);
});
export function makeIconTex(kind: 'defense' | 'oil' | 'city' | 'skull' | 'chevron' | 'ship'): THREE.CanvasTexture {
  return canvasTex(128, (ctx, s) => {
    const c = s / 2;
    if (kind === 'chevron' || kind === 'ship') {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      if (kind === 'chevron') { ctx.moveTo(c, 18); ctx.lineTo(c + 40, c + 34); ctx.lineTo(c, c + 14); ctx.lineTo(c - 40, c + 34); }
      else { ctx.moveTo(c, 16); ctx.lineTo(c + 22, c - 6); ctx.lineTo(c + 22, c + 40); ctx.lineTo(c - 22, c + 40); ctx.lineTo(c - 22, c - 6); }
      ctx.closePath(); ctx.fill();
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.stroke();
      return;
    }
    const col = kind === 'defense' ? '#2ee6ff' : kind === 'oil' ? '#ffb020' : kind === 'city' ? '#b99bff' : '#ff2d48';
    // پین شش‌ضلعی
    ctx.save(); ctx.translate(c, c - 6);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; ctx.lineTo(Math.cos(a) * 44, Math.sin(a) * 44); }
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -44, 0, 44);
    g.addColorStop(0, 'rgba(18,30,52,0.96)'); g.addColorStop(1, 'rgba(5,10,22,0.96)');
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = col; ctx.stroke();
    ctx.restore();
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(c - 10, c + 36); ctx.lineTo(c + 10, c + 36); ctx.lineTo(c, c + 52); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.fillStyle = '#ffffff'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const y = c - 6;
    if (kind === 'defense') {
      ctx.beginPath(); ctx.moveTo(c, y - 24); ctx.lineTo(c + 20, y - 12); ctx.lineTo(c + 20, y + 4);
      ctx.quadraticCurveTo(c + 20, y + 20, c, y + 27); ctx.quadraticCurveTo(c - 20, y + 20, c - 20, y + 4);
      ctx.lineTo(c - 20, y - 12); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(c, y - 9); ctx.lineTo(c, y + 13); ctx.moveTo(c - 10, y + 2); ctx.lineTo(c + 10, y + 2); ctx.stroke();
    } else if (kind === 'oil') {
      ctx.beginPath(); ctx.moveTo(c, y - 26); ctx.bezierCurveTo(c + 20, y, c + 20, y + 12, c, y + 24);
      ctx.bezierCurveTo(c - 20, y + 12, c - 20, y, c, y - 26); ctx.fill();
    } else if (kind === 'city') {
      ctx.fillRect(c - 18, y - 4, 10, 26); ctx.fillRect(c - 5, y - 20, 10, 42); ctx.fillRect(c + 8, y - 10, 10, 32);
    } else {
      ctx.beginPath(); ctx.arc(c, y - 4, 18, 0, 7); ctx.fill();
      ctx.fillRect(c - 10, y + 8, 20, 12);
      ctx.fillStyle = '#ff2d48'; ctx.beginPath(); ctx.arc(c - 7, y - 4, 5, 0, 7); ctx.arc(c + 7, y - 4, 5, 0, 7); ctx.fill();
    }
  });
}

// ---------- نرمال‌مپ آب (کاملاً تکرارشونده) ----------
export function makeWaterNormal(): THREE.DataTexture {
  const N = 256;
  const data = new Uint8Array(N * N * 4);
  const rnd = mulberry(42);
  const waves: { kx: number; ky: number; a: number; p: number }[] = [];
  for (let i = 0; i < 34; i++) {
    const ang = rnd() * Math.PI * 2, mag = 2 + Math.floor(rnd() * rnd() * 22);
    const kx = Math.round(Math.cos(ang) * mag), ky = Math.round(Math.sin(ang) * mag);
    if (kx === 0 && ky === 0) continue;
    waves.push({ kx, ky, a: 1 / Math.pow(Math.hypot(kx, ky), 1.25), p: rnd() * Math.PI * 2 });
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let dx = 0, dy = 0;
    for (const w of waves) {
      const ph = (2 * Math.PI * (w.kx * x + w.ky * y)) / N + w.p;
      const c = Math.cos(ph) * w.a * 2 * Math.PI / N;
      dx += c * w.kx; dy += c * w.ky;
    }
    const s = 9;
    let nx = -dx * s, ny = -dy * s; const nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l;
    const k = (y * N + x) * 4;
    data[k] = (nx * 0.5 + 0.5) * 255; data[k + 1] = (ny * 0.5 + 0.5) * 255; data[k + 2] = (nz / l * 0.5 + 0.5) * 255; data[k + 3] = 255;
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}

// ---------- GLSL مشترک ----------
export const GLSL_NOISE = /* glsl */ `
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1.0,0.0)),u.x), mix(h21(i+vec2(0.0,1.0)),h21(i+vec2(1.0,1.0)),u.x), u.y); }
float fbm3(vec2 p){ return vn(p)*0.5 + vn(p*2.03+7.1)*0.3 + vn(p*4.11+3.7)*0.2; }
float cloudShadow(vec2 p, float t){ return smoothstep(0.56, 0.78, fbm3(p*0.011 + vec2(t*0.006, t*0.0035))); }
float lockOne(vec2 p, vec4 L){ if (L.w <= 0.001) return 0.0; float d = length(p - L.xy); return (1.0 - smoothstep(L.z*0.72, L.z*1.05, d)) * L.w; }
float hexEdge(vec2 p){
  vec2 r = vec2(1.0, 1.7320508); vec2 h = r*0.5;
  vec2 a = mod(p, r) - h; vec2 b = mod(p - h, r) - h;
  vec2 g = dot(a,a) < dot(b,b) ? a : b;
  vec2 q = abs(g);
  float d = max(dot(q, normalize(vec2(1.0, 1.7320508))), q.x);
  float w = fwidth(p.x) * 1.4;
  return smoothstep(0.5 - w*1.6, 0.5 - w*0.2, d);
}
`;

// ---------- متریال آب ----------
export function makeWaterMaterial(depthCore: THREE.Texture, depthFar: THREE.Texture, normalTex: THREE.Texture, core: THREE.Vector4, outer: THREE.Vector4, waves: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    defines: waves ? { WAVES: 1 } : {},
    uniforms: {
      uTime: { value: 0 }, uNight: { value: 0 }, uGrid: { value: 0 }, uStorm: { value: 0 },
      uDepth: { value: depthCore }, uDepthFar: { value: depthFar }, uNormal: { value: normalTex }, uCore: { value: core }, uOuter: { value: outer },
      uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.3) }, uSunCol: { value: new THREE.Color('#fff1d6') },
      uSkyTop: { value: new THREE.Color('#3b82c4') }, uSkyHor: { value: new THREE.Color('#cfe6f2') },
      uDeep: { value: new THREE.Color('#06325e') }, uShallow: { value: new THREE.Color('#118fb0') }, uTurq: { value: new THREE.Color('#3fe0d0') },
      uFog: { value: new THREE.Color('#cfe6f2') }, uFogRange: { value: new THREE.Vector2(400, 1200) },
      uCam: { value: new THREE.Vector3() },
      uLockA: { value: new THREE.Vector4(0, 0, 1, 0) }, uLockB: { value: new THREE.Vector4(0, 0, 1, 0) },
    },
    vertexShader: /* glsl */ `
      uniform float uTime, uStorm; uniform vec4 uCore;
      varying vec3 vW; varying float vWave;
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        float wv = 0.0;
        #ifdef WAVES
          wv = sin(w.x*0.33 + uTime*1.25)*0.5 + sin(w.z*0.26 - uTime*0.95)*0.35 + sin((w.x+w.z)*0.14 + uTime*0.6)*0.45 + sin((w.x-w.z)*0.21 + uTime*1.7)*0.2;
          float ex = min(w.x - uCore.x + 18.0, uCore.x + uCore.z + 18.0 - w.x);
          float ez = min(w.z - uCore.y + 18.0, uCore.y + uCore.w + 18.0 - w.z);
          float edge = smoothstep(0.0, 24.0, min(ex, ez));
          w.y += wv * 0.11 * edge * (1.0 + uStorm*2.2);
        #endif
        vW = w.xyz; vWave = wv;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uNight, uGrid, uStorm;
      uniform sampler2D uDepth, uDepthFar, uNormal;
      uniform vec4 uCore, uOuter, uLockA, uLockB;
      uniform vec3 uSunDir, uSunCol, uSkyTop, uSkyHor, uDeep, uShallow, uTurq, uFog, uCam;
      uniform vec2 uFogRange;
      varying vec3 vW; varying float vWave;
      ${GLSL_NOISE}
      void main(){
        vec2 uvC = (vW.xz - uCore.xy) / uCore.zw;
        vec2 uvF = (vW.xz - uOuter.xy) / uOuter.zw;
        float inC = step(0.0, uvC.x) * step(uvC.x, 1.0) * step(0.0, uvC.y) * step(uvC.y, 1.0);
        float inF = step(0.0, uvF.x) * step(uvF.x, 1.0) * step(0.0, uvF.y) * step(uvF.y, 1.0);
        float depC = texture2D(uDepth, clamp(uvC, 0.001, 0.999)).r;
        float depF = texture2D(uDepthFar, clamp(uvF, 0.001, 0.999)).r;
        float dep = mix(mix(1.0, depF, inF), depC, inC);
        float camD = length(uCam - vW);
        float nScale = (1.0 - smoothstep(40.0, 520.0, camD) * 0.9) * (1.0 + uStorm * 1.2);
        float specK = 1.0 - smoothstep(110.0, 520.0, camD);
        vec2 p = vW.xz;
        vec2 n1 = texture2D(uNormal, p*0.045 + uTime*vec2(0.011, 0.007)).xy*2.0-1.0;
        vec2 n2 = texture2D(uNormal, p*0.12 + uTime*vec2(-0.017, 0.012)).xy*2.0-1.0;
        vec2 n3 = texture2D(uNormal, p*0.009 + uTime*vec2(0.002, -0.0025)).xy*2.0-1.0;
        vec2 nxy = (n1*0.5 + n2*0.3 + n3*0.8) * nScale;
        vec3 N = normalize(vec3(nxy.x, 1.0, nxy.y));
        vec3 V = normalize(uCam - vW);
        float NdV = max(dot(N, V), 0.0);
        float fres = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
        float d1 = smoothstep(0.0, 0.05, dep);
        float d2 = smoothstep(0.035, 0.45, dep);
        vec3 water = mix(uTurq, uShallow, d1);
        water = mix(water, uDeep, d2);
        float ca = pow(abs(sin(p.x*1.3 + uTime*1.1 + sin(p.y*0.9 + uTime)) * sin(p.y*1.2 - uTime*0.8 + sin(p.x*0.7))), 4.0);
        water += ca * 0.12 * (1.0 - d1) * (1.0 - uNight) * inC;
        water *= 0.92 + 0.16 * (n1.x*0.5+0.5) + vWave*0.03;
        vec3 R = reflect(-V, N);
        vec3 sky = mix(uSkyHor, uSkyTop, clamp(R.y * 1.3, 0.0, 1.0));
        vec3 col = mix(water, sky, fres * 0.55);
        vec3 L = normalize(uSunDir);
        float sd = max(dot(R, L), 0.0);
        col += uSunCol * (pow(sd, 420.0) * 6.0 * specK * (1.0 - uNight*0.9) + pow(sd, 48.0) * 0.3 * (0.35 + 0.65*specK) * (1.0 - uNight*0.5)) * (1.0 - uStorm*0.85);
        col *= 1.0 - cloudShadow(p, uTime) * 0.26 * (1.0 - uNight);
        float shore = 1.0 - smoothstep(0.0, 0.028, dep);
        float fn = vn(p*2.6 + uTime*0.6)*0.6 + vn(p*6.5 - uTime*0.9)*0.4;
        float wvv = 0.5 + 0.5*sin(dep*260.0 - uTime*2.3 + fn*3.0);
        float foam = shore * smoothstep(0.38, 0.8, fn*0.55 + wvv*0.55) * inC;
        float crest = smoothstep(0.62, 0.95, n2.x*0.5+0.5) * uStorm * 0.6;
        col = mix(col, vec3(0.95,0.98,1.0)*(1.0-uNight*0.65), clamp(foam*0.9 + crest, 0.0, 1.0));
        if (uGrid > 0.01) {
          float g = hexEdge(p * 0.07);
          float pulse = 0.75 + 0.25*sin(uTime*1.5 - length(p - uCam.xz)*0.02);
          col = mix(col, vec3(0.45, 0.95, 1.0), g * uGrid * 0.22 * pulse);
          col = mix(col, col*vec3(0.85,0.95,1.04), uGrid*0.15);
        }
        float lk = max(lockOne(p, uLockA), lockOne(p, uLockB));
        col = mix(col, col*0.22 + vec3(0.02,0.04,0.07), lk*0.75);
        float f = smoothstep(uFogRange.x, uFogRange.y, camD);
        col = mix(col, uFog, f);
        float alpha = mix(0.55, 0.97, smoothstep(0.0, 0.12, dep));
        alpha = max(alpha, foam);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// ---------- پد اسلات‌ها (یک draw call برای همه) ----------
export function makePadMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uScale: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute vec3 aColor; attribute float aPhase; attribute float aState;
      uniform float uScale; varying vec2 vUv; varying vec3 vC; varying float vPh; varying float vSt;
      void main(){
        vUv = uv; vC = aColor; vPh = aPhase; vSt = aState;
        vec3 p = position * uScale;
        #ifdef USE_INSTANCING
          vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
        #else
          vec4 w = modelMatrix * vec4(p, 1.0);
        #endif
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; varying vec2 vUv; varying vec3 vC; varying float vPh; varying float vSt;
      float hexD(vec2 p){ p = abs(p); return max(dot(p, vec2(0.8660254, 0.5)), p.y); }
      void main(){
        if (vSt < 0.5) discard;
        vec2 p = vUv*2.0 - 1.0;
        float d = hexD(p);
        float w = max(fwidth(d), 0.004) * 1.3;
        float rim = 1.0 - smoothstep(0.0, w*2.2, abs(d - 0.6));
        float rim2 = (1.0 - smoothstep(0.0, w*1.4, abs(d - 0.5))) * 0.3;
        float fill = (1.0 - smoothstep(0.48, 0.5, d)) * 0.14;
        float k = fract(uTime*0.55 + vPh);
        float pr = 0.6 + k*0.38;
        float pulse = (1.0 - smoothstep(0.0, w*2.6, abs(d - pr))) * (1.0 - k) * 0.65;
        float a = rim + rim2 + fill + pulse;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vC * (1.25 + pulse*0.8), a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// ---------- بیلبورد با اندازه ثابت پیکسلی (آیکون‌های اسلات / LOD) ----------
export function makeBillboardMaterial(atlas: THREE.Texture, columns: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false,
    uniforms: { uTex: { value: atlas }, uPx: { value: 44 }, uPxToWorld: { value: 0.001 }, uCols: { value: columns }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aKind; attribute float aState; attribute float aPhase;
      uniform float uPx, uPxToWorld, uTime;
      varying vec2 vUv; varying float vK;
      void main(){
        vUv = uv; vK = aKind;
        #ifdef USE_INSTANCING
          vec4 c = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        #else
          vec4 c = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        #endif
        if (aState < 0.5) { gl_Position = vec4(0.0, 0.0, -3.0, 1.0); return; }
        vec4 mv = viewMatrix * c;
        float sz = uPx * (-mv.z) * uPxToWorld;
        float bob = sin(uTime*2.2 + aPhase) * 0.08;
        mv.xy += vec2(position.x, position.y + 0.5 + bob) * sz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTex; uniform float uCols; varying vec2 vUv; varying float vK;
      void main(){
        vec2 uv = vec2((vUv.x + vK) / uCols, vUv.y);
        vec4 c = texture2D(uTex, uv);
        if (c.a < 0.04) discard;
        gl_FragColor = c;
        #include <colorspace_fragment>
      }`,
  });
}

// ---------- پچ زمین (حفظ نور و سایه استاندارد) ----------
export interface TerrainUniforms { uTime: THREE.IUniform; uGrid: THREE.IUniform; uNight: THREE.IUniform; uDetail: THREE.IUniform; uLockA: THREE.IUniform; uLockB: THREE.IUniform; }
export function patchTerrainMaterial(mat: THREE.MeshStandardMaterial, U: TerrainUniforms) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U);
    shader.vertexShader = 'varying vec3 vWP;\nvarying vec3 vWN;\n' + shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>
       vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;
       vWN = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWP; varying vec3 vWN;
        uniform float uTime; uniform float uGrid; uniform float uNight; uniform float uDetail;
        uniform vec4 uLockA; uniform vec4 uLockB;
        ${GLSL_NOISE}`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        if (uDetail > 0.01 && vWP.y > 0.5) {
          vec2 q = vWP.xz; float e = 0.3;
          float n0 = vn(q*2.1)*0.55 + vn(q*5.7)*0.45;
          float nx = (vn((q+vec2(e,0.0))*2.1)*0.55 + vn((q+vec2(e,0.0))*5.7)*0.45) - n0;
          float nz = (vn((q+vec2(0.0,e))*2.1)*0.55 + vn((q+vec2(0.0,e))*5.7)*0.45) - n0;
          float k = smoothstep(0.5, 1.4, vWP.y) * uDetail * (0.6 + 0.8*(1.0 - clamp(vWN.y, 0.0, 1.0)));
          vec3 pert = (viewMatrix * vec4(-nx, 0.0, -nz, 0.0)).xyz;
          normal = normalize(normal + pert * 2.2 * k);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 q = vWP.xz;
          float dn = vn(q*0.8)*0.45 + vn(q*2.7)*0.3 + vn(q*8.5)*0.25;
          diffuseColor.rgb *= 0.8 + dn*0.4;
          float slope = 1.0 - clamp(vWN.y, 0.0, 1.0);
          vec3 rockCol = vec3(0.36, 0.31, 0.27) * (0.75 + dn*0.5);
          diffuseColor.rgb = mix(diffuseColor.rgb, rockCol, smoothstep(0.32, 0.62, slope) * smoothstep(0.6, 1.6, vWP.y));
          float strata = 0.5 + 0.5*sin(vWP.y*5.0 + vn(q*0.3)*4.0);
          diffuseColor.rgb *= mix(1.0, 0.86 + strata*0.2, smoothstep(0.3, 0.6, slope));
          float wet = 1.0 - smoothstep(0.02, 0.5, vWP.y);
          diffuseColor.rgb *= mix(1.0, 0.7, wet * step(-0.1, vWP.y));
          diffuseColor.rgb *= 1.0 - cloudShadow(q, uTime) * 0.3 * (1.0 - uNight);
        }`)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
        {
          vec2 q = vWP.xz;
          if (uGrid > 0.01 && vWP.y > 0.6) {
            float ht = vWP.y * 0.7;
            float c = abs(fract(ht - 0.5) - 0.5) / max(fwidth(ht), 1e-4);
            float line = 1.0 - min(c, 1.0);
            gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb*0.55 + vec3(0.05,0.18,0.22), line * uGrid * 0.6);
            gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb*vec3(0.85,0.95,1.05), uGrid*0.3);
          }
          float lk = max(lockOne(q, uLockA), lockOne(q, uLockB));
          float lum = dot(gl_FragColor.rgb, vec3(0.3,0.59,0.11));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(lum)*0.25 + vec3(0.01,0.02,0.04), lk*0.8);
        }`);
  };
  mat.customProgramCacheKey = () => 'terrain-v3';
}

// ---------- شیدر نوار مسیر ----------
export function makeRibbonMaterial(color: string, speed: number, opacity: number, dashLen = 0.45, glow = 1.6): THREE.ShaderMaterial {
  const c = new THREE.Color(color).multiplyScalar(glow);
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uColor: { value: c }, uTime: { value: 0 }, uSpeed: { value: speed }, uOp: { value: opacity }, uDash: { value: dashLen } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uTime, uSpeed, uOp, uDash; varying vec2 vUv;
      void main(){
        float dash = fract(vUv.x - uTime*uSpeed);
        float a = smoothstep(0.0, 0.08, dash) * (1.0 - smoothstep(uDash - 0.08, uDash, dash));
        float e = abs(vUv.y - 0.5) * 2.0;
        float core = 1.0 - smoothstep(0.25, 0.55, e);
        float edge = smoothstep(0.62, 0.8, e) * (1.0 - smoothstep(0.85, 1.0, e));
        float alpha = (core * (0.25 + 0.75*a) + edge*0.8) * uOp;
        gl_FragColor = vec4(uColor * (0.7 + core*0.6*a), alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// ---------- شیدر حلقه برد (رادار) ----------
export function makeRangeMaterial(color: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uDashed: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uTime, uDashed; varying vec2 vUv;
      void main(){
        vec2 p = vUv*2.0 - 1.0; float r = length(p); if (r > 1.0) discard;
        float ang = atan(p.y, p.x);
        float w = fwidth(r);
        float rim = smoothstep(1.0 - w*3.5, 1.0 - w*1.2, r) * (1.0 - smoothstep(1.0 - w, 1.0, r));
        float dashes = uDashed > 0.5 ? step(0.5, fract(ang*12.0)) : 1.0;
        float ticks = step(0.92, fract(ang*36.0/6.2831)) * smoothstep(0.9, 0.93, r) * (1.0 - uDashed);
        float sweepA = mod(ang - uTime*1.8, 6.2831);
        float sweep = (1.0 - smoothstep(0.0, 1.1, sweepA)) * smoothstep(0.05, 0.95, r) * (1.0 - uDashed);
        float rings = (1.0 - smoothstep(0.0, w*1.5, abs(r - 0.66))) * 0.35 + (1.0 - smoothstep(0.0, w*1.5, abs(r - 0.33))) * 0.25;
        float fill = 0.07 * (1.0 - uDashed);
        float a = rim*dashes*0.95 + ticks*0.6 + sweep*0.32 + rings*(1.0-uDashed) + fill;
        gl_FragColor = vec4(uColor * 1.4, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// ---------- شیدر گنبد هولوگرافیک ----------
export function makeShieldMaterial(color: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uOp: { value: 1 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uTime, uOp; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      ${GLSL_NOISE}
      void main(){
        float f = pow(1.0 - abs(dot(vN, vV)), 2.5);
        vec2 hp = vec2(atan(vP.z, vP.x)*3.0, vP.y*2.2);
        float hx = hexEdge(hp*1.0);
        float scan = smoothstep(0.0, 0.06, abs(fract(vP.y*0.25 - uTime*0.25) - 0.5) - 0.44);
        float a = (f*0.75 + hx*0.18 + (1.0-scan)*0.25) * uOp;
        gl_FragColor = vec4(uColor*1.3, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// ---------- شیدر نورهای شهری (Points) ----------
export function makeCityLightsMaterial(glow: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTex: { value: glow }, uNight: { value: 0 }, uTime: { value: 0 }, uScale: { value: 400 } },
    vertexShader: `
      attribute float aSize; attribute vec3 aColor; attribute float aSeed;
      uniform float uScale, uTime; varying vec3 vC; varying float vTw;
      void main(){
        vec4 mv = modelViewMatrix*vec4(position,1.0);
        gl_PointSize = clamp(aSize * uScale / -mv.z, 1.4, 9.0);
        vC = aColor; vTw = 0.75 + 0.25*sin(uTime*2.0 + aSeed*30.0);
        gl_Position = projectionMatrix*mv;
      }`,
    fragmentShader: `
      uniform sampler2D uTex; uniform float uNight; varying vec3 vC; varying float vTw;
      void main(){
        float a = texture2D(uTex, gl_PointCoord).a;
        gl_FragColor = vec4(vC * 2.2 * vTw, a * uNight);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// ---------- پاس درجه‌بندی رنگ + وینیت ----------
export const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.32 }, uSat: { value: 1.12 }, uTint: { value: new THREE.Vector3(1, 1, 1) }, uFlash: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uVig, uSat, uFlash; uniform vec3 uTint; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, uSat) * uTint;
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - dot(d, d) * uVig * 2.2;
      c.rgb += uFlash;
      gl_FragColor = c;
    }`,
};
