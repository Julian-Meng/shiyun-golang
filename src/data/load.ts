// Loads the real Step-3 assets and swaps them into the engine via the provider seam.
// 格律 tone/rhyme data is intentionally absent (default = random per user direction), so
// we build a DUMMY lexicon that satisfies the engine type but is never used for authentic
// 格律 — the UI runs in random (Babel) mode.
import type { Lexicon } from "../engine/engine";
import { setDataset } from "./provider";
import { hydrateLexicon, type LexiconAsset } from "./contract";

let _realGelu = false;
/** True once a real 平仄/平水韵 lexicon is loaded (so the UI can offer the 格律 mode). */
export const hasRealGelu = (): boolean => _realGelu;

export interface PoetRow {
  id: string;
  name: string;
  dynasty: string;
  poemCount: number;
  clusterSize: number;
}
export interface PoemRecord {
  t: string;
  f: string; // "wujue" | "qijue" | "wulu" | "qilu" | "other"
  p: string[]; // lines
}
export interface DataManifest {
  n: number;
  poetCount: number;
  poemCount: number;
  buckets: string[];
  dynCounts: Record<string, number>;
}

let _poets: PoetRow[] = [];
let _byId = new Map<string, PoetRow>();
let _manifest: DataManifest | null = null;
const _bucketCache = new Map<string, Record<string, PoemRecord[]>>();

export const getPoets = (): PoetRow[] => _poets;
export const getPoet = (id: string): PoetRow | undefined => _byId.get(id);
export const getManifest = (): DataManifest | null => _manifest;

function dummyLexicon(N: number): Lexicon {
  const half = N >> 1;
  const pingList = Uint32Array.from({ length: half }, (_, i) => i);
  const zeList = Uint32Array.from({ length: N - half }, (_, i) => half + i);
  const toneClass = new Int8Array(N);
  for (let i = half; i < N; i++) toneClass[i] = 1;
  const pingRank = new Int32Array(N).fill(-1);
  pingList.forEach((c, i) => (pingRank[c] = i));
  const zeRank = new Int32Array(N).fill(-1);
  zeList.forEach((c, i) => (zeRank[c] = i));
  const GROUPS = Math.min(30, Math.max(1, half));
  const per = Math.max(1, Math.floor(half / GROUPS));
  const rhymeOf = new Int16Array(N).fill(-1);
  const rhymeMembers: Uint32Array[] = [];
  const rhymeRank: Int32Array[] = [];
  for (let q = 0; q < GROUPS; q++) {
    const start = q * per;
    const end = q === GROUPS - 1 ? half : (q + 1) * per;
    const m: number[] = [];
    const rk = new Int32Array(N).fill(-1);
    for (let id = start; id < end; id++) {
      m.push(id);
      rhymeOf[id] = q;
      rk[id] = m.length - 1;
    }
    rhymeMembers.push(Uint32Array.from(m));
    rhymeRank.push(rk);
  }
  return { N, pingList, zeList, pingRank, zeRank, toneClass, rhymeOf, rhymeMembers, rhymeRank };
}

export async function loadData(base = "/data"): Promise<DataManifest> {
  const [charset, poets, manifest, lexAsset] = await Promise.all([
    fetch(`${base}/charset.json`).then((r) => r.json()),
    fetch(`${base}/poets.index.json`).then((r) => r.json()),
    fetch(`${base}/manifest.json`).then((r) => r.json()),
    fetch(`${base}/lexicon.json`)
      .then((r) => (r.ok ? (r.json() as Promise<LexiconAsset>) : null))
      .catch(() => null),
  ]);
  _poets = poets;
  _byId = new Map(poets.map((p: PoetRow) => [p.id, p]));
  _manifest = manifest;
  const chars = [...(charset.chars as string)]; // code-point split (handles astral chars)
  const lexicon = lexAsset ? hydrateLexicon(lexAsset) : dummyLexicon(charset.n);
  _realGelu = !!lexAsset;
  setDataset({ lexicon, charset: chars });
  return manifest;
}

export async function loadPoetPoems(id: string, base = "/data"): Promise<PoemRecord[]> {
  const bucket = id.slice(0, 2);
  let obj = _bucketCache.get(bucket);
  if (!obj) {
    obj = await fetch(`${base}/poems/${bucket}.json`).then((r) => r.json());
    _bucketCache.set(bucket, obj!);
  }
  return obj![id] || [];
}

// Author search: substring match on name, ranked by poemCount, capped.
export function searchPoets(q: string, limit = 40): PoetRow[] {
  const s = q.trim();
  if (!s) return [];
  const out: PoetRow[] = [];
  for (const p of _poets) {
    if (p.name.includes(s)) {
      out.push(p);
      if (out.length >= limit) break;
    }
  }
  return out;
}
