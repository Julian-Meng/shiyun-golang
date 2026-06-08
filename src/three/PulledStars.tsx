import * as THREE from "three";
import { useMemo } from "react";
import { useStore } from "../state/store";
import { discTexture } from "./disc";

// Gold marks where the user has pulled poems out of the void.
// Gold = happened to land 格律-valid; pale blue = ordinary noise.
export function PulledStars() {
  const pulls = useStore((s) => s.pulls);

  const points = useMemo(() => {
    const n = pulls.length;
    const cap = Math.max(n, 1);
    const pos = new Float32Array(cap * 3);
    const col = new Float32Array(cap * 3);
    pulls.forEach((p, i) => {
      pos[i * 3] = p.pos[0];
      pos[i * 3 + 1] = p.pos[1];
      pos[i * 3 + 2] = p.pos[2];
      const c = p.valid ? [1.0, 0.84, 0.4] : [0.78, 0.84, 1.0];
      col[i * 3] = c[0];
      col[i * 3 + 1] = c[1];
      col[i * 3 + 2] = c[2];
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setDrawRange(0, n);
    const m = new THREE.PointsMaterial({
      size: 22,
      sizeAttenuation: true,
      vertexColors: true,
      map: discTexture(),
      transparent: true,
      depthWrite: false,
      alphaTest: 0.01,
      blending: THREE.AdditiveBlending,
    });
    return new THREE.Points(g, m);
  }, [pulls]);

  return <primitive object={points} />;
}
