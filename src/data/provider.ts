// Runtime dataset seam. The engine layer reads the active PoetryDataset through
// getDataset(); the app swaps in real data with setDataset() once the Step-3 assets
// load — WITHOUT touching engine.ts or engineApi.ts. Defaults to the placeholder so
// the shell runs with zero data fetches.
import type { PoetryDataset } from "./contract";
import { lexicon as placeholderLexicon, charset as placeholderCharset } from "./placeholderLexicon";

let current: PoetryDataset = { lexicon: placeholderLexicon, charset: placeholderCharset };
const listeners = new Set<() => void>();

export function getDataset(): PoetryDataset {
  return current;
}

/** Swap the active dataset (e.g. after loading real charset+lexicon). Notifies listeners. */
export function setDataset(d: PoetryDataset): void {
  current = d;
  listeners.forEach((fn) => fn());
}

/** Subscribe to dataset swaps (engineApi clears its caches; UI may re-render). */
export function onDatasetChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isPlaceholder(): boolean {
  return current.charset === placeholderCharset;
}
