import * as THREE from "three";
import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { DYNASTY_BY_KEY, DYNASTIES, DYNASTY_COUNT, bandRadius, hashStr } from "../data/dynasties";
import { getPoets, type PoetRow } from "../data/load";
import { useStore } from "../state/store";
import { pickTargets } from "./picking";
import { GALAXY, gauss3 } from "./galaxyParams";

// Deterministic galaxy position: radius = dynasty shell (time = depth), angle biased
// onto the spiral arms so the poet layer winds into the same galaxy as the backdrop.
export function poetPosition(p: PoetRow): [number, number, number] {
  const dyn = DYNASTY_BY_KEY[p.dynasty] ?? DYNASTIES[DYNASTY_COUNT - 1];
  const [inner, outer] = bandRadius(dyn.id);
  const h = hashStr(p.id + p.name);
  const rr = inner + ((h % 997) / 997) * (outer - inner);
  const t = rr / GALAXY.RADIUS;
  const branch = ((h % GALAXY.BRANCHES) / GALAXY.BRANCHES) * Math.PI * 2;
  const twist = t * GALAXY.TWIST;
  const a = ((h >>> 3) & 0xff) / 255, b = ((h >>> 11) & 0xff) / 255, cc = ((h >>> 19) & 0xff) / 255;
  const armDev = gauss3(a, b, cc) * GALAXY.ARM_SPREAD;
  const ang = branch + twist + armDev;
  const yj = ((h >>> 24) & 0xff) / 255 - 0.5;
  return [Math.cos(ang) * rr, yj * rr * GALAXY.THICKNESS * 1.4, Math.sin(ang) * rr];
}

export function PoetStars() {
  const hidden = useStore((s) => s.hidden);
  const hoverId = useStore((s) => s.hoverPoetId);
  const selId = useStore((s) => s.selectedPoet?.id ?? null);

  const built = useMemo(() => {
    const poets = getPoets();
    const n = poets.length;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const baseSize = new Float32Array(n);
    const seed = new Float32Array(n);
    const dynId = new Uint8Array(n);
    const tmp = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const p = poets[i];
      const dyn = DYNASTY_BY_KEY[p.dynasty] ?? DYNASTIES[DYNASTY_COUNT - 1];
      dynId[i] = dyn.id;
      const [x, y, z] = poetPosition(p);
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      tmp.set(dyn.color);
      col[i * 3] = tmp.r;
      col[i * 3 + 1] = tmp.g;
      col[i * 3 + 2] = tmp.b;
      const s = 1.4 + p.clusterSize * 0.32;
      size[i] = s;
      baseSize[i] = s;
      seed[i] = (hashStr(p.id) & 0xffff) / 0xffff;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uSizeScale: { value: 900 } },
      vertexShader: /* glsl */ `
        attribute vec3 aColor; attribute float aSize; attribute float aSeed;
        uniform float uTime; uniform float uSizeScale;
        varying vec3 vColor; varying float vTw;
        void main() {
          if (aSize < 0.001) { gl_Position = vec4(2.0,2.0,2.0,1.0); gl_PointSize = 0.0; return; }
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(aSize * (uSizeScale / -mv.z), 1.2, 70.0);
          vTw = 0.7 + 0.3 * sin(uTime * 0.7 + aSeed * 6.2831853);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor; varying float vTw;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.03, d);
          if (a < 0.02) discard;
          gl_FragColor = vec4(vColor * 1.9, a * vTw);
        }`,
    });
    const points = new THREE.Points(g, m);
    points.frustumCulled = false;
    pickTargets.poetPoints = points;
    pickTargets.poets = poets;
    pickTargets.positions = pos;
    pickTargets.sizes = baseSize;
    return { points, baseSize, dynId, poets };
  }, []);

  // dynasty filter → zero hidden poets' size
  useEffect(() => {
    const hide = new Array<boolean>(DYNASTY_COUNT).fill(false);
    for (const d of DYNASTIES) hide[d.id] = hidden.has(d.key);
    const attr = built.points.geometry.getAttribute("aSize") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < arr.length; i++) arr[i] = hide[built.dynId[i]] ? 0 : built.baseSize[i];
    attr.needsUpdate = true;
  }, [hidden, built]);

  useFrame((_, dt) => {
    (built.points.material as THREE.ShaderMaterial).uniforms.uTime.value += dt;
  });

  // labels ONLY for the hovered + selected poet (no names floating in empty void)
  const byId = useMemo(() => new Map(built.poets.map((p) => [p.id, p])), [built]);
  const shown: PoetRow[] = [];
  const seen = new Set<string>();
  for (const id of [hoverId, selId]) {
    if (id && !seen.has(id)) {
      const p = byId.get(id);
      if (p) {
        shown.push(p);
        seen.add(id);
      }
    }
  }

  return (
    <group>
      <primitive object={built.points} />
      {shown.map((p) => {
        const isFocus = p.id === hoverId || p.id === selId;
        const dyn = DYNASTY_BY_KEY[p.dynasty] ?? DYNASTIES[DYNASTY_COUNT - 1];
        return (
          <Html
            key={p.id}
            position={poetPosition(p)}
            center
            zIndexRange={[8, 0]}
            style={{ pointerEvents: "none" }}
          >
            <div className={isFocus ? "poet-label focus" : "poet-label"} style={{ color: dyn.color }}>
              {p.name}
            </div>
          </Html>
        );
      })}
    </group>
  );
}
