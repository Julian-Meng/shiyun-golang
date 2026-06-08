import * as THREE from "three";
import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { DYNASTIES, DYNASTY_COUNT, bandRadius, spherePoint } from "../data/dynasties";
import { useStore } from "../state/store";

const COUNT = 26000;

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The dense "void" — ambient nebula dust, dynasty-tinted, one draw call.
// Hidden dynasties have their point size zeroed (shader discards size≈0).
export function StarField() {
  const hidden = useStore((s) => s.hidden);

  const built = useMemo(() => {
    const rnd = mulberry32(20260608);
    const totalW = DYNASTIES.reduce((a, d) => a + d.weight, 0);
    const pos = new Float32Array(COUNT * 3);
    const col = new Float32Array(COUNT * 3);
    const size = new Float32Array(COUNT);
    const baseSize = new Float32Array(COUNT);
    const seed = new Float32Array(COUNT);
    const dynId = new Uint8Array(COUNT);
    const tmp = new THREE.Color();
    for (let i = 0; i < COUNT; i++) {
      let r = rnd() * totalW;
      let d = DYNASTIES[0];
      for (const dd of DYNASTIES) {
        if (r < dd.weight) {
          d = dd;
          break;
        }
        r -= dd.weight;
      }
      dynId[i] = d.id;
      const [inner, outer] = bandRadius(d.id);
      const radius = inner + rnd() * (outer - inner);
      const [x, y, z] = spherePoint(radius, rnd(), rnd());
      pos[i * 3] = x + (rnd() - 0.5) * 44;
      pos[i * 3 + 1] = y + (rnd() - 0.5) * 44;
      pos[i * 3 + 2] = z + (rnd() - 0.5) * 44;
      tmp.set(d.color);
      col[i * 3] = tmp.r;
      col[i * 3 + 1] = tmp.g;
      col[i * 3 + 2] = tmp.b;
      const s = 1.1 + rnd() * rnd() * 5.5;
      size[i] = s;
      baseSize[i] = s;
      seed[i] = rnd();
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
      uniforms: { uTime: { value: 0 }, uSizeScale: { value: 340 } },
      vertexShader: /* glsl */ `
        attribute vec3 aColor; attribute float aSize; attribute float aSeed;
        uniform float uTime; uniform float uSizeScale;
        varying vec3 vColor; varying float vTw;
        void main() {
          if (aSize < 0.001) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(aSize * (uSizeScale / -mv.z), 1.0, 42.0);
          vTw = 0.62 + 0.38 * sin(uTime * 0.8 + aSeed * 6.2831853);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor; varying float vTw;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.04, d);
          if (a < 0.02) discard;
          gl_FragColor = vec4(vColor * 1.45, a * vTw);
        }`,
    });
    return { points: new THREE.Points(g, m), baseSize, dynId };
  }, []);

  // Apply dynasty filter by zeroing hidden points' size.
  useEffect(() => {
    const hideById = new Array<boolean>(DYNASTY_COUNT).fill(false);
    for (const d of DYNASTIES) hideById[d.id] = hidden.has(d.key);
    const attr = built.points.geometry.getAttribute("aSize") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < arr.length; i++) arr[i] = hideById[built.dynId[i]] ? 0 : built.baseSize[i];
    attr.needsUpdate = true;
  }, [hidden, built]);

  useFrame((_, dt) => {
    (built.points.material as THREE.ShaderMaterial).uniforms.uTime.value += dt;
  });

  return <primitive object={built.points} />;
}
