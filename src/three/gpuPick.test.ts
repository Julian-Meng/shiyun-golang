import { describe, it, expect } from "vitest";
import { encodePickColor, nearestPoetIndex } from "./gpuPick";

// Decode the way the picker does on CPU after readback (id = r | g<<8 | b<<16; index = id-1).
const decode = (r: number, g: number, b: number) => (r | (g << 8) | (b << 16)) - 1;
// encodePickColor returns components in [0,1]; the GPU stores them as 8-bit, so *255 round-trips.
const toBytes = (i: number) => encodePickColor(i).map((c) => Math.round(c * 255)) as [number, number, number];

describe("gpuPick colour-ID encode/decode", () => {
  it("round-trips poet indices across byte boundaries", () => {
    for (const i of [0, 1, 254, 255, 256, 257, 65535, 65536, 65537, 29807]) {
      const [r, g, b] = toBytes(i);
      expect(decode(r, g, b)).toBe(i);
    }
  });
  it("index 0 encodes to a NON-zero colour (so cleared background = miss)", () => {
    const [r, g, b] = toBytes(0);
    expect(r | g | b).not.toBe(0); // background (0,0,0) must never collide with a real poet
    expect(decode(0, 0, 0)).toBe(-1); // and the background decodes to a miss
  });
});

describe("nearestPoetIndex", () => {
  const n = 5;
  const radius = 2; // centre pixel = (2,2)
  function emptyBuf() {
    return new Uint8Array(n * n * 4);
  }
  function put(buf: Uint8Array, x: number, y: number, index: number) {
    const [r, g, b] = toBytes(index);
    const o = (y * n + x) * 4;
    buf[o] = r;
    buf[o + 1] = g;
    buf[o + 2] = b;
    buf[o + 3] = 255;
  }

  it("returns -1 for an all-background window", () => {
    expect(nearestPoetIndex(emptyBuf(), n, radius)).toBe(-1);
  });
  it("finds a single hit anywhere in the window", () => {
    const buf = emptyBuf();
    put(buf, 0, 4, 4242);
    expect(nearestPoetIndex(buf, n, radius)).toBe(4242);
  });
  it("picks the hit CLOSEST to the centre when several overlap", () => {
    const buf = emptyBuf();
    put(buf, 0, 0, 11); // far corner (dist² = 8)
    put(buf, 2, 3, 22); // one below centre (dist² = 1) → should win
    put(buf, 4, 4, 33); // far corner
    expect(nearestPoetIndex(buf, n, radius)).toBe(22);
  });
  it("returns the exact-centre hit", () => {
    const buf = emptyBuf();
    put(buf, 2, 2, 777);
    put(buf, 1, 2, 888);
    expect(nearestPoetIndex(buf, n, radius)).toBe(777);
  });
});
