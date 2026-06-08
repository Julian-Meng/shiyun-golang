// 诗云 Step-3 data pipeline (Werneror backbone, Simplified, no OpenCC).
// Reads all dynasty CSVs → emits charset + poet index + per-poet poems (bucketed).
// Run: node --max-old-space-size=4096 pipeline/build-data.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = "C:/corpus/Werneror-Poetry"; // external corpus clone (persists on this machine)
const OUT = fileURLToPath(new URL("../public/data", import.meta.url)); // this project's data dir

// raw 朝代 string → canonical dynasty key (must match src/data/dynasties.ts)
const DYN = {
  先秦: "xianqin",
  秦: "qinhan", 汉: "qinhan",
  魏晋: "weijin", 魏晋末南北朝初: "weijin",
  南北朝: "nanbeichao",
  隋: "sui", 隋末唐初: "tang",
  唐: "tang", 唐末宋初: "tang",
  宋: "song", 宋末金初: "song", 宋末元初: "song",
  辽: "liao",
  金: "jin", 金末元初: "jin",
  元: "yuan", 元末明初: "ming",
  明: "ming", 明末清初: "qing",
  清: "qing", 清末民国初: "jinxiandai", 清末近现代初: "jinxiandai",
  近现代: "jinxiandai", 近现代末当代初: "dangdai", 民国末当代初: "dangdai",
  当代: "dangdai",
};

// minimal RFC4180-ish CSV parser (handles quotes, "" escapes, embedded newlines)
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQ = false, i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += c; i++;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const HAN = /\p{Script=Han}/u;
const onlyHan = (s) => [...s].filter((c) => HAN.test(c)).join("");
const splitLines = (content) =>
  content.split(/[，。！？；、\s]+/).map(onlyHan).filter(Boolean);

const FORMS = [
  { id: "wujue", lines: 4, per: 5 },
  { id: "qijue", lines: 4, per: 7 },
  { id: "wulu", lines: 8, per: 5 },
  { id: "qilu", lines: 8, per: 7 },
];
function classifyForm(lines) {
  const f = FORMS.find((F) => F.lines === lines.length && lines.every((l) => [...l].length === F.per));
  return f ? f.id : "other";
}

// fast 32-bit FNV-1a → uint32
function fnv32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
// 8-hex poet id, bucketed by first 2 hex chars (256 buckets)
const poetId = (name, dyn) => fnv32(name + "|" + dyn).toString(16).padStart(8, "0");
// 2-hex content bucket (256 shards) for the first-line search index
const lineBucket = (s) => (fnv32(s) & 0xff).toString(16).padStart(2, "0");

// 赠诗 markers: title verbs that mark a poem dedicated/replying to another poet. The
// precision guard is that the text AFTER the marker must literally be a known poet NAME
// (so noisy markers like 和/送 can't fabricate edges from common words). Longest first.
const GIFT_MARKERS = [
  "奉和", "奉寄", "奉赠", "奉酬", "次韵", "次韵和", "和答", "酬答", "寄赠",
  "寄", "赠", "贈", "和", "酬", "答", "呈", "简", "簡", "怀", "懷", "忆", "憶",
  "送", "别", "別", "示", "谢", "謝", "贺", "賀", "挽", "悼", "哭",
];
const HONORIFIC = /^[大老君公侯郎中令丞卿使府监太少卫将军相王爷儿子弟兄翁叟生先]+/;
// non-person strings that collide with obscure poet names (places / roles / counters).
const GIFT_STOP = new Set([
  "钱塘","长安","洛阳","江南","江东","江上","西湖","金陵","扬州","成都","襄阳","山中","城南",
  "故人","主人","诸公","先生","使君","明府","山人","居士","道士","上人","长老","将军","刺史",
  "太守","二首","三首","四首","其二","其三","同年","友人","内子","小儿","幼子","门生","座主",
]);

console.log("reading CSVs from", SRC);
const files = readdirSync(SRC).filter((f) => f.endsWith(".csv"));
const freq = new Map(); // char -> count
const poets = new Map(); // id -> {id,name,dynasty,dynastyRaw,count,poems:[]}
const firstLines = new Map(); // firstLine -> [{p:poetId, i:poemIdx, t:title, f:form}]  (search index)
const FL_CAP = 12; // max poems indexed per identical opening (avoid skew on ultra-common lines)
let total = 0;

for (const file of files) {
  const rows = parseCSV(readFileSync(join(SRC, file), "utf8"));
  // header = 题目,朝代,作者,内容
  for (let r = 1; r < rows.length; r++) {
    const [title, dynRaw, author, content] = rows[r];
    if (!author || !content) continue;
    const dyn = DYN[dynRaw] || "unknown";
    const lines = splitLines(content);
    if (lines.length === 0) continue;
    for (const l of lines) for (const ch of l) freq.set(ch, (freq.get(ch) || 0) + 1);
    const id = poetId(author, dyn);
    let p = poets.get(id);
    if (!p) { p = { id, name: author, dynasty: dyn, dynastyRaw: dynRaw, count: 0, poems: [] }; poets.set(id, p); }
    p.count++;
    const f = classifyForm(lines);
    const poemIdx = p.poems.length;
    p.poems.push({ t: title || "", f, p: lines });
    total++;
    // first-line search index (床前明月光 → this poem). Skip 1-char fragments.
    const fl = lines[0];
    if ([...fl].length >= 2) {
      let arr = firstLines.get(fl);
      if (!arr) { arr = []; firstLines.set(fl, arr); }
      if (arr.length < FL_CAP) arr.push({ p: id, i: poemIdx, t: title || "", f });
    }
  }
  console.log(`  ${file}: poems=${total} poets=${poets.size}`);
}

// charset ordered by desc frequency (ties by codepoint)
const chars = [...freq.entries()]
  .sort((a, b) => b[1] - a[1] || a[0].codePointAt(0) - b[0].codePointAt(0))
  .map(([c]) => c);
const N = chars.length;

mkdirSync(join(OUT, "poems"), { recursive: true });

// charset.json
const charsStr = chars.join("");
let hh = 0x811c9dc5;
for (let i = 0; i < charsStr.length; i++) { hh ^= charsStr.charCodeAt(i); hh = Math.imul(hh, 0x01000193); }
writeFileSync(join(OUT, "charset.json"), JSON.stringify({ version: 1, n: N, hash: (hh >>> 0).toString(16), chars: charsStr }));

// poets.index.json (sorted by poemCount desc)
const clusterSize = (n) => Math.min(60, Math.max(2, +(2 + 1.4 * Math.sqrt(n)).toFixed(2)));
const index = [...poets.values()]
  .sort((a, b) => b.count - a.count)
  .map((p) => ({ id: p.id, name: p.name, dynasty: p.dynasty, poemCount: p.count, clusterSize: clusterSize(p.count) }));
writeFileSync(join(OUT, "poets.index.json"), JSON.stringify(index));

// poems bucketed by id[0:2] (256 buckets) -> {id: [{t,f,p}]}
const buckets = new Map();
for (const p of poets.values()) {
  const b = p.id.slice(0, 2);
  let obj = buckets.get(b);
  if (!obj) { obj = {}; buckets.set(b, obj); }
  obj[p.id] = p.poems;
}
// SKIP_HEAVY=1 reuses already-generated poems/+firstline/ (231+75 MB) to iterate fast on
// the lightweight gifts.json / manifest only.
const SKIP_HEAVY = !!process.env.SKIP_HEAVY;
if (!SKIP_HEAVY)
  for (const [b, obj] of buckets) writeFileSync(join(OUT, "poems", `${b}.json`), JSON.stringify(obj));

// ── first-line search index: firstline/{2-hex content bucket}.json -> {firstLine: [refs]} ──
mkdirSync(join(OUT, "firstline"), { recursive: true });
const flBuckets = new Map();
for (const [fl, refs] of firstLines) {
  const b = lineBucket(fl);
  let obj = flBuckets.get(b);
  if (!obj) { obj = {}; flBuckets.set(b, obj); }
  obj[fl] = refs;
}
if (!SKIP_HEAVY)
  for (const [b, obj] of flBuckets) writeFileSync(join(OUT, "firstline", `${b}.json`), JSON.stringify(obj));

// ── 赠诗 network: parse titles for 寄/赠/和/次韵… + a known poet NAME → poet→poet edges ──
// name -> poets with that name (each {id, dynId, count}).
const DYN_ORDER = ["xianqin","qinhan","weijin","nanbeichao","sui","tang","wudai","song","liao","jin","yuan","ming","qing","jinxiandai","dangdai"];
const dynId = (k) => { const i = DYN_ORDER.indexOf(k); return i < 0 ? 99 : i; };
const byName = new Map();
for (const p of poets.values()) {
  let a = byName.get(p.name);
  if (!a) { a = []; byName.set(p.name, a); }
  a.push({ id: p.id, dynId: dynId(p.dynasty), count: p.count });
}

// 字号/别称 → 本名: famous, near-unambiguous studio-names (号 collide far less than 字). When a
// title names a poet by 号 (e.g. 晦庵 = 朱熹, 东坡 = 苏轼), redirect to the canonical poet —
// otherwise the 号 either collides with a 1-poem namesake or misses the famous target entirely.
const GIFT_ALIAS = {
  东坡:"苏轼", 坡公:"苏轼", 苏长公:"苏轼", 子瞻:"苏轼",
  半山:"王安石", 荆公:"王安石", 介甫:"王安石", 王介甫:"王安石",
  山谷:"黄庭坚", 涪翁:"黄庭坚", 黄山谷:"黄庭坚",
  晦庵:"朱熹", 紫阳:"朱熹", 朱晦庵:"朱熹",
  遗山:"元好问", 元遗山:"元好问",
  简斋:"陈与义", 后山:"陈师道", 诚斋:"杨万里", 石湖:"范成大", 淮海:"秦观",
  少陵:"杜甫", 杜陵:"杜甫", 老杜:"杜甫", 香山:"白居易", 乐天:"白居易",
  昌黎:"韩愈", 柳州:"柳宗元", 青莲:"李白", 谪仙:"李白", 醉翁:"欧阳修", 六一:"欧阳修",
  易安:"李清照", 稼轩:"辛弃疾", 放翁:"陆游", 靖节:"陶渊明", 摩诘:"王维",
};
const isKnown = (s) => byName.has(s) || s in GIFT_ALIAS;
// chars that legitimately END / follow a complete 2-char name: relations, counters, and the
// leading char of an official title/role. So 王巩(end) / 张籍水部 / 王巩二首 are accepted, but a
// truncated longer name (王介+甫, 张元+礼, 陈宗+谕) or surname+role (李道+士) is rejected.
const NAME_END = new Set([
  ..."兄弟姊妹翁叟丈郎公侯君卿氏见之韵作并同赴往行归还赋诗词书札时留别后其等",
  ..."二三四五六七八九十首篇章绝律古绝",
  ..."员中山道学舍补拾司刺太县长参博校正主录评大侍尚给秘著处居上法禅征使明少别判节观转提安经制宣枢翰谏起秀进尉丞簿",
]);
const isHan = (c) => c !== undefined && /[一-鿿]/.test(c);
// greedy-longest known/alias name at cs[start]; a bare 2-char name must be COMPLETE (followed by
// a name-ending char / punctuation / end) so a longer name or name+role isn't silently truncated.
function nameAt(cs, start) {
  for (const len of [4, 3, 2]) {
    if (start + len > cs.length) continue;
    const cand = cs.slice(start, start + len).join("");
    if (GIFT_STOP.has(cand) || !isKnown(cand)) continue;
    if (len === 2 && !(cand in GIFT_ALIAS)) {
      const next = cs[start + len];
      if (isHan(next) && !NAME_END.has(next)) continue; // looks mid-name → reject
    }
    return cand;
  }
  return null;
}
// find the dedicatee right after a marker (raw start, then after an honorific prefix, then +1).
function findName(after) {
  const win = [...after].slice(0, 8);
  let n = nameAt(win, 0);
  if (n) return n;
  const stripped = [...win.join("").replace(HONORIFIC, "")];
  if (stripped.length !== win.length) { n = nameAt(stripped, 0); if (n) return n; }
  return nameAt(win, 1);
}
// resolve a name (or 号/字 alias) to a poet id. Bare names: SAME dynasty only (precision — a bare
// namesake across dynasties is almost always a collision). Aliases: cross-dynasty allowed (the
// reference is unambiguous — a 清人 和东坡 really means 苏轼). Pick the most prolific match.
function resolveTarget(name, authorDynId, fromId) {
  const aliased = name in GIFT_ALIAS;
  const cands = byName.get(aliased ? GIFT_ALIAS[name] : name);
  if (!cands) return null;
  let best = null, bestCount = -1;
  for (const c of cands) {
    if (c.id === fromId) continue;
    if (!aliased && c.dynId !== authorDynId) continue;
    if (c.count > bestCount) { bestCount = c.count; best = c; }
  }
  return best ? best.id : null;
}
// One edge per DISTINCT recipient per poem (兼寄/兼简/兼呈 → multiple). Scan ALL markers and ALL
// their occurrences (no early break) so marker list-order can't drop the primary dedication.
const edgeW = new Map(); // "from|to" -> weight
for (const p of poets.values()) {
  const aDyn = dynId(p.dynasty);
  for (const poem of p.poems) {
    const title = poem.t;
    if (!title) continue;
    const targets = new Set();
    for (const mk of GIFT_MARKERS) {
      let from = 0, at;
      while ((at = title.indexOf(mk, from)) >= 0) {
        from = at + mk.length;
        const name = findName(title.slice(at + mk.length));
        if (name) { const to = resolveTarget(name, aDyn, p.id); if (to) targets.add(to); }
      }
    }
    for (const to of targets) {
      const key = p.id + "|" + to;
      edgeW.set(key, (edgeW.get(key) || 0) + 1);
    }
  }
}
const edges = [...edgeW.entries()]
  .map(([k, w]) => { const [from, to] = k.split("|"); return [from, to, w]; })
  .sort((a, b) => b[2] - a[2]);
writeFileSync(join(OUT, "gifts.json"), JSON.stringify({ version: 1, edgeCount: edges.length, edges }));

// dynasty poet counts
const dynCounts = {};
for (const p of poets.values()) dynCounts[p.dynasty] = (dynCounts[p.dynasty] || 0) + 1;

writeFileSync(join(OUT, "manifest.json"), JSON.stringify({
  version: 2, n: N, poetCount: poets.size, poemCount: total,
  buckets: [...buckets.keys()].sort(),
  firstlineBuckets: [...flBuckets.keys()].sort(),
  giftEdges: edges.length,
  dynCounts,
}));
console.log(`\n首句索引 buckets=${flBuckets.size}  赠诗 edges=${edges.length}`);

console.log(`\nDONE  poets=${poets.size}  poems=${total}  字库 N=${N}  buckets=${buckets.size}`);
console.log("dynasty poet counts:", dynCounts);
