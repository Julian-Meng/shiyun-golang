// PLACEHOLDER lexicon for the Step-4 shell. Real 平水韵 tone+rhyme data and the
// corpus-derived 字库 arrive with the Step-3 data pipeline; this stand-in just
// lets the engine produce real-looking (gibberish) Chinese so the 3D shell is
// fully wired end-to-end. Tones/rhymes here are ASSIGNED, not authentic.
import type { Lexicon } from "../engine/engine";

const PING = 3000; // 平-tone chars
const ZE = 3000; // 仄-tone chars
const GROUPS = 30; // pretend 平水韵 30 平声韵部
const N = PING + ZE;
const PER = PING / GROUPS; // 100 per 韵部

// Real CJK ideographs (U+4E00…). Many are rare — fittingly noise-like for 诗云.
export const charset: string[] = [];
for (let i = 0; i < N; i++) charset.push(String.fromCodePoint(0x4e00 + i));

function build(): Lexicon {
  const pingList = new Uint32Array(PING);
  for (let i = 0; i < PING; i++) pingList[i] = i;
  const zeList = new Uint32Array(ZE);
  for (let i = 0; i < ZE; i++) zeList[i] = PING + i;

  const toneClass = new Int8Array(N);
  const rhymeOf = new Int16Array(N).fill(-1);
  const pingRank = new Int32Array(N).fill(-1);
  const zeRank = new Int32Array(N).fill(-1);
  for (let i = 0; i < PING; i++) {
    toneClass[i] = 0;
    pingRank[i] = i;
    rhymeOf[i] = Math.floor(i / PER);
  }
  for (let i = 0; i < ZE; i++) {
    toneClass[PING + i] = 1;
    zeRank[PING + i] = i;
  }

  const rhymeMembers: Uint32Array[] = [];
  const rhymeRank: Int32Array[] = [];
  for (let q = 0; q < GROUPS; q++) {
    const members = new Uint32Array(PER);
    const rank = new Int32Array(N).fill(-1);
    for (let j = 0; j < PER; j++) {
      const id = q * PER + j;
      members[j] = id;
      rank[id] = j;
    }
    rhymeMembers.push(members);
    rhymeRank.push(rank);
  }
  return { N, pingList, zeList, pingRank, zeRank, toneClass, rhymeOf, rhymeMembers, rhymeRank };
}

export const lexicon: Lexicon = build();
