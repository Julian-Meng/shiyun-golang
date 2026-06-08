import * as THREE from "three";
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useStore } from "../state/store";
import { spinXZ } from "./galaxyParams";

// Small, prominent, twinkling light spots where the user has pulled a poem out of the void —
// "捕捉到一小片虚空" rather than a giant white ball. Lifecycle (animated in useFrame):
//   • fade IN over FADE_IN;  • twinkle gently while alive;
//   • when more than ALIVE_CAP are alive, the OLDEST flickers out (twinkle → vanish) over FADE_OUT;
//   • a spot too far from the camera is culled (perf). Gold = 格律-valid, pale blue = noise.
const ALIVE_CAP = 20;
const FADE_IN = 0.14; // s — quick pop-in so a click reads as a flare, not a slow swell
const FADE_OUT = 1.0; // s — fast flicker then gone
const CULL_DIST = 1700; // world units from camera → retire
const MAXBUF = 40; // GPU buffer capacity

interface Marker {
  id: number;
  pos: [number, number, number];
  valid: boolean;
  birth: number;
  death: number | null;
}

export function PulledStars() {
  const pulls = useStore((s) => s.pulls);
  const { camera } = useThree();
  const clock = useRef(0);
  const markers = useRef<Marker[]>([]);
  const seen = useRef<Set<number>>(new Set());

  const obj = useMemo(() => {
    const pos = new Float32Array(MAXBUF * 3);
    const col = new Float32Array(MAXBUF * 3);
    const pha = new Float32Array(MAXBUF);
    const fla = new Float32Array(MAXBUF); // birth-flare amount (0..~3), decays — drives the size flash
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aColor", new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aPhase", new THREE.BufferAttribute(pha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aFlare", new THREE.BufferAttribute(fla, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute vec3 aColor; attribute float aPhase; attribute float aFlare;
        uniform float uTime; varying vec3 vColor;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float tw = 0.82 + 0.18 * sin(uTime * 3.0 + aPhase * 6.2831853);
          // birth swell: a fresh pull POPS large+bright (like a nearby decoration star, so it's easy
          // to spot the instant you click), then shrinks to a small quiet marker as aFlare decays.
          gl_PointSize = clamp((520.0 + aFlare * 4500.0) / -mv.z, 3.5, 64.0) * tw;
          gl_Position = projectionMatrix * mv;
          vColor = aColor;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
          float core = exp(-d * d * 7.0);            // tight bright core
          float ring = smoothstep(0.95, 0.45, d) * 0.22; // faint halo
          float a = core + ring;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor * a, a);
        }`,
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    return { pts, g, pos, col, pha, fla, m };
  }, []);

  useFrame((_, dt) => {
    clock.current += Math.min(dt, 0.05);
    const t = clock.current;
    obj.m.uniforms.uTime.value = t;

    // ingest new pulls (by stable id)
    const storeIds = new Set<number>();
    for (const p of pulls) {
      storeIds.add(p.id);
      if (!seen.current.has(p.id)) {
        seen.current.add(p.id);
        markers.current.push({ id: p.id, pos: p.pos, valid: p.valid, birth: t, death: null });
      }
    }
    seen.current = new Set([...seen.current].filter((id) => storeIds.has(id))); // keep bounded

    // FIFO cap: retire the oldest alive beyond ALIVE_CAP
    const alive = markers.current.filter((m) => m.death === null);
    if (alive.length > ALIVE_CAP) {
      alive.sort((a, b) => a.birth - b.birth);
      for (let i = 0; i < alive.length - ALIVE_CAP; i++) alive[i].death = t;
    }
    // distance cull
    const cam = camera.position;
    for (const m of markers.current) {
      if (m.death === null) {
        const [wx, wz] = spinXZ(m.pos[0], m.pos[2]); // LOCAL → WORLD (galaxy spin)
        const dx = wx - cam.x, dy = m.pos[1] - cam.y, dz = wz - cam.z;
        if (dx * dx + dy * dy + dz * dz > CULL_DIST * CULL_DIST) m.death = t;
      }
    }
    // drop finished
    markers.current = markers.current.filter((m) => m.death === null || t - m.death < FADE_OUT);

    // rebuild GPU buffers
    let n = 0;
    for (const m of markers.current) {
      if (n >= MAXBUF) break;
      let alpha: number;
      if (m.death !== null) {
        const k = (t - m.death) / FADE_OUT; // 0→1
        const flick = 0.5 + 0.5 * Math.sin(k * 26); // fast star-flicker
        alpha = (1 - k) * (0.35 + 0.65 * flick);
      } else {
        alpha = Math.min(1, (t - m.birth) / FADE_IN);
      }
      const c = m.valid ? [1.0, 0.84, 0.4] : [0.78, 0.86, 1.0];
      // birth flare: a fresh pull flashes BRIGHT + LARGE for the first instant (so you spot it
      // immediately even when it lands far ahead), then both brightness and size settle to the
      // quiet marker. Bloom turns the flash into a soft glow. (定位虚空 reuses this same marker.)
      const flareT = Math.max(0, 1 - (t - m.birth) / 2.2); // 1 at birth → 0 by 2.2 s
      const b = alpha * 2.0 * (1 + 4.0 * flareT);
      const [wx, wz] = spinXZ(m.pos[0], m.pos[2]); // LOCAL → WORLD (galaxy spin)
      obj.pos[n * 3] = wx;
      obj.pos[n * 3 + 1] = m.pos[1];
      obj.pos[n * 3 + 2] = wz;
      obj.col[n * 3] = c[0] * b;
      obj.col[n * 3 + 1] = c[1] * b;
      obj.col[n * 3 + 2] = c[2] * b;
      obj.pha[n] = (m.id % 100) / 100;
      obj.fla[n] = flareT * 3.0; // size flash boost (0..3), decays with flareT
      n++;
    }
    obj.g.setDrawRange(0, n);
    obj.g.attributes.position.needsUpdate = true;
    obj.g.attributes.aColor.needsUpdate = true;
    (obj.g.attributes.aPhase as THREE.BufferAttribute).needsUpdate = true;
    (obj.g.attributes.aFlare as THREE.BufferAttribute).needsUpdate = true;
  });

  return <primitive object={obj.pts} />;
}
