/* Animation-node name canonicalization (D-019).
 *
 * The pack models author their animation nodes as `anim:<key>` inside the
 * GLB files, and the runtime (gamesync collectAnims/bindTowerAnim/
 * applyGeneric) was written against those colon names. But three.js
 * GLTFLoader rewrites every node name before it reaches the scene:
 *
 *   - PropertyBinding.sanitizeNodeName strips the reserved characters
 *     `[ ] . : /` (and turns spaces into '_'), so `anim:rc` arrives as
 *     `animrc`;
 *   - GLTFLoader.createUniqueName then appends `_N` to the 2nd, 3rd, ...
 *     occurrence of the same sanitized name within one file, so duplicate
 *     nodes arrive as `animrc_1`, `animrc_2`, ... (the suffix counter is
 *     shared with mesh/light names in the file, so a first node may
 *     already carry a suffix — ordinals are not guaranteed contiguous).
 *
 * Searching the live scene for the colon names therefore finds ZERO nodes
 * (audit round 2, team 2: every tower/building anim list was empty and the
 * measured on-screen amplitude was 0.000 for all 18 tower kinds).
 *
 * canonicalAnimName maps a delivered scene name back to the canonical
 * `anim:<key>` form plus its duplicate ordinal, so collection can key on
 * the names the runtime expects and order duplicates by their authored
 * sequence. Verified against the shipped files: every raw anim name in
 * all 90 tower + 15 building GLBs matches /^anim:[A-Za-z]+$/ — 668 nodes,
 * 32 distinct keys — so stripping one trailing `_<digits>` is unambiguous:
 * no key itself ends in digits or contains '_'.
 *
 * The mapping is restricted to a WHITELIST of those real keys (plus the
 * two keys the runtime looks up but no shipped GLB contains). Without it,
 * any scene name that merely starts with the letters `anim` would be
 * canonicalized — a node literally named `animal` became `anim:al`,
 * `animate` became `anim:ate` (QA-ANIM round-2 adversarial finding:
 * zero occurrences in current assets, zero runtime consequence today,
 * but a latent trap for future models). Non-whitelisted names return
 * null here and are simply not collected as animation nodes. */

/** Every animation key the runtime can drive. The first group is the
 *  census of the shipped GLBs (32 keys, 668 nodes); `beam`/`outer` are
 *  looked up by bindTowerAnim for the laser but are absent from every
 *  shipped laser GLB (audit round 2, team 2 secondary finding) — they
 *  stay whitelisted so a future pack export that includes them works. */
const ANIM_KEYS = new Set([
  'yaw', 'pitch', 'mz', 'rc', 'spin', 'erector', 'missile', 'crystal',
  'doorL', 'doorR', 'door', 'cell',
  'boat', 'bob', 'crane', 'flag', 'flame', 'flameLight', 'holo', 'mines',
  'orb', 'ping', 'rings', 'rot', 'rotZ', 'scan', 'shell', 'smoke', 'sub',
  'sweep', 'swing', 'trolley',
  'beam', 'outer',
  // Building pack export contract: blinking navigation lights and city traffic.
  'beacon', 'car',
]);

const DELIVERED_RE = /^anim([A-Za-z]+?)(?:_(\d+))?$/;

export interface CanonicalAnimName {
  /** Canonical runtime name, e.g. 'anim:rc'. */
  name: string;
  /** Duplicate ordinal: 0 for the first node of that name in the file,
   *  N for the one delivered with an `_N` suffix. */
  ord: number;
}

/** Map a live-scene node name back to its canonical anim name, or null
 *  when the node is not an animation node. Names that are already in
 *  canonical colon form (procedurally authored models that never went
 *  through GLTFLoader) pass through with ord 0 — provided their key is
 *  whitelisted, exactly like the sanitized delivered form. */
export function canonicalAnimName(delivered: string): CanonicalAnimName | null {
  if (!delivered) return null;
  if (delivered.startsWith('anim:')) {
    return ANIM_KEYS.has(delivered.slice(5)) ? { name: delivered, ord: 0 } : null;
  }
  const m = DELIVERED_RE.exec(delivered);
  if (!m || !ANIM_KEYS.has(m[1])) return null;
  return { name: 'anim:' + m[1], ord: m[2] ? Number(m[2]) : 0 };
}
