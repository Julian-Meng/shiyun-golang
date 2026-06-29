package api

import (
	"database/sql"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"unicode"

	"shiyun-backend/internal/db"
	"shiyun-backend/internal/engine"
)

// PoemHandler groups poem endpoints under /api/poems.
type PoemHandler struct {
	DB *sql.DB
}

// LineHit matches the frontend's LineHit shape for search results.
type LineHit struct {
	PoetID      string   `json:"poetId"`
	PoemIdx     int      `json:"poemIdx"`
	Title       string   `json:"title"`
	Form        string   `json:"form"`
	FirstLine   string   `json:"firstLine"`
	Poet        *db.Poet `json:"poet,omitempty"`
	LineCount   int      `json:"lineCount,omitempty"`
	LineMatches *int     `json:"lineMatches,omitempty"`
}

// Search performs FTS5 full-text search on poem content.
// Supports multi-line queries (separated by punctuation/whitespace)
// with re-ranking by number of distinct matched lines.
func (h *PoemHandler) Search(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" || !containsHan(q) {
		writeJSON(w, 200, map[string]any{"hits": []LineHit{}})
		return
	}
	limit := 30
	if s := r.URL.Query().Get("limit"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 && n <= 100 {
			limit = n
		}
	}

	// Split query into Han lines (on punctuation/whitespace)
	segs := splitHanLines(q)
	if len(segs) >= 2 {
		hits := h.multiLineSearch(segs, limit)
		if len(hits) > 0 {
			writeJSON(w, 200, map[string]any{"hits": hits})
			return
		}
		// fall through to single-line + fuzzy
	}

	// Single-line FTS5 search
	poems, err := db.SearchPoems(h.DB, q, limit*3) // overfetch for dedup/per-poet cap
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}

	hits := h.buildHits(poems, q, limit)
	writeJSON(w, 200, map[string]any{"hits": hits})
}

// BabelIndex looks up a poem by its universal catalog index.
func (h *PoemHandler) BabelIndex(w http.ResponseWriter, r *http.Request) {
	index := r.PathValue("index")
	if !engineDataReady() {
		writeError(w, 503, "engine data not loaded")
		return
	}
	p := engine.PullByIndex(engineDataRef.Lx, engineDataRef.Charset, index)
	if p == nil {
		writeError(w, 400, "invalid index")
		return
	}
	p.Form = engine.InferForm(p.Lines)
	writeJSON(w, 200, p)
}

// Pull generates a poem at given coordinates (void pull).
func (h *PoemHandler) Pull(w http.ResponseWriter, r *http.Request) {
	if !engineDataReady() {
		writeError(w, 503, "engine data not loaded")
		return
	}
	form := r.URL.Query().Get("form")
	if form == "" {
		form = "wujue"
	}
	var x, y, z float64
	if s := r.URL.Query().Get("x"); s != "" {
		x, _ = strconv.ParseFloat(s, 64)
	}
	if s := r.URL.Query().Get("y"); s != "" {
		y, _ = strconv.ParseFloat(s, 64)
	}
	if s := r.URL.Query().Get("z"); s != "" {
		z, _ = strconv.ParseFloat(s, 64)
	}
	pos := engine.Vec3{X: x, Y: y, Z: z}
	p := engine.PullAt(engineDataRef.Lx, engineDataRef.Charset, form, pos, false, loadedPullK)
	writeJSON(w, 200, p)
}

func engineDataReady() bool {
	EngineData.RLock()
	defer EngineData.RUnlock()
	return EngineData.Ready
}

var engineDataRef = &EngineData

// ── helpers ──

func containsHan(s string) bool {
	for _, r := range s {
		if unicode.Is(unicode.Han, r) {
			return true
		}
	}
	return false
}

func splitHanLines(query string) []string {
	var out []string
	var cur []rune
	for _, r := range query {
		if unicode.Is(unicode.Han, r) {
			cur = append(cur, r)
		} else if len(cur) > 0 {
			out = append(out, string(cur))
			cur = nil
		}
	}
	if len(cur) > 0 {
		out = append(out, string(cur))
	}
	return out
}

func (h *PoemHandler) buildHits(poems []db.Poem, query string, limit int) []LineHit {
	seen := map[string]bool{}
	perPoet := map[string]int{}
	var hits []LineHit

	for _, p := range poems {
		key := p.PoetID + "#" + strconv.Itoa(p.ID)
		if seen[key] {
			continue
		}
		seen[key] = true
		if perPoet[p.PoetID] >= 2 {
			continue
		}
		perPoet[p.PoetID]++

		// firstLine = the matched query (not the poem's actual first line).
		// The frontend LineHit.firstLine is the line that triggered the search hit,
		// used for display in search results.
		poet, _ := db.GetPoet(h.DB, p.PoetID)
		hits = append(hits, LineHit{
			PoetID:    p.PoetID,
			PoemIdx:   p.PoemIndex,
			Title:     p.Title,
			Form:      p.Form,
			FirstLine: query,
			Poet:      poet,
		})
		if len(hits) >= limit {
			break
		}
	}
	return hits
}

func (h *PoemHandler) multiLineSearch(segs []string, limit int) []LineHit {
	// For each line segment, search independently and merge results.
	// Rank by number of distinct matched lines per poem.
	type match struct {
		hit     LineHit
		matches map[string]bool
	}
	byPoem := map[string]*match{} // key = poetId#poemId

	for _, seg := range segs {
		poems, err := db.SearchPoems(h.DB, seg, 100)
		if err != nil {
			continue
		}
		for _, p := range poems {
			key := p.PoetID + "#" + strconv.Itoa(p.ID)
			if m, ok := byPoem[key]; ok {
				m.matches[seg] = true
			} else {
				poet, _ := db.GetPoet(h.DB, p.PoetID)
				byPoem[key] = &match{
					hit: LineHit{
						PoetID:    p.PoetID,
						PoemIdx:   p.PoemIndex,
						Title:     p.Title,
						Form:      p.Form,
						FirstLine: seg,
						Poet:      poet,
					},
					matches: map[string]bool{seg: true},
				}
			}
		}
	}

	// Sort by match count desc, then by poet poem_count desc
	var hits []LineHit
	for _, m := range byPoem {
		n := len(m.matches)
		m.hit.LineMatches = &n
		hits = append(hits, m.hit)
	}
	sortHits(hits)
	if len(hits) > limit {
		hits = hits[:limit]
	}
	return hits
}

func sortHits(hits []LineHit) {
	sort.Slice(hits, func(i, j int) bool {
		ai, aj := 0, 0
		if hits[i].LineMatches != nil {
			ai = *hits[i].LineMatches
		}
		if hits[j].LineMatches != nil {
			aj = *hits[j].LineMatches
		}
		if ai != aj {
			return ai > aj // more matches first
		}
		pi, pj := 0, 0
		if hits[i].Poet != nil {
			pi = hits[i].Poet.PoemCount
		}
		if hits[j].Poet != nil {
			pj = hits[j].Poet.PoemCount
		}
		return pi > pj // more prolific poet first
	})
}
