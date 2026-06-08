// Build the REAL 格律 lexicon (toneClass + 平水韵 韵部) for the 字库, from the open
// charlesix59/chinese_word_rhyme 平水韵 data (MIT). Mostly Simplified already; OpenCC
// patches stray Traditional; pinyin-pro fills the rare tail. Emits public/data/lexicon.json.
// Run: node pipeline/build-lexicon.mjs
import { readFileSync, writeFileSync } from "node:fs";
import * as OpenCC from "opencc-js";
import { pinyin } from "pinyin-pro";
import { fileURLToPath } from "node:url";

const RHYME_SRC = "C:/corpus/Pingshui_Rhyme.json"; // external; raw charlesix59 平水韵 file
const CHARSET = fileURLToPath(new URL("../public/data/charset.json", import.meta.url));
const OUT = fileURLToPath(new URL("../public/data/lexicon.json", import.meta.url));

const t2s = OpenCC.Converter({ from: "tw", to: "cn" }); // traditional → simplified (patch tail)

const rhyme = JSON.parse(readFileSync(RHYME_SRC, "utf8"));
// char → { tone: 0平|1仄, rhyme: 平声韵部 id or -1 }, preferring 平 for 多音字
const map = new Map();
function put(ch, tone, rhymeId) {
  const prev = map.get(ch);
  if (!prev) {
    map.set(ch, { tone, rhyme: rhymeId });
    return;
  }
  if (tone === 0 && prev.tone !== 0) map.set(ch, { tone: 0, rhyme: rhymeId }); // upgrade to 平
}

const PING_SECTIONS = ["上平声部", "下平声部"];
const ZE_SECTIONS = ["上声部", "去声部", "入声部"];
let rhymeId = 0;
const rhymeNames = [];
for (const sec of PING_SECTIONS) {
  for (const group of Object.keys(rhyme[sec] || {})) {
    rhymeNames.push(group);
    for (const ch of rhyme[sec][group]) {
      put(ch, 0, rhymeId);
      const s = t2s(ch);
      if (s !== ch) put(s, 0, rhymeId);
    }
    rhymeId++;
  }
}
for (const sec of ZE_SECTIONS) {
  for (const group of Object.keys(rhyme[sec] || {})) {
    for (const ch of rhyme[sec][group]) {
      put(ch, 1, -1);
      const s = t2s(ch);
      if (s !== ch) put(s, 1, -1);
    }
  }
}
const NUM_RHYME = rhymeId; // 30 平声韵部

function pinyinTone(ch) {
  const py = pinyin(ch, { toneType: "num", type: "array" })[0];
  if (!py) return 1; // non-Han / unknown → treat 仄
  const d = py.charCodeAt(py.length - 1) - 48;
  return d === 1 || d === 2 ? 0 : 1; // 阴平/阳平 → 平; 上/去/轻 → 仄
}

const charset = JSON.parse(readFileSync(CHARSET, "utf8"));
const chars = [...charset.chars];
const n = chars.length;

const toneClass = new Array(n);
const rhymeOf = new Array(n);
let fromData = 0,
  fromPinyin = 0;
for (let i = 0; i < n; i++) {
  const ch = chars[i];
  const hit = map.get(ch);
  if (hit) {
    toneClass[i] = hit.tone;
    rhymeOf[i] = hit.tone === 0 ? hit.rhyme : -1;
    fromData++;
  } else {
    toneClass[i] = pinyinTone(ch);
    rhymeOf[i] = -1;
    fromPinyin++;
  }
}

const pingList = [];
const zeList = [];
for (let i = 0; i < n; i++) (toneClass[i] === 0 ? pingList : zeList).push(i);
const rhymeMembers = Array.from({ length: NUM_RHYME }, () => []);
for (let i = 0; i < n; i++) if (rhymeOf[i] >= 0) rhymeMembers[rhymeOf[i]].push(i);

// guard: every 韵部 needs ≥1 member (engine handles 0, but flag it)
const empties = rhymeMembers.map((m, q) => (m.length === 0 ? rhymeNames[q] : null)).filter(Boolean);

writeFileSync(
  OUT,
  JSON.stringify({ version: 1, n, pingList, zeList, toneClass, rhymeOf, rhymeMembers }),
);

console.log(`lexicon: n=${n}  平=${pingList.length} 仄=${zeList.length}  韵部=${NUM_RHYME}`);
console.log(`  from 平水韵 data: ${fromData}  pinyin fallback: ${fromPinyin}`);
console.log(`  rhyme members per 韵部:`, rhymeMembers.map((m) => m.length).join(","));
if (empties.length) console.log(`  WARNING empty 韵部:`, empties.join(","));
