# Step-3 Data Pipeline (SHIPPED)

`pipeline/build-data.mjs` — a one-shot build-time Node script (runs on the dev machine,
never the server). **DONE 2026-06-08.** Output → `public/data/` (git-ignored; rebuild locally).

> Run: clone the corpus to **C: (fast NVMe)**, then
> `node --max-old-space-size=4096 pipeline/build-data.mjs`

## Input

[`Werneror/Poetry`](https://github.com/Werneror/Poetry) shallow-cloned to
`C:\corpus\Werneror-Poetry` — all-dynasties CSV (`"题目","朝代","作者","内容"`, **Simplified**,
MIT), split into per-dynasty files (宋_1..4, 明_1..4, 清_1..2, + transition buckets).

**Simplified is kept as-is — no OpenCC, no chinese-poetry overlay, no 平水韵.** Rationale:
the user direction is default-random generation (not self-built 平仄), and users search/type in
Simplified, so the corpus script = the index script = the search script. (Traditional overlay +
real 平水韵 remain a future option, documented in git history / DATA_CONTRACT.md.)

## Stages

```
read all *.csv (own RFC4180-ish parser, handles quotes/embedded newlines)
 → normalizeDynasty   raw 朝代 → canonical key (DYN map; transition buckets → later period)
 → splitLines         content split on [，。！？；、] → bare-Han lines
 → classifyForm       4 lines×5/7 or 8 lines×5/7 → wujue/qijue/wulu/qilu, else "other"
 → charset            union of distinct Han chars, ordered by desc frequency → N
 → aggregate poets    GROUP BY (作者, canonical朝代) → id=FNV(name|dyn), poemCount, clusterSize
 → emit               charset.json · poets.index.json · poems/{id[0:2]}.json (256 buckets) · manifest.json
```

## Output (actual)

| file | size | shape |
|---|---|---|
| `charset.json` | 38 KB | `{n:12783, hash, chars}` (字库 = engine radix N) |
| `poets.index.json` | 2.5 MB | `PoetRow[]` — **29,300 poets**, sorted by poemCount desc |
| `poems/{bucket}.json` ×256 | 231 MB total | `{poetId: PoemRecord[]}` — **853,383 poems**, lazy per bucket |
| `manifest.json` | 1.5 KB | `{n, poetCount, poemCount, buckets, dynCounts}` |

Dynasty poet counts: 宋 9496 · 清 8980 · 明 4514 · 唐 2820 · 元 1209 · 近现代 934 · 南北朝 434 ·
金 269 · 魏晋 252 · 当代 209 · 秦汉/隋 84 · 辽 7 · 先秦 8 (诗经/楚辞 mostly 无名氏). 五代十国 = 0
(no 五代 file in Werneror; those poets fall under 唐).

## Lexicon build (real 格律) — `pipeline/build-lexicon.mjs`

Separate one-shot: fetch `charlesix59/chinese_word_rhyme` Pingshui_Rhyme.json (MIT 平水韵;
mostly Simplified — OpenCC `tw→cn` patches stray Traditional) → for each 字库 char emit
`toneClass` (上平/下平→平, 上/去/入→仄; pinyin-pro 1/2声→平,3/4→仄 for the ~5k tail not in
平水韵) + `rhymeOf` (30 平声韵部) → `public/data/lexicon.json` (LexiconAsset, ~146KB/40KB gz).
Result: 平=5708, 仄=7075, all 30 韵部 populated. `load.ts` hydrates it into the real Lexicon.
Deps: `opencc-js`, `pinyin-pro` (devDeps).

## First-line index + 赠诗 edges (SHIPPED) — same `build-data.mjs`

Two more outputs are emitted in the same pass (manifest `version: 2`):

```
firstline/{2-hex bucket}.json   {firstLine: [{p:poetId, i:poemIdx, t:title, f:form}]}
   256 buckets by fnv32(firstLine)&0xff (== frontend hashStr); FL_CAP=12 refs per opening;
   first lines of length ≥ 2 only. 75 MB total → git-ignored, regenerate locally.
   Powers the 诗句 tab (load.searchByLine): 床前明月光 → 李白《静夜思》.
gifts.json                       {version, edgeCount, edges:[[fromId,toId,weight]]}
   赠诗 dedication network. For each title, scan ALL markers (寄/赠/和/次韵/酬/答/呈/送…) and emit
   one edge per DISTINCT recipient (兼寄/兼简 are legitimately multi-edge; no early break, so
   marker order can't drop the primary dedication). findName = greedy-longest known name
   (4→3→2 chars) with a 2-char COMPLETENESS guard: a bare 2-char name is taken only if followed
   by a name-ending char / role-title / punctuation / end, so a longer name or surname+role
   isn't truncated (王介甫↛王介, 李道士↛李道). resolveTarget: bare names SAME-DYNASTY only; a
   curated 号/字→本名 alias table (晦庵→朱熹, 东坡→苏轼, 遗山→元好问…) resolves famous references
   across dynasties. 3,397 edges / 86 KB → **tracked in git** (network works out of the box).
   Top edges are now real literary friendships: 苏辙→苏轼, 元稹→白居易, 刘禹锡→白居易, 黄庭坚→苏轼.
```

Iterate on gifts/manifest only (reuse the 306 MB of poems/+firstline/): `SKIP_HEAVY=1 node
pipeline/build-data.mjs`.

## Known follow-ups

- **Per-poet poem fetch** (vs per-bucket): a click on 陆游 currently pulls his whole bucket
  (~MB). Re-shard finer or one-file-per-poet to cut egress.
- **Whole-poem / non-opening-line search**: the first-line index only keys *opening* lines.
  An all-lines inverted index (~4M lines) would let any line be searched (疑是地上霜 → 静夜思).
- **赠诗 字/号 resolution**: matching is name-only, so 寄元美 (=王世贞) is missed. A 字号→poet
  table (Wikidata) would raise recall; the same-dynasty guard could then relax.
- **无名氏 / 佚名** collapse into mega-poets — consider special handling.
- **prod compression**: add brotli `.br` emit + nginx `brotli_static` before deploy.
