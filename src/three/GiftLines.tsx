import * as THREE from "three";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "../state/store";
import { getPoet, loadGifts } from "../data/load";
import { DYNASTY_BY_KEY, DYNASTIES, DYNASTY_COUNT } from "../data/dynasties";
import { poetPosition } from "./PoetStars";
import type { GiftEdge } from "../data/contract";

// 赠诗 network: soft curved filaments between poets one dedicated a poem to (寄/赠/和/次韵…).
// Each edge is a quadratic Bézier arc (control point bowed perpendicular to the chord) sampled
// into a soft polyline that FADES at both endpoints — so lines emerge gently from the stars and
// arc rather than meeting in hard straight Vs. Selecting a poet lights up their往来.
const STEPS = 24; // samples per arc → smooth curve
const BOW = 0.26; // arc height as a fraction of chord length (graceful bow)
const AMBIENT_MIN_W = 2; // with no poet selected, show only repeated (weight≥2) relationships

interface Edge {
  pts: Float32Array; // (STEPS+1)*3 sampled curve positions
  base: Float32Array; // (STEPS+1)*3 base colour per point (dynasty lerp × endpoint fade)
  fromDyn: string;
  toDyn: string;
  from: string;
  to: string;
  w: number; // dedication weight (# poems)
}

const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _ctrl = new THREE.Vector3();
const _chord = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _perp = new THREE.Vector3();
const _ca = new THREE.Color();
const _cb = new THREE.Color();
const _cc = new THREE.Color();

export function GiftLines() {
  const showGifts = useStore((s) => s.showGifts);
  const hidden = useStore((s) => s.hidden);
  const selId = useStore((s) => s.selectedPoet?.id ?? null);
  const [raw, setRaw] = useState<GiftEdge[] | null>(null);

  useEffect(() => {
    if (showGifts && !raw) loadGifts().then(setRaw);
  }, [showGifts, raw]);

  // resolve each edge to a bowed, endpoint-faded curve once (per dataset).
  const edges = useMemo<Edge[]>(() => {
    if (!raw) return [];
    const fallback = DYNASTIES[DYNASTY_COUNT - 1];
    const out: Edge[] = [];
    for (const [from, to, w] of raw) {
      const pf = getPoet(from);
      const pt = getPoet(to);
      if (!pf || !pt) continue;
      _a.set(...poetPosition(pf));
      _b.set(...poetPosition(pt));
      _mid.addVectors(_a, _b).multiplyScalar(0.5);
      _chord.subVectors(_b, _a);
      const len = _chord.length() || 1;
      // bow perpendicular to the chord, biased toward galactic "up"; fall back to radial-out.
      _perp.copy(_up).addScaledVector(_chord, -_up.dot(_chord) / (len * len));
      if (_perp.lengthSq() < 1e-4) _perp.copy(_mid).normalize();
      _perp.normalize();
      _ctrl.copy(_mid).addScaledVector(_perp, len * BOW);
      _ca.set((DYNASTY_BY_KEY[pf.dynasty] ?? fallback).color);
      _cb.set((DYNASTY_BY_KEY[pt.dynasty] ?? fallback).color);

      const pts = new Float32Array((STEPS + 1) * 3);
      const base = new Float32Array((STEPS + 1) * 3);
      for (let s = 0; s <= STEPS; s++) {
        const t = s / STEPS;
        const u = 1 - t;
        // quadratic Bézier B(t) = u²·a + 2ut·ctrl + t²·b
        _v.set(0, 0, 0)
          .addScaledVector(_a, u * u)
          .addScaledVector(_ctrl, 2 * u * t)
          .addScaledVector(_b, t * t);
        pts[s * 3] = _v.x;
        pts[s * 3 + 1] = _v.y;
        pts[s * 3 + 2] = _v.z;
        const fade = Math.sin(Math.PI * t); // 0 at ends → soft emergence, 1 at middle
        _cc.copy(_ca).lerp(_cb, t).multiplyScalar(fade);
        base[s * 3] = _cc.r;
        base[s * 3 + 1] = _cc.g;
        base[s * 3 + 2] = _cc.b;
      }
      out.push({ pts, base, fromDyn: pf.dynasty, toDyn: pt.dynasty, from, to, w });
    }
    return out;
  }, [raw]);

  // (re)build the line geometry on visibility / selection change — only colours + which edges
  // are included change; the curve points are precomputed.
  const object = useMemo(() => {
    if (!edges.length) return null;
    const pos: number[] = [];
    const col: number[] = [];
    for (const e of edges) {
      if (hidden.has(e.fromDyn) || hidden.has(e.toDyn)) continue;
      const hot = selId !== null && (e.from === selId || e.to === selId);
      // selected → a clean ego-network (only this poet's arcs); ambient → only strong edges
      if (selId !== null) {
        if (!hot) continue;
      } else if (e.w < AMBIENT_MIN_W) continue;
      const factor = hot ? 1.5 : 0.34;
      for (let s = 0; s < STEPS; s++) {
        const i0 = s * 3;
        const i1 = (s + 1) * 3;
        pos.push(e.pts[i0], e.pts[i0 + 1], e.pts[i0 + 2], e.pts[i1], e.pts[i1 + 1], e.pts[i1 + 2]);
        col.push(
          e.base[i0] * factor, e.base[i0 + 1] * factor, e.base[i0 + 2] * factor,
          e.base[i1] * factor, e.base[i1 + 1] * factor, e.base[i1 + 2] * factor,
        );
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(col), 3));
    const m = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ls = new THREE.LineSegments(g, m);
    ls.frustumCulled = false;
    return ls;
  }, [edges, hidden, selId]);

  useEffect(() => {
    return () => {
      if (object) {
        object.geometry.dispose();
        (object.material as THREE.Material).dispose();
      }
    };
  }, [object]);

  if (!showGifts || !object) return null;
  return <primitive object={object} />;
}
