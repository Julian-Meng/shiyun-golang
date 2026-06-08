import * as THREE from "three";

// A soft radial disc, so GL points render as round glows instead of hard squares.
let _disc: THREE.Texture | null = null;
export function discTexture(): THREE.Texture {
  if (_disc) return _disc;
  const s = 64;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.85)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  _disc = new THREE.CanvasTexture(c);
  _disc.needsUpdate = true;
  return _disc;
}
