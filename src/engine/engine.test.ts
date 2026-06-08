import { describe, it, expect } from "vitest";
import {
  FORM_LIST,
  babelRank,
  babelUnrank,
  babelSize,
  regulatedSize,
  regulatedUnrank,
  regulatedRank,
  embedToGlobal,
  globalToRegulated,
  isRegulated,
  scatter,
  unscatter,
  indexToPoint,
  randBig,
  hamming,
  type FormDef,
} from "./engine";
import { makeFixtureLexicon } from "./lexicon.fixture";

const lex = makeFixtureLexicon(60, 60, 6); // N=120
const N = BigInt(lex.N);
const KEY = 0xc0ffeen;
const ITERS = 200;

describe.each(FORM_LIST)("form $id", (form: FormDef) => {
  const babelN = babelSize(form.L, N);
  const gN = regulatedSize(lex, form);

  it("Babel round-trip: rank(unrank(k)) === k", () => {
    for (let t = 0; t < ITERS; t++) {
      const k = randBig(babelN);
      expect(babelRank(N, babelUnrank(form.L, N, k))).toBe(k);
    }
  });

  it("Babel edge cases (0 and N^L - 1)", () => {
    for (const k of [0n, babelN - 1n]) {
      expect(babelRank(N, babelUnrank(form.L, N, k))).toBe(k);
    }
  });

  it("格律 round-trip: regulatedRank(regulatedUnrank(s)) === s", () => {
    for (let t = 0; t < ITERS; t++) {
      const s = randBig(gN);
      const poem = regulatedUnrank(lex, form, s);
      expect(regulatedRank(lex, form, poem)).toBe(s);
    }
  });

  it("every 格律-unrank output passes the independent validator", () => {
    for (let t = 0; t < ITERS; t++) {
      const poem = regulatedUnrank(lex, form, randBig(gN));
      expect(isRegulated(lex, form, poem.chars)).toBe(true);
    }
  });

  it("格律 edge cases (0 and |G| - 1) round-trip and validate", () => {
    for (const s of [0n, gN - 1n]) {
      const poem = regulatedUnrank(lex, form, s);
      expect(regulatedRank(lex, form, poem)).toBe(s);
      expect(isRegulated(lex, form, poem.chars)).toBe(true);
    }
  });

  it("dual-index nesting: globalToRegulated(embedToGlobal(s)) === s", () => {
    for (let t = 0; t < ITERS; t++) {
      const s = randBig(gN);
      const g = embedToGlobal(lex, form, s);
      expect(g).toBeLessThan(babelN); // 格律 index embeds inside the Babel catalog
      expect(globalToRegulated(lex, form, g)).toBe(s);
    }
  });

  it("Feistel scatter is an exact involution on both catalogs", () => {
    for (const M of [babelN, gN]) {
      for (let t = 0; t < ITERS; t++) {
        const x = randBig(M);
        const y = scatter(M, KEY, x);
        expect(y).toBeLessThan(M); // stays in range (cycle-walk)
        expect(unscatter(M, KEY, y)).toBe(x);
      }
    }
  });

  it("Feistel scatter has no collisions on a sample", () => {
    const seen = new Set<string>();
    for (let t = 0; t < ITERS; t++) {
      const y = scatter(babelN, KEY, randBig(babelN));
      seen.add(y.toString());
    }
    expect(seen.size).toBe(ITERS);
  });
});

describe("scatter decorrelates neighbours (statistical)", () => {
  it("consecutive Babel indices map to dissimilar poems (≥80% Hamming)", () => {
    const form = FORM_LIST[0]; // wujue, L=20
    const babelN = babelSize(form.L, N);
    let total = 0;
    const trials = 300;
    for (let t = 0; t < trials; t++) {
      const x = randBig(babelN - 1n);
      const a = babelUnrank(form.L, N, unscatter(babelN, KEY, x));
      const b = babelUnrank(form.L, N, unscatter(babelN, KEY, x + 1n));
      total += hamming(a, b);
    }
    expect(total / trials).toBeGreaterThanOrEqual(0.8 * form.L);
  });
});

describe("indexToPoint", () => {
  it("is deterministic and bounded", () => {
    const idx = randBig(1n << 200n);
    const p1 = indexToPoint(idx, 1000);
    const p2 = indexToPoint(idx, 1000);
    expect(p1).toEqual(p2);
    for (const c of [p1.x, p1.y, p1.z]) {
      expect(c).toBeGreaterThanOrEqual(-1000);
      expect(c).toBeLessThanOrEqual(1000);
    }
  });
});
