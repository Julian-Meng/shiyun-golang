import { useStore } from "../state/store";
import { DYNASTY_BY_KEY } from "../data/dynasties";
import { textBabelIndex } from "../engine/engineApi";
import type { FormId } from "../engine/engine";

const FORM_LABEL: Record<string, string> = {
  wujue: "五绝",
  qijue: "七绝",
  wulu: "五律",
  qilu: "七律",
  other: "古体/其它",
};

export function PoetPanel() {
  const poet = useStore((s) => s.selectedPoet);
  const poems = useStore((s) => s.poetPoems);
  const close = useStore((s) => s.clearPoet);
  if (!poet) return null;
  const dyn = DYNASTY_BY_KEY[poet.dynasty];

  return (
    <div className="poet-panel">
      <button className="panel-close" onClick={close} aria-label="关闭">
        ×
      </button>
      <div className="poet-head">
        <span className="poet-name" style={{ color: dyn?.color }}>
          {poet.name}
        </span>
        <span className="poet-sub">
          {dyn?.label ?? poet.dynasty} · {poet.poemCount} 首真实作品
        </span>
      </div>
      {poems === null ? (
        <div className="loading-row">载入作品…</div>
      ) : (
        <div className="poem-list">
          {poems.slice(0, 60).map((pm, i) => {
            const idx =
              pm.f !== "other" ? textBabelIndex(pm.f as FormId, pm.p.join("")) : null;
            return (
              <div className="poem-item" key={i}>
                <div className="pi-title">
                  {pm.t || "（无题）"} <span className="pi-form">{FORM_LABEL[pm.f]}</span>
                </div>
                <div className="pi-body">
                  {pm.p.map((l, j) => (
                    <div key={j}>{l}</div>
                  ))}
                </div>
                {idx && (
                  <div className="pi-idx" title={`全集编号 · ${idx.digits} 位`}>
                    编号 {idx.index.slice(0, 32)}…
                  </div>
                )}
              </div>
            );
          })}
          {poems.length > 60 && (
            <div className="more">…共 {poems.length} 首,仅显示前 60</div>
          )}
        </div>
      )}
    </div>
  );
}
