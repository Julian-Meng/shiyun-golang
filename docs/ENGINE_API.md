# Engine API

Two layers. A new frontend should call the **app-facing API** (`engineApi.ts`); reach into
the **pure engine** (`engine.ts`) only for custom flows (search, permalinks, validators).

---

## App-facing API — `src/engine/engineApi.ts`

```ts
pullAt(formId, pos: [x,y,z], lushiOnly: boolean): PulledPoem
```
Pull a poem out of the void at a clicked world point. Deterministic: same point + form +
mode → same poem. `lushiOnly=false` samples the full Babel catalog (almost always gibberish);
`lushiOnly=true` samples the nested 格律 sub-catalog (always tone/rhyme-valid under the
active lexicon). Returns:

```ts
interface PulledPoem {
  form: FormId;            // "wujue" | "qijue" | "wulu" | "qilu"
  lines: string[];         // poem text, one string per line
  babelIndex: string;      // decimal — the catalog address (82–229 digits)
  babelDigits: number;     // its length (UI flavour)
  lushiIndex: string | null; // 格律 sub-catalog index, if the poem is regulated
  valid: boolean;          // is it 格律-valid?
  pos: [number, number, number]; // where to place the star (the clicked point)
}
```

```ts
pointForBabelIndex(formId, b: bigint, R?=1000): Vec3
```
Canonical 3D position of a known catalog index `b` (for search / permalink fly-to). Uses a
reversible Feistel scatter so neighbouring indices land far apart.

```ts
babelCardinality(form): bigint        // N^L for the form
regulatedCardinality(form): bigint    // |格律 sub-catalog|
textBabelIndex(form, hanText): {index, digits} | null
// a REAL poem's catalog index; null unless char count == form length & all chars ∈ 字库.
```

```ts
type PullForm = FormId | "ziyou";     // the 5th "form" — 自由格式 / 词 — is a separate catalog
pullAt(form: PullForm, pos, {lushiOnly?, commonK?})
// form="ziyou" → describeFree: a variable-length 词 from the radix-(realN+W) 自由 catalog;
// lines come from splitFree (id ≥ realN = a line break), index is the 自由目录 address, no 格律.

halfIndex(form: FormId, han): HalfIndex | null   // 半编号 of a typed OPENING (han.length ≤ L)
halfIndexAuto(han): HalfIndex | null             // ↑ but auto-picks the form by line length

pullByIndex(form: PullForm, indexStr): IndexPoem | null   // 反查: 编号 → 诗 (the bijection's
// other direction). babelUnrank/freeUnrank the decimal index back into the poem at that catalog
// position. {lines, inRange, ...}. The displayed 全集编号 is babelRank itself (a true 正序 rank,
// first char = MSB), so pullByIndex(form, poemIndex) reproduces the exact poem — 诗 ⇄ 编号.
pulledFromIndex(form: PullForm, indexStr): PulledPoem | null  // ↑ but returns a full PulledPoem
// placed at the canonical scattered point — used to REBUILD a shared #p=<form>.<index> permalink
// (state/permalink.ts) and drop the camera onto the same star.
interface HalfIndex { form; index; digits; locked; freeChars; total }
// `index` = the high-order address the opening pins (prefix padded with char-id 0); the real
// poem's full 全集编号 starts with these same high-order digits. `freeChars` low positions stay
// free ⇒ N^freeChars poems share this opening (one contiguous high-order range).
```

Form lengths: 五绝 20 · 七绝 28 · 五律 40 · 七律 56 chars.
**Index convention: first char = most-significant digit** (`index = Σ cᵢ·N^(L-1-i)`), so poems
sharing an opening prefix occupy a contiguous high-order range → 半编号 prefix search.

---

## Pure engine — `src/engine/engine.ts` (zero deps, native BigInt)

**Babel catalog (all strings of L chars over alphabet N):**
```ts
babelUnrank(L, N: bigint, k: bigint): number[]   // index → char-ids
babelRank(N: bigint, chars: number[]): bigint     // char-ids → index
babelSize(L, N: bigint): bigint                    // N^L
```
Invariant: `babelRank(N, babelUnrank(L,N,k)) === k` for all `k ∈ [0, N^L)`.

**格律 catalog (mixed-radix product — no DFA, because 平仄 is positionally fixed):**
```ts
regulatedSize(lex, form): bigint
regulatedUnrank(lex, form, s: bigint): RegPoem      // {variant, rhyme, chars}
regulatedRank(lex, form, poem: RegPoem): bigint
matchVariant(lex, form, chars): RegPoem | null      // validate + identify
isRegulated(lex, form, chars): boolean
embedToGlobal(lex, form, s): bigint                 // 格律 index → Babel index (nesting)
globalToRegulated(lex, form, g): bigint | null      // Babel index → 格律 index, if valid
```
Invariants (tested in `engine.test.ts`):
- `regulatedRank(regulatedUnrank(s)) === s`
- `isRegulated(regulatedUnrank(s).chars) === true`
- `globalToRegulated(embedToGlobal(s)) === s`  (the 格律 catalog is exactly the valid
  subset of the Babel catalog, re-indexed)

**半编号 prefix index (content search — first char = MSB):**
```ts
prefixIndex(L, N: bigint, prefix: number[]): bigint  // smallest index sharing this opening
prefixRange(L, N: bigint, locked: number): bigint    // N^(L-locked) = poems sharing it
```
`prefixIndex` pads the opening with char-id 0 in the free low positions; the pinned high-order
digits are the 半编号. A full poem (`prefix.length === L`) ⇒ `prefixIndex === babelRank` and
`prefixRange === 1`.

**自由 catalog — variable-length 词 / 自由诗 (a SEPARATE catalog, not a FormId):**
```ts
FREE_L = 28                              // total positions
freeBreakCount(N): number                // W = round(N/5) "break" glyphs (ids N..N+W-1)
freeRadix(N): bigint                     // N + W
freeSize(N, L?=FREE_L): bigint           // (N+W)^L
freeUnrank(N, k: bigint, L?): number[]   // base-(N+W) digits; ids ≥ N are line breaks
freeRank(N, ids: number[]): bigint
splitFree(N, ids): number[][]            // group runs of real chars, drop break ids
```
A *block* of W break glyphs (not one separator) is used on purpose: at N=12,877 a single
separator is hit ~1/12,878 of the time → no breaks; W≈N/5 gives break prob ≈ 1/6 ⇒ mean line
≈ 5 real chars (词-like). `splitFree` drops break ids for display only, so the index is NOT
canonicalized and `freeRank(freeUnrank(k)) === k` stays exact.

**Reversible scatter (format-preserving Feistel + cycle-walk):**
```ts
scatter(M: bigint, key: bigint, x: bigint): bigint     // bijection on [0, M)
unscatter(M: bigint, key: bigint, y: bigint): bigint
```
Invariant: `unscatter(M,key,scatter(M,key,x)) === x`; neighbours decorrelate (≥80% Hamming).

**Layout + helpers:**
```ts
indexToPoint(scatteredIndex: bigint, R?=1000): Vec3
FORMS, FORM_LIST, type FormId, type FormDef, type Lexicon, type Vec3
```

### `Lexicon` (consumed by the 格律 functions)
Typed-array tone + 平水韵 rhyme tables; `N` (radix) lives inside. Build it from a real
`LexiconAsset` via `contract.ts::hydrateLexicon`, or use the placeholder. Fields:
`N, pingList, zeList, pingRank, zeRank, toneClass, rhymeOf, rhymeMembers, rhymeRank`
(see `engine.ts` for exact types). The engine never imports a lexicon directly — it is
always passed one, so swapping real ↔ placeholder data is a data concern, not a code change.

---

## Key design facts (so a rewrite doesn't relearn them)

- **The catalog index ≈ the poem.** A 七律 index is ~229 decimal digits = the same
  information as the 56 characters. Showing the full index IS the point ("the catalog is the
  library"). Don't truncate it to look tidy.
- **Seed bias (Step 4b) must only change WHICH index is sampled, never the index→poem map.**
  Keep `pullAt`'s output index exact and reversible.
- **All BigInt.** Indices can be 760 bits. For per-frame bulk work move to a Web Worker
  (see ARCHITECTURE); single clicks are sub-millisecond on the main thread.
