// Review-only asset pipeline: installs the owner-uploaded source art into the paths Astra v5 expects.
const sharp = require('sharp');
const fs = require('node:fs');
const SRC = '/home/hatch/workspace/user/media_library/image';
const SW = '/home/hatch/workspace/hormuz-game/assets-src/oga-sea-warfare-set/extracted';
const PROD = '/home/hatch/workspace/hormuz-game/public/sprites/ships';

async function keyOut(input, out, size = 220) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, bg = [data[0], data[1], data[2]];
  const cell = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const s = i * 4, r = data[s], g = data[s + 1], b = data[s + 2];
    let alpha = 1 - Math.max(0, Math.min(1, (r - g) / Math.max(1, bg[0] - bg[1]), (b - g) / Math.max(1, bg[2] - bg[1])));
    alpha = alpha < .14 ? 0 : alpha > .96 ? 1 : alpha;
    const un = (c, back) => Math.max(0, Math.min(255, (c - (1 - alpha) * back) / Math.max(.001, alpha)));
    cell[s] = un(r, bg[0]); cell[s + 1] = un(g, bg[1]); cell[s + 2] = un(b, bg[2]); cell[s + 3] = Math.round(alpha * 255);
  }
  const buf = await sharp(cell, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  await sharp(buf).trim({ background: '#00000000', threshold: 20 }).resize(size, size, { fit: 'contain', background: '#00000000' }).png({ compressionLevel: 9 }).toFile(out);
}
(async () => {
  fs.mkdirSync('public/images', { recursive: true });
  fs.mkdirSync('public/assets/buildings', { recursive: true });
  fs.mkdirSync('public/assets/managers', { recursive: true });
  fs.mkdirSync('public/assets/ships', { recursive: true });
  fs.mkdirSync('public/assets/towers', { recursive: true });
  // source sheets + maps
  await sharp(`${SRC}/image-2.jpg`).png().toFile('public/images/towers-basic.png');
  await sharp(`${SRC}/image.jpg`).png().toFile('public/images/towers-advanced.png');
  await sharp(`${SRC}/image-3.jpg`).png().toFile('public/images/towers-special.png');
  await sharp(`${SRC}/image-2.png`).jpeg({ quality: 88 }).toFile('public/images/hormuz-map-optimized.jpg');
  await sharp(`${SRC}/image.png`).jpeg({ quality: 88 }).toFile('public/images/hormuz-map-portrait-optimized.jpg');
  await sharp(`${SRC}/image-3.png`).png().toFile('public/images/industrial-atlas.png');
  // buildings from the industrial atlas (4x3)
  const atlas = `${SRC}/image-3.png`;
  const meta = await sharp(atlas).metadata();
  const cw = Math.floor(meta.width / 4), ch = Math.floor(meta.height / 3);
  const cells = { oil: [0, 0], tank: [1, 0], dock: [2, 0], refinery: [3, 0], steel: [0, 1], arms: [1, 1], power: [2, 1], water: [3, 1], city: [0, 2], radar: [1, 2] };
  for (const [id, [cx, cy]] of Object.entries(cells)) {
    const tmp = `/tmp/bld-${id}.png`;
    await sharp(atlas).extract({ left: cx * cw, top: cy * ch, width: cw, height: ch }).png().toFile(tmp);
    await keyOut(tmp, `public/assets/buildings/${id}.png`);
  }
  // managers: thirds of the portrait strip
  const strip = `${SRC}/image-4.png`;
  const sm = await sharp(strip).metadata();
  const third = Math.floor(sm.width / 3);
  const mgr = ['harbor', 'energy', 'supply'];
  for (let i = 0; i < 3; i++) {
    await sharp(strip).extract({ left: i * third, top: 0, width: third, height: sm.height }).resize(360, 440, { fit: 'cover', position: 'top' }).jpeg({ quality: 88 }).toFile(`public/assets/managers/${mgr[i]}.jpg`);
  }
  // reward crate
  await keyOut(`${SRC}/image-5.png`, 'public/assets/reward-crate.png', 300);
  // ships from the Sea Warfare CC0 pack + our production cargo sprites
  const ships = {
    'patrol.png': `${SW}/PatrolBoat/ShipPatrolHull.png`, 'destroyer.png': `${SW}/Destroyer/ShipDestroyerHull.png`,
    'cruiser.png': `${SW}/Cruiser/ShipCruiserHull.png`, 'battleship.png': `${SW}/Battleship/ShipBattleshipHull.png`,
    'carrier.png': `${SW}/Carrier/ShipCarrierHull.png`, 'submarine.png': `${SW}/Submarine/ShipSubMarineHull.png`,
    'aircraft.png': `${SW}/Plane/PlaneF-35Lightning2.png`, 'gun.png': `${SW}/Destroyer/WeaponDestroyerStandardGun.png`,
    'battleship-gun.png': `${SW}/Battleship/WeaponBattleshipStandardGun.png`,
    'merchant.png': `${SW}/Quick Cargo.png`, 'freighter.png': `${PROD}/bulk.png`,
    'container.png': `${PROD}/container.png`, 'tanker.png': `${PROD}/tanker.png`,
  };
  for (const [name, from] of Object.entries(ships)) await sharp(from).png().toFile(`public/assets/ships/${name}`);
  await sharp(`${SW}/Plane/Missile.png`).png().toFile('public/assets/towers/Missile.png');
  console.log('assets installed');
})().catch(e => { console.error(e); process.exit(1); });
