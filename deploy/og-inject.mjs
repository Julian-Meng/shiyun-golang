// 诗云 — server-side OG share-card injection. ZERO dependencies (pure string work).
//
// Imported by feedback-server.mjs (the ONE backend) to rewrite per-target share cards: a hash-only
// link (`#a=…`) is invisible to crawlers (WeChat/Twitter/Telegram), so every share previews the same
// generic og.jpg. permalink.ts now also mirrors the target into the QUERY (`/?a=…#a=…`), which the
// server CAN see — this module swaps og:title/og:description/twitter:title/twitter:description (+
// og:url) per target. og:image is left exactly as built. Unknown/malformed input → the HTML is
// returned UNCHANGED (the generic card), never a 500 and never any echo of the raw input.
//
// SECURITY (round-6 lessons, see MEMORY): every injected value is HTML-escaped; query values are
// length-capped BEFORE lookup; injection only ever rewrites the `content="…"` of the KNOWN meta tags
// (regex anchored on the exact property/name) — raw input is NEVER echoed anywhere in the document.
// Pure functions only — no fs, no network — so feedback-server.mjs stays zero-dep and this is unit
// -testable without spawning a server.

// dynastyId(key) → 中文 display. HARDCODED to keep the server zero-dep.
// SOURCE OF TRUTH: src/data/dynasties.ts (the DYNASTIES array's key→label). Keep in sync if that
// taxonomy changes (先秦 → 当代). poets.index.json stores the `key`; we display the `label`.
export const DYNASTY_LABELS = {
  xianqin: "先秦",
  qinhan: "秦汉",
  weijin: "魏晋",
  nanbeichao: "南北朝",
  sui: "隋",
  tang: "唐",
  wudai: "五代十国",
  song: "宋",
  liao: "辽",
  jin: "金",
  yuan: "元",
  ming: "明",
  qing: "清",
  jinxiandai: "近现代",
  dangdai: "当代",
};

// Caps. Poet ids are short hex; 8–12 chars in the shipped index. A poem 编号 can rank to ~800+ digits
// (long 自由 poems) — cap generously at 4000 so a real one is never rejected, but a multi-MB junk
// query is. The cap is applied BEFORE any lookup so a hostile value can't drive work or memory.
export const MAX_POET_ID = 64; // generous vs the ~12-char real ids; rejects junk early
export const MAX_POEM_DIGITS = 4000;

const POET_ID_RE = /^[0-9a-fA-F]+$/; // ids are sha-derived hex (see contract.ts)
const POEM_INDEX_RE = /^[0-9]+$/; // the 编号 is decimal digits only

/** HTML-escape for an attribute VALUE context (we inject into content="…"). Escapes the five chars
 *  that could break out of the attribute or the tag: & < > " '. */
export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Replace the `content="…"` of a single meta tag identified by attr/name (e.g. property="og:title").
 * The regex is ANCHORED on the exact attribute so only the KNOWN tag is touched, in either attribute
 * order (content before or after the identifier). `value` is the ALREADY-escaped replacement. If the
 * tag isn't found the HTML is returned unchanged (idempotent / order-independent).
 */
export function setMetaContent(html, attr, name, value) {
  const id = `${attr}="${name}"`;
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // escape regex metachars in the identifier
  // form 1: <meta property="og:title" ... content="X" ...>
  const after = new RegExp(`(<meta\\s+${esc}[^>]*?\\scontent=")[^"]*(")`, "i");
  if (after.test(html)) return html.replace(after, `$1${value}$2`);
  // form 2: <meta content="X" ... property="og:title" ...>
  const before = new RegExp(`(<meta\\s+content=")[^"]*("[^>]*?\\s${esc})`, "i");
  if (before.test(html)) return html.replace(before, `$1${value}$2`);
  return html;
}

/** Apply a {title, description, url?} card to the four meta tags (og + twitter). Values are escaped
 *  here, once, so callers pass plain strings. og:image is intentionally NOT touched. */
export function applyCard(html, card) {
  const title = escapeHtml(card.title);
  const desc = escapeHtml(card.description);
  let out = html;
  out = setMetaContent(out, "property", "og:title", title);
  out = setMetaContent(out, "property", "og:description", desc);
  out = setMetaContent(out, "name", "twitter:title", title);
  out = setMetaContent(out, "name", "twitter:description", desc);
  if (card.url) out = setMetaContent(out, "property", "og:url", escapeHtml(card.url));
  return out;
}

/** Poet card copy — matches the existing index.html meta tone. `poet` = a poets.index.json row. */
export function poetCard(poet) {
  const dyn = DYNASTY_LABELS[poet.dynasty] || poet.dynasty || "历代";
  const n = Number(poet.poemCount) || 0;
  return {
    title: `${poet.name} — 诗云 · Poetry Cloud`,
    description: `${dyn} · ${n} 首 · 在三维诗云星图中漫游他的星团`,
  };
}

/** Generic poem card — the server can't unrank (the engine is client TS/BigInt), so the card quotes
 *  the 编号 truncated. `digits` is the validated decimal 编号 string. */
export function poemCard(digits) {
  const head = digits.slice(0, 12);
  const tail = digits.length > 12 ? `…共 ${digits.length} 位` : "";
  return {
    title: "诗云 · 一首可能的诗",
    description: `编号 ${head}${tail} · 在一切可能的诗的虚空里被捕捉的一首`,
  };
}

/**
 * The core injector. Given the built index.html, a raw query object {a?, p?}, and an OPTIONAL
 * og:url, return the (possibly) rewritten HTML — or the UNCHANGED html for any miss/malformed input.
 *
 *   @param html      the built SITE_ROOT/index.html (read once at boot, never per-request)
 *   @param query     { a?: string, p?: string } from the request's ?a=/?p=
 *   @param poetsById Map<id, poetRow> (built once at boot from poets.index.json)
 *   @param ogUrl     optional absolute URL for og:url (e.g. https://host/?a=ID); omitted → not set
 *   @returns { html, hit } — hit is "poet" | "poem" | null (null = unchanged passthrough)
 */
export function injectOg(html, query, poetsById, ogUrl) {
  // ?a=<poetId> — validate (hex, length cap) BEFORE the map lookup
  if (query.a != null) {
    const id = String(query.a);
    if (id.length <= MAX_POET_ID && POET_ID_RE.test(id)) {
      const poet = poetsById.get(id);
      if (poet) return { html: applyCard(html, { ...poetCard(poet), url: ogUrl }), hit: "poet" };
    }
    return { html, hit: null }; // unknown/malformed id → unchanged
  }
  // ?p=<digits> — digits only, length cap; the card is generic (no unrank server-side)
  if (query.p != null) {
    const digits = String(query.p);
    if (digits.length >= 1 && digits.length <= MAX_POEM_DIGITS && POEM_INDEX_RE.test(digits)) {
      return { html: applyCard(html, { ...poemCard(digits), url: ogUrl }), hit: "poem" };
    }
    return { html, hit: null }; // malformed/oversized → unchanged
  }
  return { html, hit: null };
}

/** Build the id→poet Map from a parsed poets.index.json array (called once at boot). */
export function buildPoetMap(poetsIndexArray) {
  const m = new Map();
  for (const p of poetsIndexArray) if (p && p.id) m.set(p.id, p);
  return m;
}
