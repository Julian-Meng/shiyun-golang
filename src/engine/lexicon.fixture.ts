// A synthetic Lexicon for testing the engine's bijection math in isolation.
// It is NOT real 平水韵 — it just needs to be internally consistent so the
// round-trip / nesting / validator properties can be checked. Real tone+rhyme
// data is produced later by the data pipeline.
//
// Layout (N = PING + ZE chars):
//   • char-ids [0, PING)        → 平-tone, partitioned into RHYME_GROUPS 韵部
//   • char-ids [PING, PING+ZE)  → 仄-tone
//   • every 平 char belongs to exactly one 韵部 (like real 平水韵)
import type { Lexicon } from "./engine";

export function makeFixtureLexicon(
  pingCount = 60,
  zeCount = 60,
  rhymeGroups = 6,
): Lexicon {
  if (pingCount % rhymeGroups !== 0) throw new Error("pingCount must divide evenly into rhymeGroups");
  const per = pingCount / rhymeGroups;
  const N = pingCount + zeCount;

  const pingList = new Uint32Array(pingCount);
  for (let i = 0; i < pingCount; i++) pingList[i] = i; // ids 0..pingCount-1
  const zeList = new Uint32Array(zeCount);
  for (let i = 0; i < zeCount; i++) zeList[i] = pingCount + i; // ids pingCount..N-1

  const toneClass = new Int8Array(N);
  const rhymeOf = new Int16Array(N).fill(-1);
  const pingRank = new Int32Array(N).fill(-1);
  const zeRank = new Int32Array(N).fill(-1);

  for (let i = 0; i < pingCount; i++) {
    toneClass[i] = 0;
    pingRank[i] = i;
    rhymeOf[i] = Math.floor(i / per);
  }
  for (let i = 0; i < zeCount; i++) {
    const id = pingCount + i;
    toneClass[id] = 1;
    zeRank[id] = i;
  }

  const rhymeMembers: Uint32Array[] = [];
  const rhymeRank: Int32Array[] = [];
  for (let q = 0; q < rhymeGroups; q++) {
    const members = new Uint32Array(per);
    const rank = new Int32Array(N).fill(-1);
    for (let j = 0; j < per; j++) {
      const id = q * per + j;
      members[j] = id;
      rank[id] = j;
    }
    rhymeMembers.push(members);
    rhymeRank.push(rank);
  }

  return { N, pingList, zeList, pingRank, zeRank, toneClass, rhymeOf, rhymeMembers, rhymeRank };
}
