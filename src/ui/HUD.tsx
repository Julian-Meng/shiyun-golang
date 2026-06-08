import { useStore } from "../state/store";
import { getManifest, hasRealGelu } from "../data/load";
import type { FormId } from "../engine/engine";

const FORMS: { id: FormId; label: string }[] = [
  { id: "wujue", label: "五绝" },
  { id: "qijue", label: "七绝" },
  { id: "wulu", label: "五律" },
  { id: "qilu", label: "七律" },
];

export function HUD() {
  const form = useStore((s) => s.form);
  const setForm = useStore((s) => s.setForm);
  const commonOnly = useStore((s) => s.commonOnly);
  const toggleCommon = useStore((s) => s.toggleCommon);
  const lushi = useStore((s) => s.lushiFilter);
  const toggleLushi = useStore((s) => s.toggleLushi);
  const speed = useStore((s) => s.speed);
  const loaded = useStore((s) => s.loaded);
  const m = getManifest();

  return (
    <>
      <div className="hud-top">
        <div className="title">
          诗云 <span className="title-en">Poetry Cloud</span>
        </div>
        <div className="seg" title="点击虚空时生成的诗体">
          {FORMS.map((f) => (
            <button
              key={f.id}
              className={f.id === form ? "seg-btn on" : "seg-btn"}
              onClick={() => setForm(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          className={commonOnly ? "filter on" : "filter"}
          onClick={toggleCommon}
          title="只用最常见的字生成,避开生僻乱码"
        >
          常用字
        </button>
        {hasRealGelu() && (
          <button
            className={lushi ? "filter on" : "filter"}
            onClick={toggleLushi}
            title="只生成合平仄、押韵的诗（平水韵）"
          >
            格律
          </button>
        )}
        {loaded && m && (
          <div className="stat">
            {m.poetCount.toLocaleString()} 诗人 · {m.poemCount.toLocaleString()} 首
          </div>
        )}
      </div>

      <div className="hud-bottom">
        <span className="hint">
          WASD 飞行 · 拖拽转向 · 滚轮调速 · <b>点诗星</b>看其真作 · <b>点虚空</b>从噪声里捞诗
        </span>
        <span className="speed">速度 ×{speed.toFixed(2)} · {(140 * speed).toFixed(0)} 单位/秒</span>
      </div>
    </>
  );
}
