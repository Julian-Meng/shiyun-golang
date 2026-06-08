import { useState } from "react";

// Copy long catalog numbers (80–229 digits) — typing them back is impractical, so every
// displayed 编号 gets a one-click copy for the 编号 reverse-search tab.
export function CopyButton({ text, label = "复制" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="copy-btn"
      title="复制完整编号"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
    >
      {done ? "已复制 ✓" : label}
    </button>
  );
}
