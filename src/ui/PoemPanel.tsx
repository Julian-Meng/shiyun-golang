import { useStore } from "../state/store";

const FORM_LABEL: Record<string, string> = {
  wujue: "五言绝句",
  qijue: "七言绝句",
  wulu: "五言律诗",
  qilu: "七言律诗",
};

export function PoemPanel() {
  const selected = useStore((s) => s.selected);
  const close = useStore((s) => s.clearSelection);
  if (!selected) return null;

  return (
    <div className="poem-panel">
      <button className="panel-close" onClick={close} aria-label="关闭">
        ×
      </button>
      <div className="poem-body" lang="zh">
        {selected.lines.map((line, i) => (
          <div className="poem-line" key={i}>
            {line}
          </div>
        ))}
      </div>

      <div className="poem-meta">
        <div className="meta-row">
          <span className="meta-k">诗体</span>
          <span className="meta-v">{FORM_LABEL[selected.form]}</span>
        </div>
        <div className="meta-row">
          <span className="meta-k">全集编号</span>
          <span className="meta-v idx" title={`${selected.babelDigits} 位十进制`}>
            {selected.babelIndex}
          </span>
        </div>
        <div className="meta-row">
          <span className="meta-k">格律编号</span>
          {selected.valid ? (
            <span className="meta-v idx lushi">
              <span className="seal">律</span>
              {selected.lushiIndex}
            </span>
          ) : (
            <span className="meta-v muted">非格律 · 纯随机目录</span>
          )}
        </div>
      </div>

      <div className="poem-foot">
        这首诗一直在诗云里，编号 {selected.babelDigits} 位长 —— 地址几乎和诗本身一样长。
      </div>
    </div>
  );
}
