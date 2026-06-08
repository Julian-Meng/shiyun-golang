# 诗云 / Poetry Cloud — HANDOFF

> Read this first, then `docs/`. This is a working, verified prototype. The engine + data +
> interfaces are stable; the `src/three` + `src/ui` frontend is a replaceable prototype.

Inspired by 刘慈欣《诗云》 + 博尔赫斯《巴别图书馆》: a roamable 3D galaxy where every real poet
is a star and the void between them is **every possible poem**, pulled out on click — *computed,
never stored* (every poem ⇄ a big-integer index, bijectively).

---

## 1. Run it (works out of the box — data is already in `public/data`)

```bash
npm install
npm run dev        # vite → http://localhost:5173
npm test           # vitest: 44 engine round-trip tests (must stay green)
npm run build      # tsc --noEmit && vite build  (the real verify gate)
npm run typecheck
```

Node 24, npm 11. Windows. Stack: Vite + React 18 + TypeScript + @react-three/fiber 8 /
drei 9 / three 0.169 + zustand 5. **100% static, no backend — never add one** (it's the one
thing that breaks the hosting model; all index math + render is client-side).

---

## 2. What works (all verified this session)

| Area | State |
|---|---|
| **Index engine** (`src/engine/engine.ts`) | Babel base-N + 格律 mixed-radix-product rank/unrank, nested dual index, reversible BigInt Feistel, + **自由 variable-length catalog** + **prefixIndex (半编号)** + **编号反查 (pullByIndex)**. **44/44 tests**. First char = most-significant digit. **The 全集编号 IS a true 正序 rank** (`babelRank` = the poem's lexicographic position over the freq-ordered 字库) — `babelUnrank` reverses it (`engineApi.pullByIndex`), so 诗⇄编号 is an exact bijection (NOT a hash; the Feistel scatter is used only for spatial layout, never for the displayed number). |
| **Real data** | Werneror corpus + modern 新诗 → **29,808 poets · 857,877 poems · 字库 N=12,877** (Simplified). In `public/data/`. |
| **Real 格律** | 平水韵 lexicon (charlesix59, MIT + pinyin-pro tail): 平 5758 / 仄 7119 / 30 韵部. `公式 格律 toggle` produces tone-valid, rhyming poems. |
| **Galaxy** | Realistic spiral: **~166k two-layer particles** (soft dim dust + sparse bright arm stars) + a **dense particle bulge** on an exponential profile (no hard glow-sprite → smooth core), **Gaussian point falloff** `exp(-4.5d²)` (continuous nebulosity, not dots), value-noise clumping + dust gaps, HII knots, warm-core→blue-arm colour, **`UnrealBloom`** for HDR glow. **画质·高/低 toggle** (`store.quality`) halves counts + drops bloom for weak GPUs. |
| **Poets woven into the arms** | `poetPosition`: gaussian radial spread (blends dynasty colours) + concentrated onto the **same 4 spiral arms** as the backdrop (`armDev ×0.45`) → colour reads as a gradient ALONG the arms, not concentric rings; gaussian Y-thickness swells toward the centre (depth). **Famous poets** (`famousPoets.ts`) → 2.4× size + gilded glow (李白/杜甫/苏轼/徐志摩… are visible landmark "明星"). |
| **Void-pull markers** | Small twinkling captured-light spots (not giant balls), lifecycle: fade-in, cap 20 ALIVE (oldest flickers out + self-destructs), distance-culled; a void click **glide-focuses** the camera on the captured point. `three/PulledStars`. |
| **赠诗 arcs** | Soft **curved Bézier**, control points pulled toward the centre → **bundled flows**; a shader sends a **pulse giver→receiver** (flow direction); endpoint-faded; ambient = weight≥3, selected poet = clean ego-net. |
| **编号反查 (reverse)** | Paste a 全集编号 + 诗体 → `pullByIndex` reconstructs the exact poem (full numbers, copy buttons), and reports if it's a **real** poem (loop closure: 静夜思's 编号 → "正好对应李白《静夜思》"). |
| **Permalinks** | Address bar stays shareable: `#a=<poetId>` / `#p=<form>.<index>` (`state/permalink.ts`); 🔗 分享 buttons; restore on load. |
| **Product-grade UI** | Elegant 楷/宋 serif (`--serif`) for poem text; gradient cards + gold accent rules. |
| **诗句 content search** | ANY line (not just openings) — `疑是地上霜 → 静夜思` — via an all-lines inverted index (`lines/`, 256 shards). |
| **Interaction** | 6-DOF fly cam + speed HUD; **screen-space + brightness-gated pick** (click a bright star → poet; click void → random poem); names only on hover/select. |
| **Search** | Author search → fly-to → poet's real poems + each poem's 全集编号. |
| **Filters compose** | 诗体 × **常用字** (top-2500 freq chars, avoids 生僻乱码) × **格律**. e.g. 格律+常用字 → "思伦要锁馆/窟置右黎刍/肆昧家谐变/霜辉化铁驹" (valid + readable). |
| **Dynasty filter** | 15-dynasty legend (先秦→当代) + presets (全部/主要/唐宋). |
| **自由格式 / 词** (5th form) | A separate variable-length catalog: alphabet = 字库 N real glyphs + a block of W≈N/5 "break" glyphs (radix N+W, length 28). Random pulls split into 词-like variable lines (~4.6 行 × ~5 字). Own 自由目录编号; composes with 常用字; never 格律. `engine.freeUnrank/freeRank/splitFree`. |
| **半编号 (half-index)** | 诗句 tab also yields the **半编号** — the high-order address the opening line pins (verified: 静夜思's 全集编号 *starts with* the 5-char 半编号). Pure, always-on: `engineApi.halfIndex/halfIndexAuto`. |
| **赠诗网络** | HUD 赠诗 toggle → **4,849 dedication edges** (寄/赠/和/次韵… title-parsed; greedy-longest name match + ~250-entry 字号 alias table — 少陵→杜甫, 子瞻→苏轼, 香山→白居易; one edge per 兼寄 recipient). 元稹→白居易, 苏辙→苏轼, 黄庭坚→苏轼…. Committed `gifts.json` (~126 KB). `three/GiftLines`. |
| **新诗 / modern** | yuxqiu/modern-poetry contemporary set (Apache-2.0) folded in: +4,494 free-verse poems / +508 poets (徐志摩《再别康桥》, 海子, 北岛, 顾城, 戴望舒…). Free verse → form `other`; 民国→近现代 else 当代; their lines are searchable. |

Three pull modes to feel the project: plain random「牛蝛茙漂綵」→ 格律「趰㵎憣烔岆」→ 格律+常用字
「思伦要锁馆」; plus 自由格式 for 词-like变行, and the 诗句 tab to find a real poem from one line.

---

## 3. Docs map (read in this order)

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — layers, what's stable vs replaceable, data flow.
- [docs/ENGINE_API.md](docs/ENGINE_API.md) — engine + engineApi surface, invariants, MSB convention.
- [docs/DATA_CONTRACT.md](docs/DATA_CONTRACT.md) — static-asset schemas, corpus, dynasty taxonomy + normalization map.
- [docs/FRONTEND_GUIDE.md](docs/FRONTEND_GUIDE.md) — **rebuild contract**: the 4 stable interfaces a new frontend uses (load.ts / engineApi / poetPosition / store), interaction model, locked direction notes.
- [docs/PIPELINE.md](docs/PIPELINE.md) — how the data + lexicon are built.

`src/data/contract.ts` is the typed source-of-truth for every data asset.

---

## 4. Data & regeneration

`public/data/` **tracked in git**: `charset.json` (38 KB), `poets.index.json` (2.5 MB),
`lexicon.json` (147 KB), `gifts.json` (~126 KB, 赠诗 edges), `manifest.json`.
**git-ignored** (regenerate as below): `poems/*.json` (235 MB, 256 buckets, real poem text)
and `lines/*.json` (791 MB, 256 shards, the **all-lines** content-search index — every line,
not just openings; renamed from `firstline/`). So a fresh `git worktree` has the galaxy +
author search + 格律 + 自由格式 + 半编号 + **赠诗网络** working; only "click a poet → read their
poems" and "诗句 search → the real poem" need the two heavy dirs regenerated.

**Corpora already cloned on this machine** (external, not in the repo):
- `C:\corpus\Werneror-Poetry` — all-dynasties corpus (MIT). Used by `pipeline/build-data.mjs`.
- `C:\corpus\modern-poetry` — yuxqiu/modern-poetry 新诗 set (Apache-2.0). Also read by `build-data.mjs`.
- `C:\corpus\Pingshui_Rhyme.json` — 平水韵 (charlesix59, MIT). Used by `pipeline/build-lexicon.mjs`.

Regenerate (scripts now write into *this* project's `public/data` via relative paths):
```bash
node --max-old-space-size=4096 pipeline/build-data.mjs     # charset + poets.index + poems + lines/ + gifts
node pipeline/build-lexicon.mjs                            # lexicon.json (needs opencc-js, pinyin-pro — devDeps)
```
`build-data.mjs` now also reads the modern corpus + carries the expanded ~250-entry `GIFT_ALIAS`
字号 table. When 字库 N changes, `lexicon.json` must be rebuilt too (it indexes 平/仄 by glyph).

---

## 5. Verifying changes (important gotchas)

- **The verify gate is `npm run build` (tsc) + `npm test`.** Keep the 44 engine tests green.
- **The headless preview GPU (swiftshader) CANNOT screenshot the dense additive galaxy** — it
  times out (not a crash; the page is alive). Verify visuals on a real GPU, or drive the DOM
  with the preview MCP's `preview_eval` (read `.poem-panel` / `.poet-panel` text, dispatch
  synthetic clicks). Reduce galaxy point counts in `src/three/Galaxy.tsx` if you need a shot.
- **Synthetic clicks fired right after page load don't stick** (pre-hydration) — click, wait a
  tick, re-verify.
- **Rapid HMR edits** can trip the r3f ErrorBoundary transiently — restart the dev server for a
  clean mount; the production build is the source of truth.

---

## 6. Remaining work (next, roughly in priority)

**DONE this session** (all verified — `npm run build` + 44/44 tests + browser DOM checks):
1. ✅ **Galaxy realism** — Gaussian point falloff `exp(-4.5d²)` (continuous nebulosity, not
   dots); ~166k particles in 3 populations (DUST + arm STARS + a dense particle **BULGE**
   replacing the old hard glow-sprite → smooth core); exponential-disk radius, value-noise
   clumping + dust gaps, HII knots, warm-core→blue-arm colour; `UnrealBloom` via
   `@react-three/postprocessing` v2.19 (**new dep**). `src/three/Galaxy.tsx`.
2. ✅ **Quality toggle** — HUD 画质·高/低 (`store.quality`); 低 halves galaxy counts
   (~166k→~59k) and disables bloom (`App.tsx`). For weak GPUs.
3. ✅ **Poets woven into the arms** — `PoetStars.tsx poetPosition`: gaussian radial spread
   blends dynasty colours; `armDev ×0.45` concentrates poets onto the **same 4 spiral arms** as
   the backdrop (colour = gradient ALONG arms, not concentric rings); gaussian Y-thickness swells
   toward centre. **Famous poets** (`src/data/famousPoets.ts`, now incl. modern) → 2.4× size +
   gilded-glow landmarks.
4. ✅ **Void-pull markers** (`PulledStars.tsx`, full rewrite) — small twinkling captured-light
   spots (not giant balls); lifecycle fade-in, cap 20 ALIVE (oldest flickers out + self-destructs),
   distance-cull; a void click **glide-focuses** the camera (FlyControls fly-to now
   camera-relative). `store.Pull` has an id; `MAX_PULLS=24`.
5. ✅ **赠诗 arcs** (`GiftLines.tsx`) — cubic Bézier, control points pulled toward centre →
   **bundled flows** (poor-man's hierarchical edge bundling, `BUNDLE=0.3`); a custom shader sends
   a soft pulse giver→receiver (flow direction); endpoint-faded; ambient = weight≥3, selecting a
   poet draws a clean ego-network.
6. ✅ **编号反查 reverse search** (3rd search tab) — `engineApi.pullByIndex(form, indexStr)` unranks
   a number back to its poem; full untruncated numbers everywhere + copy buttons
   (`src/ui/CopyButton.tsx`); loop closure: checks the line index + full text and reports if the
   number is a **real** poem.
7. ✅ **Permalinks** (`src/state/permalink.ts`) — `#a=<poetId>` / `#p=<form>.<index>`; 🔗 分享
   buttons in the poem + poet panels; `engineApi.pulledFromIndex` rebuilds a poem from a link; App
   restores on load.
8. ✅ **Product-grade poem UI** — `--serif` (楷/宋 stack) for poem text; gradient cards + gold accent.
9. ✅ **Any-line content search** — pipeline now indexes **EVERY** line (not just openings) →
   `public/data/lines/{bucket}.json` (256 shards, ~791 MB, git-ignored — renamed from
   `firstline/`). 疑是地上霜 → 李白《静夜思》 (a non-first line) now works; `load.ts` reads `lines/`.
10. ✅ **Modern 新诗 poets** — imported yuxqiu/modern-poetry (Apache-2.0, `C:/corpus/modern-poetry`):
    +4,494 free-verse poems / +508 poets (徐志摩, 海子, 北岛, 顾城, 戴望舒…). Free verse → form
    `other`; 民国→近现代 else 当代; their lines are searchable.
11. ✅ **字号 alias table** expanded to ~250 entries (~120 poets) in `build-data.mjs GIFT_ALIAS` →
    4,849 赠诗 edges (少陵→杜甫, 子瞻→苏轼, 香山→白居易…).

**Still TODO:**
12. **Deploy** — static build → `shiyun.<domain>` subdomain, nginx `brotli_static`, precompress
    assets. See DATA_CONTRACT.md §deploy notes. No backend.
13. **Polish** — GPU-pick at scale; per-poet (not per-bucket) poem fetch to cut egress; thicker
    赠诗 lines (`Line2`/`meshline` — current arcs are 1px, WebGL `lineWidth` cap); 无名氏 collapse;
    modern-poet **dynasty refinement** (a date table to split 近现代/当代 more finely than 民国-only).

### Locked decisions (don't relitigate without reason)
- **Default = random (Babel) generation; no further self-built 平仄 research** — the 格律
  product engine + the charlesix59 平水韵 data cover it. "Good poems" = real-corpus search;
  neural generation needs a backend (conflicts with static) — deferred.
- **Simplified** is canonical (corpus = index = search script; no OpenCC at runtime).
- **Index convention: first char = most-significant digit.**
- **Filters compose inside one Babel catalog**; the displayed 全集编号 is always the full-catalog
  address.
