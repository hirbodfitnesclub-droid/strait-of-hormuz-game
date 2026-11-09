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
 * all 90 tower + 15 building GLBs matches /^anim:[A-Za-z]+$/ (33 distinct
 * keys), so stripping one trailing `_<digits>` is unambiguous — no key
 * itself ends in digits or contains '_'. */

const DELIVERED_RE = /^anim([A-Za-z]+?)(?:_(\d+))?$/;
const CANONICAL_RE = /^anim:[A-Za-z]+$/;

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
 *  through GLTFLoader) pass through with ord 0. */
export function canonicalAnimName(delivered: string): CanonicalAnimName | null {
  if (!delivered) return null;
  if (delivered.startsWith('anim:')) {
    return CANONICAL_RE.test(delivered) ? { name: delivered, ord: 0 } : null;
  }
  const m = DELIVERED_RE.exec(delivered);
  if (!m) return null;
  return { name: 'anim:' + m[1], ord: m[2] ? Number(m[2]) : 0 };
}
