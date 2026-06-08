import type { PoetRow } from "../data/load";

// Shared handle so FlyControls can pick the poet field without owning the geometry/renderer.
// PoetStars builds the GPU picker (it has the geometry + renderer); FlyControls just calls `pick`.
// O(1) GPU colour-ID picking replaced the old O(29,808)/hover CPU scan (positions/sizes). See gpuPick.ts.
export const pickTargets: {
  poets: PoetRow[];
  pick: ((cssX: number, cssY: number) => PoetRow | null) | null;
} = { poets: [], pick: null };
