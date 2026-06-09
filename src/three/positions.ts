// Deterministic galaxy-space positions for poets AND their poems. Pure functions (no GPU/React),
// shared by the render layers (PoetStars / PoemOrbits), the panels (locate-to-planet), and search,
// so a poem's "planet" is at the SAME spot wherever it's referenced. All positions are in the LOCAL
// galaxy frame (callers apply the shared spinXZ to get world coords).
import { DYNASTY_BY_KEY, DYNASTIES, DYNASTY_COUNT, bandRadius, hashStr, R_MIN, R_MAX } from "../data/dynasties";
import type { PoetRow } from "../data/load";
import { GALAXY, gauss3 } from "./galaxyParams";

// Mean radius = dynasty shell (time = depth) with a GAUSSIAN radial spread that BLEEDS into
// neighbouring dynasty bands (colours blend into a gradient, not hard rings); angle is biased onto
// the spiral arms (same arms as the backdrop). Y uses a thicker gaussian that swells toward the
// centre (bulge). Near the core a strong azimuthal + in-plane scatter dissolves the 4-arm cross into
// a filled round disc (round-5 feedback).
export function poetPosition(p: PoetRow): [number, number, number] {
  const dyn = DYNASTY_BY_KEY[p.dynasty] ?? DYNASTIES[DYNASTY_COUNT - 1];
  const [inner, outer] = bandRadius(dyn.id);
  const h = hashStr(p.id + p.name);
  const center = (inner + outer) / 2;
  const width = outer - inner;
  const ra = ((h >>> 2) & 0xff) / 255, rb = ((h >>> 10) & 0xff) / 255, rc = ((h >>> 18) & 0xff) / 255;
  let rr = center + gauss3(ra, rb, rc) * width * 1.5; // σ ≈ 1 band → adjacent dynasty colours blend
  rr = Math.max(R_MIN * 0.35, Math.min(R_MAX * 1.06, rr));
  const t = rr / GALAXY.RADIUS;
  const branch = ((h % GALAXY.BRANCHES) / GALAXY.BRANCHES) * Math.PI * 2;
  const twist = t * GALAXY.TWIST;
  const a = ((h >>> 3) & 0xff) / 255, b = ((h >>> 11) & 0xff) / 255, cc = ((h >>> 19) & 0xff) / 255;
  // tight arm σ → poets concentrate ONTO the same 4 spiral arms as the backdrop (woven in,
  // not a separate ring layer); the dynasty colour then reads as a gradient ALONG the arms.
  const armDev = gauss3(a, b, cc) * GALAXY.ARM_SPREAD * 0.45;
  // Wider, stronger azimuthal dissolve: full random angle over the whole core out to t≈0.5
  // (was 0.42) so the 4-arm X is gone and the centre reads as a filled round disc, not a cross.
  const az = ((h >>> 24) & 0xff) / 255;
  const centerBlur = Math.max(0, 0.5 - t) / 0.5; // 1 at core → 0 by t=0.5
  const ang = branch + twist + armDev + (az - 0.5) * Math.PI * 2 * centerBlur;
  const ya = ((h >>> 5) & 0xff) / 255, yb = ((h >>> 13) & 0xff) / 255, yc = ((h >>> 21) & 0xff) / 255;
  const bulge = 1 + Math.max(0, 0.45 - t) * 2.6; // taller near the centre, thin at the rim
  const y = gauss3(ya, yb, yc) * rr * GALAXY.THICKNESS * 2.1 * bulge;
  // in-plane x/z scatter (like the backdrop's `scatter`): gives each arm real width so the
  // poet layer is a volumetric ribbon, NOT a thin sheet that reads as a wall edge-on.
  const h2 = hashStr(p.name + "#" + p.id);
  const sxu = ((h2 >>> 2) & 0xff) / 255, sxs = ((h2 >>> 10) & 0xff) / 255;
  const szu = ((h2 >>> 18) & 0xff) / 255, szs = ((h2 >>> 26) & 0xff) / 255;
  const scat = (u: number, sgn: number) => Math.pow(u, 2.2) * (sgn < 0.5 ? -1 : 1) * 0.22 * rr;
  // The rr-scaled scatter shrinks to ~0 near the centre. Add a strong ABSOLUTE in-plane x/z scatter
  // that peaks at the core and fades by t≈0.5, dissolving the centre into a diffuse round cloud.
  const cs = Math.max(0, 0.5 - t) / 0.5; // 1 at core → 0 by t=0.5 (wider band)
  const coreScat = cs * cs * GALAXY.RADIUS * 0.22; // ~1.5× the round-4 fill radius
  const cjx = (((h2 >>> 5) & 0xff) / 255 - 0.5) * 2;
  const cjz = (((h2 >>> 13) & 0xff) / 255 - 0.5) * 2;
  return [
    Math.cos(ang) * rr + scat(sxu, sxs) + cjx * coreScat,
    y,
    Math.sin(ang) * rr + scat(szu, szs) + cjz * coreScat,
  ];
}

// ── Poems as a soft 3D star-cluster around their poet ───────────────────────────────────────────
// A poem at index `poemIdx` of poet `p` sits in a SOFT, near-spherical cloud around the poet star —
// NOT a flat disc (a flat disc read as a rectangular "block" edge-on and all discs aligned to the
// galaxy plane → the sky looked tiled). Directions use a spherical-Fibonacci spread (even, no
// clumping) and the radius is volume-filling with per-point jitter (soft edge, no hard shell). A
// prolific poet (李白) becomes a dense little cluster; a one-poem poet a single near satellite.
const GOLDEN = Math.PI * (3 - Math.sqrt(5)); // ~2.39996 rad — even angular spread

/** Cluster radius (LOCAL units) of a poet's poem-cloud — grows with poemCount, capped to limit overlap. */
export function poemSystemRadius(poemCount: number): number {
  return Math.min(90, 8 + 2.0 * Math.sqrt(Math.max(1, poemCount)));
}

/** OFFSET (relative to the poet centre) of poem `poemIdx` in the soft 3D cluster. Cheap — no
 *  poetPosition call — so the "show ALL poems" build computes the poet centre ONCE and adds this. */
export function poemOffset(p: PoetRow, poemIdx: number): [number, number, number] {
  const P = Math.max(1, p.poemCount);
  const R0 = poemSystemRadius(P);
  // even direction on a sphere (spherical Fibonacci) → a soft 3D cluster, never a flat disc
  const yd = 1 - (2 * (poemIdx + 0.5)) / P; // +1..-1 (latitude)
  const rxy = Math.sqrt(Math.max(0, 1 - yd * yd));
  const phase = (hashStr(p.id) & 0xffff) * 0.001; // per-poet phase so clusters aren't aligned
  const th = poemIdx * GOLDEN + phase;
  const h = hashStr(p.id + ":" + poemIdx);
  const jitter = 0.7 + 0.55 * (((h >>> 8) & 0xff) / 255); // soft, non-shell boundary (no hard edge)
  const rho = R0 * Math.cbrt((poemIdx + 0.5) / P) * jitter; // volume-filling radius
  const FLAT = 0.85; // very slightly flattened toward the galaxy plane, but essentially spherical
  return [rxy * Math.cos(th) * rho, yd * rho * FLAT, rxy * Math.sin(th) * rho];
}

/** Absolute LOCAL position of a poem-planet (poet centre + orbital offset). */
export function poemPosition(p: PoetRow, poemIdx: number): [number, number, number] {
  const [cx, cy, cz] = poetPosition(p);
  const [dx, dy, dz] = poemOffset(p, poemIdx);
  return [cx + dx, cy + dy, cz + dz];
}
