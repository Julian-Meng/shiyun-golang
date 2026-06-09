import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { DYNASTY_BY_KEY, DYNASTIES, DYNASTY_COUNT, hashStr } from "../data/dynasties";
import { getPoets, type PoetRow } from "../data/load";
import { useStore } from "../state/store";
import { galaxySpin } from "./galaxyParams";
import { poetPosition, poemOffset } from "./positions";

// Poems as orbiting "planets" around their poet star. Two modes (driven by store.showAllPoems):
//   • OFF (default, 普通机器): only the SELECTED poet's poems orbit — an on-demand 彩蛋 on poet click.
//   • ON  (高性能机器): EVERY poet's poems orbit (857,877 points) — the whole sky becomes star systems.
// Positions are deterministic (positions.ts), so a poem-planet is at the SAME spot the panels /
// search fly to (定位). The layer spins with the shared galaxy angle, exactly like PoetStars, so the
// planets stay locked to their poet as the galaxy turns. *(brightness/size tunable on a real GPU.)*

// dim, small satellites — clearly secondary to the ×2.3 poet stars (so the hierarchy reads).
function planetMaterial(bright: number, sizeScale: number, maxPx: number, twinkle: boolean) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute vec3 aColor; ${twinkle ? "attribute float aSeed; uniform float uTime;" : ""}
      varying vec3 vColor; ${twinkle ? "varying float vTw;" : ""}
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(${sizeScale.toFixed(1)} / -mv.z, 1.0, ${maxPx.toFixed(1)});
        ${twinkle ? "vTw = 0.65 + 0.35 * sin(uTime * 1.7 + aSeed * 6.2831853);" : ""}
        vColor = aColor * ${bright.toFixed(2)};
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor; ${twinkle ? "varying float vTw;" : ""}
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.05, d);
        if (a < 0.02) discard;
        gl_FragColor = vec4(vColor ${twinkle ? "* vTw" : ""}, a ${twinkle ? "* vTw" : ""});
      }`,
  });
}

function buildGeometry(poets: PoetRow[], total: number, withSeed: boolean) {
  const pos = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  const seed = withSeed ? new Float32Array(total) : null;
  const tmp = new THREE.Color();
  let k = 0;
  for (const p of poets) {
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
      if (seed) seed[k] = ((hashStr(p.id + ":" + j) & 0xffff) / 0xffff);
      k++;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  if (seed) geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  geo.setDrawRange(0, k);
  return geo;
}

export function PoemOrbits() {
  const showAll = useStore((s) => s.showAllPoems);
  const selectedPoet = useStore((s) => s.selectedPoet);

  // ALL poets' poems — heavy (≈858k points), built ONLY while the toggle is on. Depends solely on
  // showAll so selecting a poet does NOT rebuild it. Dim + tiny (it's a field, not landmarks).
  const all = useMemo(() => {
    if (!showAll) return null;
    const poets = getPoets();
    let total = 0;
    for (const p of poets) total += Math.max(0, p.poemCount);
    if (!total) return null;
    const geo = buildGeometry(poets, total, false);
    const mat = planetMaterial(1.25, 360, 11, false);
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    return { points, geo, mat };
  }, [showAll]);

  // ONLY the selected poet's poems — cheap (≤~3.6k points), the on-demand 彩蛋 when the toggle is off.
  // Slightly brighter + larger + twinkling so a clicked poet's "system" reads clearly.
  const sel = useMemo(() => {
    if (showAll || !selectedPoet) return null;
    const total = Math.max(0, selectedPoet.poemCount);
    if (!total) return null;
    const geo = buildGeometry([selectedPoet], total, true);
    const mat = planetMaterial(1.9, 520, 20, true);
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    return { points, geo, mat };
  }, [showAll, selectedPoet]);

  useEffect(() => () => { all?.geo.dispose(); all?.mat.dispose(); }, [all]);
  useEffect(() => () => { sel?.geo.dispose(); sel?.mat.dispose(); }, [sel]);

  const spinRef = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (spinRef.current) spinRef.current.rotation.y = galaxySpin.angle; // lock to the poet layer's spin
    if (sel) (sel.mat.uniforms.uTime.value as number) += dt;
  });

  return (
    <group ref={spinRef}>
      {all && <primitive object={all.points} />}
      {sel && <primitive object={sel.points} />}
    </group>
  );
}
