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

// fast 32-bit FNV-1a → 8-hex id, bucketed by first 2 hex chars (256 buckets)
function poetId(name, dyn) {
  let h = 0x811c9dc5;
  const s = name + "|" + dyn;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}

console.log("reading CSVs from", SRC);
const files = readdirSync(SRC).filter((f) => f.endsWith(".csv"));
const freq = new Map(); // char -> count
const poets = new Map(); // id -> {id,name,dynasty,dynastyRaw,count,poems:[]}
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
    p.poems.push({ t: title || "", f: classifyForm(lines), p: lines });
    total++;
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
for (const [b, obj] of buckets) writeFileSync(join(OUT, "poems", `${b}.json`), JSON.stringify(obj));

// dynasty poet counts
const dynCounts = {};
for (const p of poets.values()) dynCounts[p.dynasty] = (dynCounts[p.dynasty] || 0) + 1;

writeFileSync(join(OUT, "manifest.json"), JSON.stringify({
  version: 1, n: N, poetCount: poets.size, poemCount: total,
  buckets: [...buckets.keys()].sort(), dynCounts,
}));

console.log(`\nDONE  poets=${poets.size}  poems=${total}  字库 N=${N}  buckets=${buckets.size}`);
console.log("dynasty poet counts:", dynCounts);
