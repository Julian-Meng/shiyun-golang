import { useRef, useState } from "react";
import { searchPoets, searchByLine, loadPoetPoems, type PoetRow, type LineHit } from "../data/load";
import { DYNASTY_BY_KEY } from "../data/dynasties";
import { halfIndexAuto, pullByIndex, type HalfIndex, type IndexPoem, type PullForm } from "../engine/engineApi";
import { useStore } from "../state/store";
import { poetPosition } from "../three/PoetStars";
import { CopyButton } from "./CopyButton";

const FORM_LABEL: Record<string, string> = {
  wujue: "五绝",
  qijue: "七绝",
  wulu: "五律",
  qilu: "七律",
  ziyou: "自由",
};
const REV_FORMS: PullForm[] = ["wujue", "qijue", "wulu", "qilu", "ziyou"];
type Tab = "poet" | "line" | "index";

export function SearchPanel() {
  const [tab, setTab] = useState<Tab>("poet");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PoetRow[]>([]);
  const [hits, setHits] = useState<LineHit[]>([]);
  const [half, setHalf] = useState<HalfIndex | null>(null);
  // 编号 reverse-search tab
  const [revForm, setRevForm] = useState<PullForm>("wujue");
  const [idxInput, setIdxInput] = useState("");
  const [rev, setRev] = useState<IndexPoem | null>(null);
  const selectPoet = useStore((s) => s.selectPoet);
  const setFlyTarget = useStore((s) => s.setFlyTarget);
  const reqRef = useRef(0);

  function onChangePoet(v: string) {
    setQ(v);
    setResults(searchPoets(v, 24));
  }
  function onChangeLine(v: string) {
    setQ(v);
    setHalf(halfIndexAuto(v)); // instant, no fetch — the 半编号 of this opening
    const token = ++reqRef.current;
    searchByLine(v).then((h) => {
      if (reqRef.current === token) setHits(h);
    });
  }
  function onChangeIndex(v: string) {
    setIdxInput(v);
    setRev(pullByIndex(revForm, v));
  }
  function pickRevForm(f: PullForm) {
    setRevForm(f);
    if (idxInput) setRev(pullByIndex(f, idxInput));
  }

  function goPoet(p: PoetRow, focus?: { poemIdx: number; title: string; firstLine: string }) {
    selectPoet(p, focus ?? null);
    setFlyTarget(poetPosition(p));
    loadPoetPoems(p.id).then((poems) => useStore.getState().setPoetPoems(p.id, poems));
    setResults([]);
  }
  function goHit(h: LineHit) {
    if (!h.poet) return;
    goPoet(h.poet, { poemIdx: h.poemIdx, title: h.title, firstLine: h.firstLine });
  }

  function switchTab(t: Tab) {
    setTab(t);
    setQ("");
    setResults([]);
    setHits([]);
    setHalf(null);
    setIdxInput("");
    setRev(null);
  }

  return (
    <div className="search">
      <div className="search-tabs">
        <button className={tab === "poet" ? "stab on" : "stab"} onClick={() => switchTab("poet")}>
          诗人
        </button>
        <button className={tab === "line" ? "stab on" : "stab"} onClick={() => switchTab("line")}>
          诗句
        </button>
        <button className={tab === "index" ? "stab on" : "stab"} onClick={() => switchTab("index")}>
          编号反查
        </button>
      </div>

      {tab !== "index" && (
        <input
          value={q}
          placeholder={tab === "poet" ? "搜索诗人…" : "输入一句诗,如 床前明月光"}
          onChange={(e) => (tab === "poet" ? onChangePoet(e.target.value) : onChangeLine(e.target.value))}
          spellCheck={false}
        />
      )}

      {tab === "poet" && results.length > 0 && (
        <div className="search-results">
          {results.map((p) => {
            const dyn = DYNASTY_BY_KEY[p.dynasty];
            return (
              <button key={p.id} className="search-row" onClick={() => goPoet(p)}>
                <span className="sr-name">{p.name}</span>
                <span className="sr-meta">
                  {dyn?.label ?? p.dynasty} · {p.poemCount}首
                </span>
              </button>
            );
          })}
        </div>
      )}

      {tab === "line" && half && (
        <div className="line-results">
          {hits.length > 0 && (
            <div className="lr-section">
              <div className="lr-head">真实诗人 · 这是谁的诗</div>
              {hits.map((h, i) => {
                const dyn = h.poet ? DYNASTY_BY_KEY[h.poet.dynasty] : undefined;
                return (
                  <button key={i} className="search-row" onClick={() => goHit(h)} disabled={!h.poet}>
                    <span className="sr-name">
                      {h.poet?.name ?? "佚名"}
                      <span className="sr-title">《{h.title || "无题"}》</span>
                    </span>
                    <span className="sr-meta">
                      {dyn?.label ?? ""} · {FORM_LABEL[h.form] ?? "古体"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="lr-section">
            <div className="lr-head">
              纯随机 · 半编号
              <CopyButton text={half.index} />
            </div>
            <div className="half-note">
              若作为《{FORM_LABEL[half.form]}》开头,前 {half.locked} 字锁定了高位编号:
            </div>
            <div className="half-idx full">{half.index}</div>
            <div className="half-note dim">
              余 {half.freeChars} 字自由 → 这个开头下共有 字库<sup>{half.freeChars}</sup> 首诗,全在诗云的同一条高位街区里。
            </div>
          </div>
        </div>
      )}

      {tab === "index" && (
        <div className="line-results">
          <div className="lr-section">
            <div className="lr-head">选诗体</div>
            <div className="rev-forms">
              {REV_FORMS.map((f) => (
                <button
                  key={f}
                  className={revForm === f ? "seg-btn on" : "seg-btn"}
                  onClick={() => pickRevForm(f)}
                >
                  {FORM_LABEL[f]}
                </button>
              ))}
            </div>
          </div>
          <div className="lr-section">
            <div className="lr-head">粘贴编号 · 反查它是哪首诗</div>
            <textarea
              className="idx-input"
              value={idxInput}
              placeholder="粘贴一个全集编号（纯数字）…例如先在「诗句」里搜一句、复制其编号"
              onChange={(e) => onChangeIndex(e.target.value)}
              spellCheck={false}
              rows={3}
            />
            {rev &&
              (rev.inRange ? (
                <div className="rev-poem">
                  <div className="poem-body" lang="zh">
                    {rev.lines.map((l, i) => (
                      <div className="poem-line" key={i}>
                        {l}
                      </div>
                    ))}
                  </div>
                  <div className="half-note dim">
                    这是《{FORM_LABEL[rev.form]}》全集目录里正序第 {rev.digits} 位长的那一号 —— 同一个编号永远算出同一首诗。
                  </div>
                </div>
              ) : (
                <div className="half-note dim">
                  此编号超出《{FORM_LABEL[rev.form]}》目录范围（该目录约 {rev.cardinalityDigits} 位数那么多首）。换个诗体试试。
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
