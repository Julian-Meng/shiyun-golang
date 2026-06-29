package api

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"

	"shiyun-backend/internal/db"
)

// CharsetHandler serves charset and lexicon data.
type CharsetHandler struct {
	DB *sql.DB
}

// loadedCharsetHash is set once LoadEngine is called, used by manifest endpoint.
var loadedCharsetHash string

// loadedPullK is the number of distinct chars that appear in the corpus (pipeline freq.size).
var loadedPullK int

// loadPullKFromManifest reads pullK from the generated manifest.json.
func loadPullKFromManifest() int {
	// Try a few common paths for manifest.json
	candidates := []string{
		filepath.Join("..", "public", "data", "manifest.json"),
		filepath.Join("public", "data", "manifest.json"),
		filepath.Join("..", "..", "public", "data", "manifest.json"),
	}
	for _, p := range candidates {
		data, err := os.ReadFile(p)
		if err != nil {
			continue
		}
		var m struct {
			PullK int `json:"pullK"`
		}
		if err := json.Unmarshal(data, &m); err != nil {
			continue
		}
		if m.PullK > 0 {
			return m.PullK
		}
	}
	return 0
}

// GetCharset returns the full ordered 字库 with computed hash.
func (h *CharsetHandler) GetCharset(w http.ResponseWriter, r *http.Request) {
	chars, err := db.GetCharset(h.DB)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	runes := []rune(chars)
	hsh := fnv1a(chars)
	writeJSON(w, 200, map[string]any{
		"version": 1,
		"n":       len(runes),
		"hash":    hsh,
		"chars":   chars,
	})
}

// fnv1a computes FNV-1a 32-bit hex over each code point (rune).
// Byte-identical to TS charsetHash.ts: `h ^= charCodeAt(i); h = Math.imul(h, 0x01000193)`.
// Format matches JS `(h>>>0).toString(16)` — no zero-padding.
func fnv1a(s string) string {
	var h uint32 = 0x811c9dc5
	for _, r := range s {
		h ^= uint32(r)
		h *= 0x01000193
	}
	return fmt.Sprintf("%x", h)
}

// GetLexicon returns the full lexicon (tone + rhyme data).
func (h *CharsetHandler) GetLexicon(w http.ResponseWriter, r *http.Request) {
	// Read N from meta
	var n int
	if err := h.DB.QueryRow(`SELECT CAST(val AS INTEGER) FROM lexicon_meta WHERE key='n'`).Scan(&n); err != nil {
		n = 12877
	}

	// tone data
	toneClass := make([]int, n)
	rhymeOf := make([]int, n)
	for i := range rhymeOf {
		rhymeOf[i] = -1
	}
	pingList := []int{}
	zeList := []int{}

	rows, err := h.DB.Query(`SELECT char_id, tone, rhyme, ping_rank, ze_rank FROM lexicon_tone ORDER BY char_id`)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	defer rows.Close()
	for rows.Next() {
		var id, tone, rhyme, pr, zr int
		if err := rows.Scan(&id, &tone, &rhyme, &pr, &zr); err != nil {
			writeError(w, 500, err.Error())
			return
		}
		if id < n {
			toneClass[id] = tone
			rhymeOf[id] = rhyme
			if pr >= 0 {
				pingList = append(pingList, id)
			}
			if zr >= 0 {
				zeList = append(zeList, id)
			}
		}
	}

	// rhyme groups — collect via map to handle non-contiguous group IDs
	type rhymeGroup struct {
		id      int
		members []int
	}
	rows2, err := h.DB.Query(`SELECT group_id, char_id FROM lexicon_rhyme_members ORDER BY group_id, rank`)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	defer rows2.Close()
	groupMap := map[int]*rhymeGroup{}
	maxGid := -1
	for rows2.Next() {
		var gid, cid int
		if err := rows2.Scan(&gid, &cid); err != nil {
			writeError(w, 500, err.Error())
			return
		}
		if g, ok := groupMap[gid]; ok {
			g.members = append(g.members, cid)
		} else {
			groupMap[gid] = &rhymeGroup{id: gid, members: []int{cid}}
		}
		if gid > maxGid {
			maxGid = gid
		}
	}
	// Build rhymeMembers as a dense slice (index = group_id), filling gaps with nil.
	rhymeMembers := make([][]int, maxGid+1)
	for gid, g := range groupMap {
		rhymeMembers[gid] = g.members
	}

	// Build rhymeRank: for each group, the 0-based rank of each char in that group.
	// Shape: rhymeRank[group_id][char_id] = rank (or -1 if not in group).
	rhymeRank := make([][]int, len(rhymeMembers))
	for gid, members := range rhymeMembers {
		if members == nil {
			continue
		}
		ranks := make([]int, n)
		for i := range ranks {
			ranks[i] = -1
		}
		for r, cid := range members {
			if cid < n {
				ranks[cid] = r
			}
		}
		rhymeRank[gid] = ranks
	}

	writeJSON(w, 200, map[string]any{
		"version":      1,
		"n":            n,
		"pingList":     pingList,
		"zeList":       zeList,
		"toneClass":    toneClass,
		"rhymeOf":      rhymeOf,
		"rhymeMembers": rhymeMembers,
		"rhymeRank":    rhymeRank,
	})
}
