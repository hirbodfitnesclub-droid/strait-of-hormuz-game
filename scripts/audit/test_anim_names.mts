/* Edge-case tests for canonicalAnimName (Fix Program 2, team ANIM round 2).
 *
 * Covers the QA-ANIM round-2 adversarial suite (qa-anim2.md item 1) plus the
 * whitelist regression cases for the round-2 fix: English words that merely
 * start with `anim` (animal/animate/animator/anims) must NOT be canonicalized
 * or collected, while every real key — sanitized, suffixed, or already in
 * canonical colon form — must keep mapping exactly as before.
 *
 * Run:  npx tsx scripts/audit/test_anim_names.mts
 * Exit code 0 = all cases pass; 1 = at least one failure.
 */
import { canonicalAnimName } from '../../src/three-map/anim-names';

type Expect = { name: string; ord: number } | null;
const cases: Array<[string, Expect]> = [
  // --- must NOT be collected / misread (QA adversarial + whitelist traps) ---
  ['animal', null], ['animate', null], ['animator', null], ['anims', null],
  ['animal_1', null], ['anim:al', null], ['anim:ate', null],
  ['animrc1', null], ['animyaw2', null], ['animmz12', null],
  ['', null], ['anim', null], ['Anim:rc', null], ['ANIMRC', null],
  ['xanimrc', null], ['animrc_', null], ['animrc_1_2', null],
  ['anim:rc_1', null], ['anim:rc1', null],
  ['animdoor-l', null], ['animdoor_L', null], ['animdoor-l_1', null],

  // --- sanitized delivered names map to canonical + ordinal ---
  ['animrc', { name: 'anim:rc', ord: 0 }],
  ['animrc_1', { name: 'anim:rc', ord: 1 }],
  ['animrc_11', { name: 'anim:rc', ord: 11 }],
  ['animmz_12', { name: 'anim:mz', ord: 12 }],
  ['animcell_1', { name: 'anim:cell', ord: 1 }],
  ['animdoor', { name: 'anim:door', ord: 0 }],
  ['animdoorL', { name: 'anim:doorL', ord: 0 }],
  ['animdoorR', { name: 'anim:doorR', ord: 0 }],
  ['animdoorL_2', { name: 'anim:doorL', ord: 2 }],
  ['animrotZ', { name: 'anim:rotZ', ord: 0 }],
  ['animrotZ_1', { name: 'anim:rotZ', ord: 1 }],
  ['animrot_1', { name: 'anim:rot', ord: 1 }],
  ['animflameLight', { name: 'anim:flameLight', ord: 0 }],
  ['animbeam', { name: 'anim:beam', ord: 0 }],
  ['animouter_3', { name: 'anim:outer', ord: 3 }],

  // --- documented loader edges (GLTFLoader never emits these; behavior kept) ---
  ['animrc_01', { name: 'anim:rc', ord: 1 }],
  ['animrc_0', { name: 'anim:rc', ord: 0 }],

  // --- canonical colon names (procedural models) pass through unchanged ---
  ['anim:rc', { name: 'anim:rc', ord: 0 }],
  ['anim:doorL', { name: 'anim:doorL', ord: 0 }],
  ['anim:doorR', { name: 'anim:doorR', ord: 0 }],
  ['anim:door', { name: 'anim:door', ord: 0 }],
  ['anim:flameLight', { name: 'anim:flameLight', ord: 0 }],
  ['anim:beam', { name: 'anim:beam', ord: 0 }],
];

/* Every whitelisted key must round-trip in all three delivered forms.
 * The key list is duplicated here on purpose: if a key is ever dropped
 * from the whitelist in anim-names.ts, this test — not a model — fails. */
const ALL_KEYS = [
  'yaw', 'pitch', 'mz', 'rc', 'spin', 'erector', 'missile', 'crystal',
  'doorL', 'doorR', 'door', 'cell',
  'boat', 'bob', 'crane', 'flag', 'flame', 'flameLight', 'holo', 'mines',
  'orb', 'ping', 'rings', 'rot', 'rotZ', 'scan', 'shell', 'smoke', 'sub',
  'sweep', 'swing', 'trolley',
  'beam', 'outer',
];
for (const k of ALL_KEYS) {
  cases.push([`anim${k}`, { name: `anim:${k}`, ord: 0 }]);
  cases.push([`anim${k}_7`, { name: `anim:${k}`, ord: 7 }]);
  cases.push([`anim:${k}`, { name: `anim:${k}`, ord: 0 }]);
}

let fail = 0;
for (const [input, expect] of cases) {
  const got = canonicalAnimName(input);
  const ok = expect === null
    ? got === null
    : got !== null && got.name === expect.name && got.ord === expect.ord;
  if (!ok) {
    fail++;
    console.log(`FAIL  ${JSON.stringify(input)} -> ${JSON.stringify(got)} (expected ${JSON.stringify(expect)})`);
  }
}
console.log(`${cases.length - fail}/${cases.length} cases passed`);
process.exit(fail ? 1 : 0);
