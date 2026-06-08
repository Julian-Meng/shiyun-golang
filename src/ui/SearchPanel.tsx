import { useState } from "react";
import { searchPoets, loadPoetPoems, type PoetRow } from "../data/load";
import { DYNASTY_BY_KEY } from "../data/dynasties";
import { useStore } from "../state/store";
import { poetPosition } from "../three/PoetStars";

export function SearchPanel() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PoetRow[]>([]);
  const selectPoet = useStore((s) => s.selectPoet);
  const setFlyTarget = useStore((s) => s.setFlyTarget);

  function onChange(v: string) {
    setQ(v);
    setResults(searchPoets(v, 24));
  }
  function go(p: PoetRow) {
    selectPoet(p);
    setFlyTarget(poetPosition(p));
    loadPoetPoems(p.id).then((poems) => useStore.getState().setPoetPoems(p.id, poems));
    setResults([]);
    setQ(p.name);
  }

  return (
    <div className="search">
      <input
        value={q}
        placeholder="搜索诗人…"
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
      {results.length > 0 && (
        <div className="search-results">
          {results.map((p) => {
            const dyn = DYNASTY_BY_KEY[p.dynasty];
            return (
              <button key={p.id} className="search-row" onClick={() => go(p)}>
                <span className="sr-name">{p.name}</span>
                <span className="sr-meta">
                  {dyn?.label ?? p.dynasty} · {p.poemCount}首
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
