// PERF3 census: attribute drawn tris by category on the opening peace view.
// Pure-math frustum tests from live matrix elements (THREE is not global).
window.__census = () => {
  const s = window.__gamesync3d; const map = s.map; const scene = map.scene;
  const cam = map.camera;
  const triOf = (o) => {
    const g = o.geometry; if (!g) return 0;
    let n = g.index ? g.index.count / 3 : (g.attributes.position ? g.attributes.position.count / 3 : 0);
    if (o.isInstancedMesh) n *= (o.count || 0);
    return Math.round(n);
  };
  const mul = (a, b) => { // column-major 4x4 multiply a*b
    const o = new Array(16).fill(0);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
      for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
    return o;
  };
  const frustumFor = (camera) => {
    const m = mul(camera.projectionMatrix.elements, camera.matrixWorldInverse.elements);
    const row = i => [m[i], m[4 + i], m[8 + i], m[12 + i]];
    const r3 = row(3);
    const planes = [];
    for (const [rowArr, sign] of [[row(0), 1], [row(0), -1], [row(1), 1], [row(1), -1], [row(2), 1], [row(2), -1]]) {
      const p = [r3[0] + sign * rowArr[0], r3[1] + sign * rowArr[1], r3[2] + sign * rowArr[2], r3[3] + sign * rowArr[3]];
      const len = Math.hypot(p[0], p[1], p[2]) || 1;
      planes.push([p[0] / len, p[1] / len, p[2] / len, p[3] / len]);
    }
    return (cx, cy, cz, rad) => planes.every(p => p[0] * cx + p[1] * cy + p[2] * cz + p[3] >= -rad);
  };
  const camIn = frustumFor(cam);
  let shadowIn = null, sunInfo = null;
  scene.traverse(o => {
    if (o.isDirectionalLight && o.castShadow !== undefined && o.shadow && o.shadow.camera && !sunInfo) {
      sunInfo = { castShadow: o.castShadow };
      try { shadowIn = frustumFor(o.shadow.camera); } catch (e) { /* noop */ }
    }
  });
  const sphereOf = (o) => {
    const e = o.matrixWorld.elements;
    const cx = e[12], cy = e[13], cz = e[14];
    const sx = Math.hypot(e[0], e[1], e[2]), sy = Math.hypot(e[4], e[5], e[6]), sz = Math.hypot(e[8], e[9], e[10]);
    let rad = 0;
    const g = o.geometry;
    if (g) { if (!g.boundingSphere) g.computeBoundingSphere(); rad = (g.boundingSphere ? g.boundingSphere.radius : 0) * Math.max(sx, sy, sz); }
    return { cx, cy, cz, rad };
  };
  const pathOf = (o) => {
    const names = []; let p = o;
    while (p && names.length < 5) { names.push(p.name || p.type || '?'); p = p.parent; }
    return names.reverse().join('/');
  };
  const rows = [];
  let totalTris = 0, totalObjects = 0;
  scene.traverse(o => {
    totalObjects++;
    if (!(o.isMesh || o.isSprite || o.isPoints || o.isLine)) return;
    const t = triOf(o); if (t === 0) return;
    totalTris += t;
    const { cx, cy, cz, rad } = sphereOf(o);
    rows.push({
      path: pathOf(o), name: o.name || '', type: o.type, tris: t,
      cast: !!o.castShadow, recv: !!o.receiveShadow, vis: o.visible !== false,
      inCam: camIn(cx, cy, cz, rad), inShadow: shadowIn ? shadowIn(cx, cy, cz, rad) : false,
      x: Math.round(cx), z: Math.round(cz), rad: Math.round(rad * 10) / 10,
      inst: o.isInstancedMesh ? (o.count || 0) : 0,
    });
  });
  return { totalTris, totalObjects, sunInfo, rows,
           perf: s.perfInfo(),
           camPos: [cam.position.x, cam.position.y, cam.position.z],
           camTarget: map.controls ? [map.controls.target.x, map.controls.target.y, map.controls.target.z] : null };
};
'census-installed';
