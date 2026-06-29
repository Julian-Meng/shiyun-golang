package api

import (
	"database/sql"
	"fmt"
	"net/http"

	"shiyun-backend/internal/db"
)

// NewRouter builds the HTTP mux with all API routes wired.
func NewRouter(conn *sql.DB) http.Handler {
	mux := http.NewServeMux()

	poets := &PoetHandler{DB: conn}
	poems := &PoemHandler{DB: conn}
	gifts := &GiftHandler{DB: conn}
	charset := &CharsetHandler{DB: conn}

	// Health
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, map[string]string{"status": "ok"})
	})

	// Manifest — includes buckets/dynCounts/poemSidecar for frontend compat
	mux.HandleFunc("GET /api/manifest", func(w http.ResponseWriter, r *http.Request) {
		var n int
		conn.QueryRow("SELECT COUNT(*) FROM charset").Scan(&n)
		pc, _ := db.PoetCount(conn)
		pmc, _ := db.PoemCount(conn)

		// Buckets from the original manifest (256 hex buckets, "00".."ff")
		buckets := make([]string, 256)
		for i := range buckets {
			buckets[i] = fmt.Sprintf("%02x", i)
		}
		// Build dynCounts from DB
		dynCounts := map[string]int{}
		rows, err := conn.Query(`SELECT dynasty, COUNT(*) FROM poets GROUP BY dynasty`)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var d string
				var c int
				rows.Scan(&d, &c)
				dynCounts[d] = c
			}
		}

		writeJSON(w, 200, ManifestDTO{
			Version:     1,
			N:           n,
			PullK:       loadedPullK,
			CharsetHash: loadedCharsetHash,
			PoetCount:   pc,
			PoemCount:   pmc,
			Buckets:     buckets,
			DynCounts:   dynCounts,
			PoemSidecar: true,
		})
	})

	// Poets
	mux.HandleFunc("GET /api/poets", poets.List)
	mux.HandleFunc("GET /api/poets/{id}", poets.Get)
	mux.HandleFunc("GET /api/poets/{id}/poems", poets.Poems)

	// Poems
	mux.HandleFunc("GET /api/poems/search", poems.Search)
	mux.HandleFunc("GET /api/poems/babel/{index}", poems.BabelIndex)
	mux.HandleFunc("GET /api/poems/pull", poems.Pull)

	// Gifts
	mux.HandleFunc("GET /api/gifts", gifts.List)
	mux.HandleFunc("GET /api/gifts/path", gifts.Path)

	// Charset & Lexicon
	mux.HandleFunc("GET /api/charset", charset.GetCharset)
	mux.HandleFunc("GET /api/lexicon", charset.GetLexicon)

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		writeError(w, 404, "not found")
	})

	var h http.Handler = mux
	h = RequestLog(h)
	h = CORS(h)
	return h
}
