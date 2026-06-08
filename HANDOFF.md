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
npm test           # vitest: 34 engine round-trip tests (must stay green)
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
| **Index engine** (`src/engine/engine.ts`) | Babel base-N + 格律 mixed-radix-product rank/unrank, nested dual index, reversible BigInt Feistel. **34/34 tests**. First char = most-significant digit (enables 半编号). |
| **Real data** | Werneror corpus → **29,300 poets · 853,383 poems · 字库 N=12,783** (Simplified). In `public/data/`. |
| **Real 格律** | 平水韵 lexicon (charlesix59, MIT + pinyin-pro tail): 平 5708 / 仄 7075 / 30 韵部. `公式 格律 toggle` produces tone-valid, rhyming poems. |
| **Galaxy** | Procedural spiral (arms + bulge + 3-stop colour + differential-rotation shader); poets wound onto the same arms (radius = dynasty). |
| **Interaction** | 6-DOF fly cam + speed HUD; **screen-space + brightness-gated pick** (click a bright star → poet; click void → random poem); names only on hover/select. |
| **Search** | Author search → fly-to → poet's real poems + each poem's 全集编号. |
| **Filters compose** | 诗体 × **常用字** (top-2500 freq chars, avoids 生僻乱码) × **格律**. e.g. 格律+常用字 → "思伦要锁馆/窟置右黎刍/肆昧家谐变/霜辉化铁驹" (valid + readable). |
| **Dynasty filter** | 15-dynasty legend (先秦→当代) + presets (全部/主要/唐宋). |

Three pull modes to feel the project: plain random「牛蝛茙漂綵」→ 格律「趰㵎憣烔岆」→ 格律+常用字
「思伦要锁馆」.

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

`public/data/` (present): `charset.json` (38 KB), `poets.index.json` (2.5 MB), `lexicon.json`
(146 KB), `manifest.json` — **tracked in git**. `poems/*.json` (231 MB, 256 buckets) —
**git-ignored** (regenerate as below). So a fresh `git worktree` has the galaxy + search +
格律 working; only "click a poet → read their poems" needs `poems/` regenerated.

**Corpora already cloned on this machine** (external, not in the repo):
- `C:\corpus\Werneror-Poetry` — all-dynasties corpus (MIT). Used by `pipeline/build-data.mjs`.
- `C:\corpus\Pingshui_Rhyme.json` — 平水韵 (charlesix59, MIT). Used by `pipeline/build-lexicon.mjs`.

Regenerate (scripts now write into *this* project's `public/data` via relative paths):
```bash
node --max-old-space-size=4096 pipeline/build-data.mjs     # charset + poets.index + poems
node pipeline/build-lexicon.mjs                            # lexicon.json (needs opencc-js, pinyin-pro — devDeps)
```

---

## 5. Verifying changes (important gotchas)

- **The verify gate is `npm run build` (tsc) + `npm test`.** Keep the 34 engine tests green.
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

1. **自由格式 / 词** — add a separator char into the alphabet (字库 N+1), fixed total length L,
   enumerate char-or-separator sequences; display splits on the separator → variable line
   lengths. Add as a 5th "form". (Design agreed; not started.)
2. **Content search** — search a line or whole poem → locate the real poem (床前明月光 → 李白
   静夜思) under "真实诗人", or a 半编号 prefix index under "纯随机". Needs a first-line index
   sharded by leading char (loading all 853k poems is too heavy). The engine already supports
   it: first char = MSB, so a known opening line pins the high-order index.
3. **赠诗 network** (the image-1 reference) — parse poem titles (寄/赠/和/次韵 X) to build a
   poet-to-poet dedication graph + connection lines.
4. **Polish** — GPU-pick at scale, bloom (`@react-three/postprocessing`, check R3F version),
   per-poet (not per-bucket) poem fetch to cut egress, tune galaxy density/framing on a real GPU.
5. **Deploy** — static build → `shiyun.<domain>` subdomain, nginx `brotli_static`, precompress
   assets. See DATA_CONTRACT.md §deploy notes. No backend.

### Locked decisions (don't relitigate without reason)
- **Default = random (Babel) generation; no further self-built 平仄 research** — the 格律
  product engine + the charlesix59 平水韵 data cover it. "Good poems" = real-corpus search;
  neural generation needs a backend (conflicts with static) — deferred.
- **Simplified** is canonical (corpus = index = search script; no OpenCC at runtime).
- **Index convention: first char = most-significant digit.**
- **Filters compose inside one Babel catalog**; the displayed 全集编号 is always the full-catalog
  address.
