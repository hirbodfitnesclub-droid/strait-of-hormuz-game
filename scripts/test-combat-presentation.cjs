const assert = require('node:assert/strict');
const { test } = require('node:test');
const THREE = require('three');
const { load } = require('./load-game.cjs');
const { BattleFX } = load('src/three-map/battlefx.ts');
const { initialGame, gameReducer, getSlots, piratePosition, getRange, distance } = load('src/lib/game.ts');

test('new and recycled projectile render at the launch position on the first draw', () => {
  const fx = new BattleFX();
  for (let i = 1; i <= 112; i++) {
    const from = new THREE.Vector3(82 + i, 4, 120);
    const to = new THREE.Vector3(200, 2, 220);
    fx.shoot({ from, to, kind: 'rocket', color: '#ffa000' });
    const p = fx.projs[(fx.projCur.i + fx.projs.length - 1) % fx.projs.length];
    assert.ok(p.g.visible && p.g.position.equals(from));
    assert.ok(p.g.getWorldDirection(new THREE.Vector3()).dot(to.sub(from).normalize()) > .999);
  }
});

test('flight uses elapsed battle time at 1/2/3× including slow frames and pauses', () => {
  for (const speed of [1, 2, 3]) {
    const fx = new BattleFX();
    let arrivals = 0;
    fx.shoot({ from: new THREE.Vector3(), to: new THREE.Vector3(0, 0, 50),
      kind: 'missile', color: '#ff0000', dur: 1, onArrive: () => arrivals++ });
    fx.update(0);
    assert.equal(fx.projs[0].t, 0);
    const wallFrame = 1 / 12;
    const frames = Math.ceil(1 / (speed * wallFrame)) - 1;
    for (let i = 0; i < frames; i++) fx.update(wallFrame * speed);
    assert.equal(arrivals, 0);
    assert.ok(Math.abs(fx.projs[0].t - frames * wallFrame * speed) < 1e-9);
    fx.update(wallFrame * speed + 1e-9);
    assert.equal(arrivals, 1);
  }
});

test('mechanics distinguish visible destruction from leaks and wave cleanup', () => {
  let s = gameReducer(initialGame(), { type: 'start' });
  const enemy = { id: 70, kind: 'speed', hp: 0, maxHp: 100, progress: .45, stun: 10, boss: 0, specialClock: 0, hitFlash: 0 };
  s.enemies = [enemy, {...enemy, id: 71, hp: 100, progress: 1}];
  s.spawnClock = 100;
  s.pirates = [{ id: 72, hp: 0, progress: .5 }];
  s = gameReducer(s, { type: 'advance', steps: 2, battlePaused: false });
  assert.deepEqual(s.events.filter(e => e.type === 'ship-destroyed').map(e => e.enemyId).sort(), [70, 72]);
  assert.ok(!s.enemies.length && !s.pirates.length);
});

test('pooled beam has its current full length on the first draw', () => {
  const fx = new BattleFX();
  const start = new THREE.Vector3(2, 4, 8), end = new THREE.Vector3(100, 9, 65);
  fx.rail(start, end, '#ffff00');
  assert.equal(fx.beams[0].m.scale.z, start.distanceTo(end));
});

test('only living smoke and sparks reach the GPU, including expiry and pool reuse', () => {
  const fx = new BattleFX();
  for (const particles of [fx.smokeP, fx.sparkP]) {
    const {mesh} = particles;
    const origin = new THREE.Vector3();
    const red = new THREE.Color('red'), green = new THREE.Color('green');
    const matrix = new THREE.Matrix4(), color = new THREE.Color();
    assert.equal(mesh.count, 0);
    particles.spawn(origin, 0, 0, 0, .2, 1, red);
    particles.spawn(origin.clone().setX(2), 0, 0, 0, 2, 1, green);
    particles.update(.1);
    assert.equal(mesh.count, 2);
    particles.update(.2);
    assert.equal(mesh.count, 1);
    mesh.getMatrixAt(0, matrix);
    mesh.getColorAt(0, color);
    assert.equal(matrix.elements[12], 2);
    assert.equal(color.getHex(), green.getHex());
    for (let i = 0; i <= particles.n; i++) particles.spawn(origin, 0, 0, 0, .1, 1, red);
    particles.update(.01);
    assert.equal(mesh.count, particles.n);
    particles.update(2);
    assert.equal(mesh.count, 0);
    const version = mesh.instanceMatrix.version;
    particles.update(.1);
    assert.equal(mesh.instanceMatrix.version, version);
  }
});

test('pirate engagements respect the same ammunition and target restrictions', () => {
  function engage(kind, tier, branch, ammo, overdrive = 0) {
    const s = initialGame();
    s.ammo = ammo;
    s.overdrive = overdrive;
    s.hero = { x: 0, y: 0, active: 0 };
    const target = { id: 552, progress: .5, hp: 200 };
    s.pirates = [target];
    const tower = { slot: 0, kind, tier, branch, priority: 'first' };
    for (let p = .1; p < .9; p += .01) {
      target.progress = p;
      const pos = piratePosition(target, s.layout);
      const slot = getSlots(s.layout).find(slot => distance(slot, pos) < getRange(s, tower) * .8);
      if (!slot) continue;
      tower.slot = slot.id;
      s.towers = [tower];
      const result = gameReducer(s, { type: 'tick', dt: .125 });
      return { ammo: result.ammo, shots: result.shots.filter(shot => shot.targetId === 552).length };
    }
    assert.fail('no eligible pirate fixture position');
  }
  assert.deepEqual(engage('missile', 1, null, 2), { ammo: 2, shots: 0 });
  assert.deepEqual(engage('missile', 1, null, 0, 10), { ammo: 0, shots: 1 });
  assert.deepEqual(engage('air', 4, 0, 80), { ammo: 80, shots: 0 });
  assert.deepEqual(engage('ew', 1, null, 0), { ammo: 0, shots: 1 });
  const supplied = engage('missile', 1, null, 10);
  assert.ok(supplied.ammo < 10 && supplied.shots === 1);
});
