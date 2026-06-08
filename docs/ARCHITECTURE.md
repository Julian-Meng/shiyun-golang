# 诗云 / Poetry Cloud — Architecture

A roamable 3D star map where **real historical poets are real-corpus star clusters**
and the **void between them is the space of all possible 近体诗**, pulled out on click
via an index↔poem bijection — *computed, never stored* (the trick from libraryofbabel.info).

## Layering (and what is durable vs replaceable)

```
┌─────────────────────────────────────────────────────────────────┐
│  FRONTEND  (REPLACEABLE — rebuild freely)                         │
│  src/three/*  3D scene (StarField, Landmarks, PulledStars, Fly)  │
│  src/ui/*     overlay (HUD, PoemPanel, DynastyLegend)            │
│  src/state/store.ts   zustand UI state                           │
└───────────────┬─────────────────────────────┬───────────────────┘
                │ calls                         │ reads
                ▼                               ▼
┌───────────────────────────────┐   ┌──────────────────────────────┐
│  ENGINE API  (STABLE)         │   │  DATA  (STABLE CONTRACT)      │
│  src/engine/engineApi.ts      │   │  src/data/contract.ts  types │
│  app-facing: pullAt, …        │   │  src/data/provider.ts  seam  │
│  src/engine/engine.ts         │   │  src/data/dynasties.ts taxon │
│  pure BigInt math (zero deps) │   │  placeholder ↔ real dataset  │
└───────────────────────────────┘   └──────────────────────────────┘
```

**The two stable boundaries a new frontend must respect:**

1. **Engine API** (`src/engine/engineApi.ts`, backed by pure `engine.ts`). The UI never
   does index math itself — it calls `pullAt()`, `pointForBabelIndex()`, etc. See
   [ENGINE_API.md](ENGINE_API.md).
2. **Data contract** (`src/data/contract.ts`). The Step-3 pipeline emits static assets in
   these exact shapes; the app loads them and calls `setDataset()`. See
   [DATA_CONTRACT.md](DATA_CONTRACT.md).

Everything under `src/three` and `src/ui` is a **prototype shell** — expected to be
rewritten. Because it only touches the two boundaries above, a rewrite cannot break the
math or the data.

## Data flow (a void-pull)

```
click (FlyControls)
  → world point P
  → engineApi.pullAt(form, P, lushiFilter)
      → getDataset().lexicon / charset        (provider seam)
      → indexFromPoint(P) → babel index b      (engine.babelUnrank / regulatedUnrank)
      → describe(): lines[], babelIndex, lushiIndex?, valid
  → store.selectPoem(poem)
  → PoemPanel renders; PulledStars adds a marker
```

## The dataset seam (how real data plugs in)

`engineApi` reads the active dataset through `src/data/provider.ts::getDataset()`.
At boot it is the **placeholder** (`src/data/placeholderLexicon.ts`: 6000 real CJK chars,
fake tones/rhymes). When the Step-3 assets load, the app builds a real `PoetryDataset`
(`hydrateLexicon(asset)` + charset) and calls `setDataset(real)` — **no engine edits**.
`engineApi` clears its cardinality caches via `onDatasetChange`.

## Stack

Vite + React 18 + TypeScript · `@react-three/fiber` 8 / `@react-three/drei` 9 / three 0.169
· zustand 5. Vitest for the engine. 100% static build — **no backend** (see DEPLOY notes in
DATA_CONTRACT.md). All index math + rendering is client-side.

## Build / run

```
npm run dev        # vite dev server (preview)
npm run build      # tsc --noEmit && vite build  → dist/ (static)
npm test           # vitest: engine round-trip suite
npm run typecheck  # tsc --noEmit
```

## Status

- **Step 2** ✅ engine + 34 round-trip tests green (MSB index convention for 半编号).
- **Step 3** ✅ data SHIPPED: real Werneror corpus → **29,300 poets · 853,383 poems · 字库
  N=12,783** (`pipeline/build-data.mjs`, see [PIPELINE.md](PIPELINE.md)). Loaded via
  `data/load.ts` → `provider.setDataset`.
- **Step 4** ✅ real galaxy: `three/Galaxy` (procedural core+disk+dome), `three/PoetStars`
  (29k real poets, dynasty disk, hover/click-pick), `three/FlyControls` (slow 6-DOF + speed
  HUD + fly-to + raycast poet/void), `ui/SearchPanel` (author search→fly), `ui/PoetPanel`
  (real poems + indices), `ui/DynastyLegend` (filter). Default = random; 格律 dummy/gated.
  See [FRONTEND_GUIDE.md](FRONTEND_GUIDE.md).
- **Step 5** ✅ three more features SHIPPED (44/44 tests, verified in-browser):
  **自由格式/词** (5th `PullForm`, radix-(N+W) variable-length catalog — `engine.freeUnrank`);
  **诗句 content search** (`firstline/` index → 床前明月光→李白《静夜思》, + `engine.prefixIndex`
  半编号, always-on); **赠诗 network** (`gifts.json` 3,397 edges, 元稹→白居易/苏辙→苏轼 → `three/GiftLines`).
- **Next** ⏳ GPU-pick + bloom polish; per-poet poem fetch; thicker 赠诗 lines; prod brotli + deploy;
  optional whole-poem/all-lines search index; 字号→poet table for richer 赠诗 recall.

> Legacy `three/StarField.tsx` + `three/Landmarks.tsx` are the Step-4a placeholder field,
> superseded by `PoetStars`/`Galaxy` — kept for reference, not mounted.
