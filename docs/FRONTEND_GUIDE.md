# Frontend Rebuild Guide

Everything under `src/three/*` and `src/ui/*` is a **replaceable prototype**. A new frontend
only needs the three stable interfaces below; it never touches `engine.ts` or the pipeline.

## 1. Runtime data API — `src/data/load.ts`

```ts
loadData(base = "/data"): Promise<DataManifest>
// Fetches charset.json + poets.index.json + manifest.json, builds the real
// PoetryDataset, and calls provider.setDataset() — engine math goes live.
// Call once at boot; gate the 3D scene on completion (store.loaded).

getPoets(): PoetRow[]                       // all ~29,300 poets, sorted by poemCount desc
getPoet(id): PoetRow | undefined
loadPoetPoems(id): Promise<PoemRecord[]>    // lazy — fetches the poet's bucket, caches it
searchPoets(query, limit?): PoetRow[]       // substring name match, ranked by output
getManifest(): DataManifest | null          // {n, poetCount, poemCount, buckets, dynCounts}
```
```ts
type PoetRow    = { id; name; dynasty; poemCount; clusterSize }
type PoemRecord = { t: title; f: "wujue"|"qijue"|"wulu"|"qilu"|"other"; p: lines[] }
```

## 2. Engine API — `src/engine/engineApi.ts`

```ts
pullAt(form, [x,y,z], lushiOnly): PulledPoem   // void-pull a poem at a world point
pointForBabelIndex(form, b, R?): Vec3          // 3D location of a known index (fly-to)
textBabelIndex(form, hanText): {index, digits} | null
// ↑ a REAL poem's catalog index (null unless its length matches the form & chars ∈ 字库)
babelCardinality(form) / regulatedCardinality(form): bigint
```
See [ENGINE_API.md](ENGINE_API.md). **First char = most-significant digit** ⇒ a known
opening line pins the high-order index (basis for 半编号 prefix search).

## 3. Star geometry — `src/three/PoetStars.tsx`

```ts
poetPosition(p: PoetRow): [x,y,z]   // deterministic galaxy position (dynasty shell + hash)
```
Used to place a star, a label, or a fly-to target. Dynasty layout/colour come from
`src/data/dynasties.ts` (`DYNASTIES`, `bandRadius`, `DYNASTY_BY_KEY`).

## 4. UI state — `src/state/store.ts` (zustand)

| field | meaning |
|---|---|
| `loaded` | data ready |
| `form` | active poem form (五绝…七律) for void-pulls |
| `hidden: Set<key>` | dynasties filtered out (`toggleDynasty`, `showOnly`, `showAllDynasties`) |
| `selected: PulledPoem` | the last void-pull (random poem) → `PoemPanel` |
| `selectedPoet` / `poetPoems` | clicked/searched poet + their lazy-loaded poems → `PoetPanel` |
| `hoverPoetId` | poet under cursor (shows a label) |
| `speed` | camera speed multiplier (HUD readout) |
| `flyTarget` | `[x,y,z]` the camera tweens toward, then auto-clears |
| `pulls` | recent void-pull markers (`PulledStars`) |

Transient camera transform lives in `FlyControls` refs, NOT the store (no 60fps re-renders).

## 5. Interaction contract (current shell — reimplement as you like)

- **Pointer drag** = look; **WASD / Space / Shift** = fly; **wheel** = speed. Keys are
  ignored while an `<input>` is focused.
- **Click (no drag)** → raycast `picking.pickTargets.poetPoints`:
  - hit a poet (and its dynasty not hidden) → `selectPoet` + `loadPoetPoems` → `PoetPanel`.
  - else → `pullAt(form, point)` → a random poem → `PoemPanel` + a gold marker.
- **Hover** (throttled raycast) → `setHover(poetId)`.
- **Search a poet** → `selectPoet` + `setFlyTarget(poetPosition(p))`.

## 6. Direction notes (locked)

- **Default = random (Babel) generation.** No self-built 平仄/格律. A poem's number is just
  `rank` of its character order (`textBabelIndex` / `pullAt`). The engine's 格律 catalog still
  exists + is tested, but real data ships a DUMMY tone table (`load.ts::dummyLexicon`) and the
  UI runs random-only. "Good poems" come from the real corpus (search), or a future neural
  generator (needs a backend — conflicts with static hosting; deferred).
- **Filters compose in the random library**: `commonK` (常用字 = top-K freq chars, COMMON_K=2500)
  + `lushiOnly` + form, all inside one Babel catalog. 格律 (lushiOnly) currently uses a DUMMY
  tone table; activating REAL 格律 needs the 平仄 data below.
- **Picking**: screen-space + apparent-size gate (`FlyControls.screenPick`) — only a visibly
  bright star under the cursor selects a poet; everything else → random void poem. Names show
  only on hover/select (no persistent labels).
- **Galaxy**: `three/galaxyParams.ts` (BRANCHES/TWIST/ARM_SPREAD) shared by `Galaxy` (backdrop:
  Bruno-Simon arms + bulge + 3-stop colour + differential-rotation shader) and `PoetStars`
  (poets winds onto the same arms; radius still = dynasty). Headless preview can't capture the
  dense additive galaxy — verify density/brightness/framing on a real GPU.

- **格律 is REAL** (done): `pipeline/build-lexicon.mjs` → `public/data/lexicon.json` (平水韵
  via charlesix59, MIT + pinyin-pro tail) → `load.ts` `hydrateLexicon` → real Lexicon;
  `hasRealGelu()` gates the HUD 格律 toggle. **格律 × 常用字 compose** via
  `engineApi.commonLexicon(K)` → tone-valid poems in common chars.
- **Still TODO**: 自由格式/词 mode (add a separator char into the alphabet → variable line
  structure, as a 5th "form"); line/whole-poem **content search** (床前明月光→静夜思 + 半编号,
  needs a first-line index sharded by leading char); 赠诗 network (image-1); prod brotli+deploy.
