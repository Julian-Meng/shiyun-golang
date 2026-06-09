import * as THREE from "three";
import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { DYNASTY_BY_KEY, DYNASTIES, DYNASTY_COUNT, hashStr } from "../data/dynasties";
import { getPoets, type PoetRow } from "../data/load";
import { useStore } from "../state/store";
import { galaxySpin } from "./galaxyParams";
import { poetPosition, poemOffset } from "./positions";
import { encodePoemPickColor } from "./gpuPick";
import { pickTargets } from "./picking";

// Poems as a soft 3D star-cluster around their poet (positions.ts). Two modes (store.showAllPoems):
//   • OFF (default, 普通机器): only the SELECTED poet's poems appear — on poet click they FLASH then
//     fade IN (闪光渐入), and fade OUT when you leave; the selected cluster is boosted (brighter +
//     larger + twinkling) so it reads at a glance as a 星群 belonging to that poet.
//   • ON  (高性能机器): EVERY poet's poems render — one dim 857,877-point field, built once.
// The layer spins with the shared galaxy angle (locked to PoetStars). Planets are clickable (gpuPick).
// *(brightness/size/cluster-radius tunable on a real GPU — headless can't render the additive field.)*

const FADE_IN = 0.55; // s — flash → settle
const FADE_OUT = 0.45; // s — gentle dim-out

// dim, small satellites — secondary to the ×2.3 poet stars. uAlpha drives fade in/out; uFlare is the
// birth flash (size + brightness bump that decays). The all-layer leaves both at their defaults (static).
function planetMaterial(bright: number, sizeScale: number, maxPx: number, twinkle: boolean) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uAlpha: { value: 1 }, uFlare: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute vec3 aColor; ${twinkle ? "attribute float aSeed;" : ""}
      uniform float uTime; uniform float uAlpha; uniform float uFlare;
      varying vec3 vColor; varying float vTw; varying float vAlpha;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float flareSize = 1.0 + uFlare * 1.8;             // birth flash → larger, then settles
        gl_PointSize = clamp(${sizeScale.toFixed(1)} / -mv.z, 1.0, ${maxPx.toFixed(1)}) * flareSize;
        vTw = ${twinkle ? "0.65 + 0.35 * sin(uTime * 1.7 + aSeed * 6.2831853)" : "1.0"};
        vColor = aColor * ${bright.toFixed(2)} * (1.0 + uFlare * 1.4); // brighter at birth
        vAlpha = uAlpha;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor; varying float vTw; varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.05, d);
        if (a < 0.02) discard;
        gl_FragColor = vec4(vColor * vTw, a * vTw * vAlpha);
      }`,
  });
}

type PoemRef = { poet: PoetRow; poemIdx: number } | null;

function buildGeometry(poets: PoetRow[], total: number, withSeed: boolean) {
  const pos = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  const pick = new Float32Array(total * 3); // colour-encoded local poem id → clickable planets
  const seed = withSeed ? new Float32Array(total) : null;
  const poetIdxOf = new Int32Array(total); // local id → which poet (index into `poets`)
  const poemIdxOf = new Int32Array(total); // local id → which poem (index in that poet's poems[])
  const tmp = new THREE.Color();
  let k = 0;
  for (let pi = 0; pi < poets.length; pi++) {
    const p = poets[pi];
    const P = Math.max(0, p.poemCount);
    if (!P) continue;
    const dyn = DYNASTY_BY_KEY[p.dynasty] ?? DYNASTIES[DYNASTY_COUNT - 1];
    const [cx, cy, cz] = poetPosition(p); // poet centre computed ONCE per poet
    tmp.set(dyn.color);
    const r = tmp.r, g = tmp.g, b = tmp.b;
    for (let j = 0; j < P && k < total; j++) {
      const [dx, dy, dz] = poemOffset(p, j);
      pos[k * 3] = cx + dx;
      pos[k * 3 + 1] = cy + dy;
      pos[k * 3 + 2] = cz + dz;
      col[k * 3] = r;
      col[k * 3 + 1] = g;
      col[k * 3 + 2] = b;
      const [pr, pg, pb] = encodePoemPickColor(k);
      pick[k * 3] = pr;
      pick[k * 3 + 1] = pg;
      pick[k * 3 + 2] = pb;
      poetIdxOf[k] = pi;
      poemIdxOf[k] = j;
      if (seed) seed[k] = ((hashStr(p.id + ":" + j) & 0xffff) / 0xffff);
      k++;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("aPickColor", new THREE.BufferAttribute(pick, 3));
  if (seed) geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  geo.setDrawRange(0, k);
  const resolve = (localId: number): PoemRef =>
    localId >= 0 && localId < k ? { poet: poets[poetIdxOf[localId]], poemIdx: poemIdxOf[localId] } : null;
  return { geo, resolve };
}

interface Layer {
  points: THREE.Points;
  geo: THREE.BufferGeometry;
  mat: THREE.ShaderMaterial;
  resolve: (id: number) => PoemRef;
  sizeScale: number;
  maxPx: number;
  born: number;
  dying: boolean;
  dyingAt: number;
}

function makeLayer(
  poets: PoetRow[],
  total: number,
  o: { bright: number; sizeScale: number; maxPx: number; twinkle: boolean; born: number },
): Layer | null {
  if (!total) return null;
  const { geo, resolve } = buildGeometry(poets, total, o.twinkle);
  const mat = planetMaterial(o.bright, o.sizeScale, o.maxPx, o.twinkle);
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return { points, geo, mat, resolve, sizeScale: o.sizeScale, maxPx: o.maxPx, born: o.born, dying: false, dyingAt: 0 };
}

export function PoemOrbits() {
  const showAll = useStore((s) => s.showAllPoems);
  const selectedPoet = useStore((s) => s.selectedPoet);
  const groupRef = useRef<THREE.Group>(null);
  const clock = useRef(0);
  const allRef = useRef<Layer | null>(null); // persistent "show all" field
  const selLayers = useRef<Layer[]>([]); // selected-poet clusters (fading in/out)

  const register = (L: Layer | null) => {
    pickTargets.poemLayer = L
      ? { geometry: L.geo, sizeScale: L.sizeScale, maxPx: L.maxPx, resolve: L.resolve }
      : null;
  };

  // ALL field: build/teardown when the 行星 toggle flips (no fade — it's a deliberate overview).
  useEffect(() => {
    const grp = groupRef.current;
    if (!grp || !showAll) return;
    const poets = getPoets();
    let total = 0;
    for (const p of poets) total += Math.max(0, p.poemCount);
    const L = makeLayer(poets, total, { bright: 1.25, sizeScale: 360, maxPx: 11, twinkle: false, born: clock.current });
    if (!L) return;
    allRef.current = L;
    grp.add(L.points);
    register(L);
    return () => {
      grp.remove(L.points);
      L.geo.dispose();
      L.mat.dispose();
      allRef.current = null;
      register(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAll]);

  // SELECTED poet's cluster: fade the previous one OUT, FLASH the new one in (闪光渐入). Boosted
  // (brighter + larger + twinkling) so the selected poet's 星群 is obvious. Skipped while 行星 is ON
  // (the all-field already shows it).
  useEffect(() => {
    const grp = groupRef.current;
    if (!grp) return;
    for (const L of selLayers.current) {
      if (!L.dying) { L.dying = true; L.dyingAt = clock.current; }
    }
    if (!showAll && selectedPoet) {
      const L = makeLayer([selectedPoet], Math.max(0, selectedPoet.poemCount), {
        bright: 2.3, sizeScale: 560, maxPx: 24, twinkle: true, born: clock.current,
      });
      if (L) {
        L.mat.uniforms.uAlpha.value = 0; // start invisible → fade in
        L.mat.uniforms.uFlare.value = 1; // start flashed → settle
        selLayers.current.push(L);
        grp.add(L.points);
        register(L);
      } else {
        register(null);
      }
    } else if (!showAll) {
      register(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPoet, showAll]);

  // teardown everything on unmount
  useEffect(() => {
    return () => {
      const grp = groupRef.current;
      for (const L of selLayers.current) { grp?.remove(L.points); L.geo.dispose(); L.mat.dispose(); }
      selLayers.current = [];
      pickTargets.poemLayer = null;
    };
  }, []);

  useFrame((_, dt) => {
    clock.current += dt;
    const t = clock.current;
    const grp = groupRef.current;
    if (grp) grp.rotation.y = galaxySpin.angle; // lock to the poet layer's spin
    if (allRef.current) allRef.current.mat.uniforms.uTime.value = t;

    const keep: Layer[] = [];
    for (const L of selLayers.current) {
      L.mat.uniforms.uTime.value = t;
      if (!L.dying) {
        const k = Math.min(1, (t - L.born) / FADE_IN);
        L.mat.uniforms.uAlpha.value = k; // fade in
        L.mat.uniforms.uFlare.value = 1 - k; // flash → settle
        keep.push(L);
      } else {
        const k = (t - L.dyingAt) / FADE_OUT;
        if (k >= 1) { grp?.remove(L.points); L.geo.dispose(); L.mat.dispose(); continue; } // gone
        L.mat.uniforms.uAlpha.value = Math.max(0, 1 - k); // dim out
        L.mat.uniforms.uFlare.value = 0;
        keep.push(L);
      }
    }
    selLayers.current = keep;
  });

  return <group ref={groupRef} />;
}
