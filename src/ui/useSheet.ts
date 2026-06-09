import { useEffect, useState } from "react";
import { COARSE } from "../three/detectQuality";

// Mobile (coarse-pointer) sheets default to COLLAPSED — stashed as a slim bottom peek bar (just a hint +
// the key one-liner) so a selection never covers the galaxy; the user taps to expand the full panel. On
// desktop (fine pointer) `collapsed` is always false → the panel renders normally. `resetKey` re-collapses
// the sheet whenever the selection changes (a NEW star/poem starts collapsed again, mobile only).
export function useSheet(resetKey?: string | number | null) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (COARSE) setExpanded(false);
  }, [resetKey]);
  return {
    mobile: COARSE,
    collapsed: COARSE && !expanded,
    expand: () => setExpanded(true),
    collapse: () => setExpanded(false),
  };
}
