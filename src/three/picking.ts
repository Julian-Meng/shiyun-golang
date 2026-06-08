import type * as THREE from "three";
import type { PoetRow } from "../data/load";

// Shared handle so FlyControls can screen-space-pick the poet field without owning it.
export const pickTargets: {
  poetPoints: THREE.Points | null;
  poets: PoetRow[];
  positions: Float32Array | null; // xyz per poet (parallel to poets)
  sizes: Float32Array | null; // base point size per poet (for apparent-size gating)
} = { poetPoints: null, poets: [], positions: null, sizes: null };

export const SIZE_SCALE = 900; // must match the PoetStars shader uSizeScale
