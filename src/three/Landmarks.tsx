import * as THREE from "three";
import { useMemo } from "react";
import { Html } from "@react-three/drei";
import { DYNASTY_BY_KEY, bandRadius, hashStr, spherePoint } from "../data/dynasties";
import { FAMOUS_POETS } from "../data/famousPoets";
import { useStore } from "../state/store";
import { discTexture } from "./disc";

interface Placed {
  name: string;
  key: string;
  color: string;
  pos: [number, number, number];
}

function placeLandmarks(): Placed[] {
  return FAMOUS_POETS.map((p) => {
    const dyn = DYNASTY_BY_KEY[p.dynasty];
    const [inner, outer] = bandRadius(dyn.id);
    const mid = (inner + outer) / 2;
    const h = hashStr(p.name + p.dynasty);
    const u = (h & 0xffff) / 0xffff;
    const v = ((h >>> 16) & 0xffff) / 0xffff;
    return { name: p.name, key: p.dynasty, color: dyn.color, pos: spherePoint(mid, u, v) };
  });
}

// Named anchor stars for famous poets (placeholder until the full poet set loads).
export function Landmarks() {
  const hidden = useStore((s) => s.hidden);
  const all = useMemo(placeLandmarks, []);
  const placed = useMemo(() => all.filter((p) => !hidden.has(p.key)), [all, hidden]);

  const cores = useMemo(() => {
    const pos = new Float32Array(Math.max(placed.length, 1) * 3);
    const col = new Float32Array(Math.max(placed.length, 1) * 3);
    const tmp = new THREE.Color();
    const white = new THREE.Color("#ffffff");
    placed.forEach((p, i) => {
      pos[i * 3] = p.pos[0];
      pos[i * 3 + 1] = p.pos[1];
      pos[i * 3 + 2] = p.pos[2];
      tmp.set(p.color).lerp(white, 0.45);
      col[i * 3] = tmp.r;
      col[i * 3 + 1] = tmp.g;
      col[i * 3 + 2] = tmp.b;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setDrawRange(0, placed.length);
    const m = new THREE.PointsMaterial({
      size: 30,
      sizeAttenuation: true,
      vertexColors: true,
      map: discTexture(),
      transparent: true,
      depthWrite: false,
      alphaTest: 0.01,
      blending: THREE.AdditiveBlending,
    });
    return new THREE.Points(g, m);
  }, [placed]);

  return (
    <group>
      <primitive object={cores} />
      {placed.map((p) => (
        <Html
          key={p.name}
          position={p.pos}
          center
          distanceFactor={900}
          zIndexRange={[10, 0]}
          style={{ pointerEvents: "none" }}
        >
          <div className="poet-label" style={{ color: p.color }}>
            {p.name}
          </div>
        </Html>
      ))}
    </group>
  );
}
