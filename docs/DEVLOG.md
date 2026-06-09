# 诗云 / Poetry Cloud — 开发日志 (DEVLOG)

Chronological, newest first. Each entry: commits + what changed + how it was verified. The per-area
"what works" matrix lives in [HANDOFF.md](../HANDOFF.md); this file is the running diary.

Verify gate every entry: `npm run build` (tsc + vite) + `npm test`. **The 3D scene cannot be verified
on the headless preview** (swiftshader: the additive galaxy times out / the r3f Canvas subtree stays
dormant), so all visual/interaction work is build+test-verified here and eyeballed by the user on a
real GPU. Data dirs (`poems/`, `lines/`) are git-ignored — see HANDOFF "data provisioning".

---

## 2026-06-09 — Session: 5th agent (UX5 → 行星/planets → 群星 → lock-follow → fuzzy search)

### Round 8 — fuzzy LINE index (mid-line 异文) + orbit-lock + sustained highlight + guide lines
- **诗句 mid-line variant search (item 1)** — round-7's `findReal` fuzzy only covered COMPOSE; 诗句 search of a
  variant line (「举头望明月」) still missed. New `pipeline/build-fuzzy.mjs` (`npm run build:fuzzy`) builds a
  delete-1 / SymSpell skeleton index `linesf/` (4096 shards, disk-staged so it doesn't OOM): a same-length
  1-substitution shares the (L-1) skeleton with the differing char dropped. `searchByLine` adds a fuzzy
  fallback (when exact = 0, len 4..10) via `lineSkeletons` + `loadFzShard`. `lineSkeletons` has 4 unit tests.
  **Large local index (~GBs, git-ignored); a DEPLOY needs a curated/server-side fuzzy** (noted).
- **Orbit-lock (item 2)** — the lock is now an orbit camera: closer default distance (was too far), DRAG
  rotates the locked view (yaw/pitch, no release), WHEEL zooms (distance); movement keys still release.
  (`FlyControls` `lock` ref + handlers.)
- **Sustained highlight (item 3)** — the highlight now holds FULL brightness (`HOLD_FLARE`) for the whole
  ~10 s then weakens (was flash-then-dim); brighter/larger so the cluster stays legible in the spread field.
- **行星指引 / guide lines (item 4)** — new `three/PoemGuides.tsx`: selecting a poet emits a line to EVERY
  poem it wrote (赠诗-style), self-rotating with the cloud, one-shot ~10 s (grow→hold→fade) then auto-deletes.
- Verified: build + 66/66.

### Round 7 — bigger irregular self-rotating clusters + 10s highlight + camera lock + fuzzy findReal
`874cbba`
- **Clusters too small/local/uniform** (user) → `positions.poemSystemRadius` ~6× (35+13√P; 杜甫→~555);
  `poemOffset` clumpy power-law radius + WIDE jitter (non-uniform) + per-poet ELLIPSOID axes (irregular
  shapes: sphere/ellipse/oblate).
- **Self-rotation**: `poemOmega` + shared `poemClock`; each cloud rotates around its poet. Mirrored in the
  visual shader, the GPU pick shader (clicks still land), and the time-aware `poemPosition` (locate tracks).
- **Highlight (item 1)**: selecting a poet ALWAYS flashes its whole cluster in for ~10 s regardless of the
  行星 toggle (flash-in → hold → fade-out); selected poet star also enlarged ×1.8.
- **Camera lock-follow (item 3)**: `store.lockPoetId/lockPoemIdx` + FlyControls — selecting a poet/planet
  centres + follows it (decoration's faster spin streams past = motion); released by any movement key or a
  look-drag. Wired from 3D click / 诗人 / 诗句 / 目录.
- **Search (item 4)**: `findReal` relaxed to a same-length ≤2-char (≥85%) near-match → popular 静夜思
  「举头望明月」 (corpus「山月」) now flagged as 异文. Mid-line variant *search* still needs the fuzzy line index.
- Verified: build + 62/62.

### Round 6 — clickable planets + 群星 v1 (soft 3D clusters, fade, emphasis)
`05ca09f` (clickable) · `9f57d11` (群星 v1)
- **Click a planet → open its poem**: `gpuPick` renders a 2nd pick layer (poem ids offset by
  `POEM_PICK_BASE`) in the same offscreen pass (depth-tested), click-only; `PickResult={kind:poet|poem}`;
  PoemOrbits registers `pickTargets.poemLayer` + `resolve`. +5 vitest (→62).
- **De-blockify v1**: flat disc → soft near-spherical cluster; selecting flashes/fades the cluster in/out.
  (User then said still too small/blocky-when-all-on → Round 7.)

### Round "planets" — 行星 feature (poems orbit their poet) + 目录/搜索 locate
`60a34a7`
- `three/positions.ts` (poetPosition moved here + poemPosition/poemOffset). `three/PoemOrbits.tsx` + HUD
  **行星** toggle (`store.showAllPoems`): OFF = selected poet's poems; ON = all 857,877. 目录定位 (PoetPanel
  🛸定位) + 诗句 search fly to the exact planet (`store.pulseAt`). Verified build + 57/57 + DOM e2e.

### Fix — dead 诗句 search / real-poem detection (missing `lines/`)
`20a55dd`
- `public/data/lines/` was absent → `searchByLine` found nothing → no real hits + `findReal` failed +
  the void/planet double-location. `pipeline/build-lines.mjs` (`npm run build:lines`) rebuilds it from
  `poems/` (no corpus; per-line cap keeps the most-prolific author). 256 buckets / 9.18M refs. Verified:
  床前明月光 → 李白《静夜思》 → flies to the planet (same spot as 目录).

### Fix — dormant Range egress
`3596841`
- `manifest.poemSidecar:true` but `poems/*.idx.json` absent → whole-bucket (~0.9MB) fetch per poet.
  `pipeline/build-sidecars.mjs` (`npm run build:sidecars`) re-emits each bucket + sidecar. Verified live:
  206 `bytes 12-9787/890706` (~98.9% saved).

### Round 5 — UX: placeholder, centre cross dissolve, fixed port
`17242a3`
- 造诗 placeholder simplified; `poetPosition` centreBlur 0.42→0.5 + coreScat 0.15→0.22; Galaxy disk
  azimuthal+core fill; BULGE 42k→64k. `vite` fixed port 5199 strictPort. Centre confirmed by user on a real GPU.
