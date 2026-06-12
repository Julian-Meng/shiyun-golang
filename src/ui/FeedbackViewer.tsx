import { useStore } from "../state/store";
import { getFeedback, clearFeedback, feedbackHanTotal, hasCloudInbox } from "../state/feedback";

// Owner-only feedback inbox — opened by the hidden gesture (5 taps on the 诗云 logo within 10 s, see HUD).
// Lists every locally-stored feedback message with its timestamp. (localStorage = this device only; see the
// note in state/feedback.ts for cross-device collection at deploy time.)
function fmt(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function FeedbackViewer() {
  const open = useStore((s) => s.feedbackOpen);
  const close = useStore((s) => s.setFeedbackOpen);
  if (!open) return null;
  const list = getFeedback().slice().reverse(); // newest first
  const total = feedbackHanTotal();

  return (
    <div className="fbv-overlay" onClick={() => close(false)}>
      <div className="fbv-card" onClick={(e) => e.stopPropagation()}>
        <div className="fbv-head">
          <span>反馈收件箱 · {list.length} 条 · {total}/5000 字</span>
          <button className="set-close" onClick={() => close(false)} title="关闭">×</button>
        </div>
        {list.length === 0 ? (
          <div className="fbv-empty">
            {hasCloudInbox
              ? "本机还没有反馈。（此处仅显示本设备提交的反馈；所有访客的反馈已同步收集到服务器收件箱）"
              : "还没有反馈。（仅本机可见 —— 跨设备收集需在部署时接入表单服务）"}
          </div>
        ) : (
          <div className="fbv-list">
            {list.map((f, i) => (
              <div key={i} className="fbv-item">
                <div className="fbv-time">{fmt(f.ts)}</div>
                <div className="fbv-text">{f.t}</div>
              </div>
            ))}
          </div>
        )}
        {list.length > 0 && (
          <button
            className="fbv-clear"
            onClick={() => {
              if (confirm("清空全部本机反馈？此操作不可撤销。")) {
                clearFeedback();
                close(false);
              }
            }}
          >
            清空全部
          </button>
        )}
      </div>
    </div>
  );
}
