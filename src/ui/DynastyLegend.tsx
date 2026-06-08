import { DYNASTIES } from "../data/dynasties";
import { useStore } from "../state/store";

const MAJOR = DYNASTIES.filter((d) => d.major).map((d) => d.key);

export function DynastyLegend() {
  const hidden = useStore((s) => s.hidden);
  const toggle = useStore((s) => s.toggleDynasty);
  const showAll = useStore((s) => s.showAllDynasties);
  const showOnly = useStore((s) => s.showOnly);

  return (
    <div className="legend">
      <div className="legend-head">
        <span>朝代</span>
        <div className="legend-presets">
          <button onClick={showAll}>全部</button>
          <button onClick={() => showOnly(MAJOR)}>主要</button>
          <button onClick={() => showOnly(["tang", "wudai", "song"])}>唐宋</button>
        </div>
      </div>
      <div className="legend-list">
        {DYNASTIES.map((d) => {
          const off = hidden.has(d.key);
          return (
            <button
              key={d.key}
              className={off ? "legend-row off" : "legend-row"}
              onClick={() => toggle(d.key)}
              title={off ? "显示" : "隐藏"}
            >
              <span className="dot" style={{ background: d.color }} />
              <span className="legend-label">{d.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
