import { describe, it, expect } from "vitest";
import { lineSkeletons } from "./load";

// The fuzzy 诗句 index relies on this property: two same-length lines differing by ONE substitution
// share the (L-1) skeleton formed by deleting the differing position. That's how 「举头望明月」 finds
// the corpus 「举头望山月」 (静夜思).
describe("lineSkeletons (fuzzy 1-edit keys)", () => {
  it("a 1-char substitution shares a skeleton (举头望明月 ↔ 举头望山月)", () => {
    const sa = new Set(lineSkeletons([..."举头望明月"]));
    const shared = lineSkeletons([..."举头望山月"]).filter((s) => sa.has(s));
    expect(shared).toContain("举头望月"); // dropping the differing position (明/山)
  });
  it("produces one skeleton per position", () => {
    expect(lineSkeletons([..."床前明月光"])).toHaveLength(5);
  });
  it("dedupes skeletons from repeated chars", () => {
    expect(lineSkeletons([..."明明"])).toHaveLength(1); // both drops yield 「明」
  });
  it("a fully different same-length line shares NO skeleton", () => {
    const sa = new Set(lineSkeletons([..."春眠不觉晓"]));
    expect(lineSkeletons([..."夜来风雨声"]).some((s) => sa.has(s))).toBe(false);
  });
});
