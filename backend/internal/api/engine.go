package api

import (
	"database/sql"
	"sort"
	"sync"

	"shiyun-backend/internal/engine"
)

// EngineData holds the pre-loaded lexicon and charset for Engine operations.
var EngineData = struct {
	sync.RWMutex
	Lx      engine.Lexicon
	Charset []string
	Ready   bool
}{}

// LoadEngine reads lexicon + charset from the database into the global EngineData.
func LoadEngine(db *sql.DB) error {
	EngineData.Lock()
	defer EngineData.Unlock()

	// Load charset
	chars, err := loadCharset(db)
	if err != nil {
		return err
	}
	EngineData.Charset = chars
	EngineData.Lx = loadLexicon(db, len(chars))
	EngineData.Ready = true

	// Compute charset hash for manifest
	charsStr := ""
	for _, c := range chars {
		charsStr += c
	}
	loadedCharsetHash = fnv1a(charsStr)

	// pullK: count distinct chars in corpus (matches pipeline freq.size). Read from manifest.json
	// which is the authoritative source written by build-data.mjs.
	loadedPullK = loadPullKFromManifest()
	if loadedPullK <= 0 {
		loadedPullK = 12464 // fallback (last known value)
	}
	return nil
}

func loadCharset(db *sql.DB) ([]string, error) {
	rows, err := db.Query(`SELECT char FROM charset ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var c string
		if err := rows.Scan(&c); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func loadLexicon(db *sql.DB, N int) engine.Lexicon {
	lx := engine.Lexicon{N: N}

	// tone data
	lx.ToneClass = make([]int8, N)
	lx.RhymeOf = make([]int16, N)
	for i := range lx.RhymeOf {
		lx.RhymeOf[i] = -1
	}
	lx.PingRank = make([]int32, N)
	lx.ZeRank = make([]int32, N)
	for i := range lx.PingRank {
		lx.PingRank[i] = -1
		lx.ZeRank[i] = -1
	}

	// Collect raw tone rows — we need to sort PingList/ZeList by rank, not by char_id.
	// char_id order happens to match rank order with the current dataset, but this is
	// NOT guaranteed by construction (charset reflow would break it silently).
	type toneRow struct {
		id, tone, rhyme, pr, zr int
	}
	var rows []toneRow
	qr, err := db.Query(`SELECT char_id, tone, rhyme, ping_rank, ze_rank FROM lexicon_tone ORDER BY char_id`)
	if err != nil {
		return lx
	}
	defer qr.Close()
	for qr.Next() {
		var r toneRow
		if err := qr.Scan(&r.id, &r.tone, &r.rhyme, &r.pr, &r.zr); err != nil {
			continue
		}
		rows = append(rows, r)
	}

	// Build tone/rhyme/rank mappings
	for _, r := range rows {
		if r.id < N {
			lx.ToneClass[r.id] = int8(r.tone)
			lx.RhymeOf[r.id] = int16(r.rhyme)
			if r.pr >= 0 {
				lx.PingRank[r.id] = int32(r.pr)
			}
			if r.zr >= 0 {
				lx.ZeRank[r.id] = int32(r.zr)
			}
		}
	}

	// Build PingList sorted by ping_rank (rank → charId mapping).
	pingEntries := make([]struct {
		id   uint32
		rank int32
	}, 0)
	for _, r := range rows {
		if r.pr >= 0 && r.id < N {
			pingEntries = append(pingEntries, struct {
				id   uint32
				rank int32
			}{uint32(r.id), int32(r.pr)})
		}
	}
	sort.Slice(pingEntries, func(i, j int) bool { return pingEntries[i].rank < pingEntries[j].rank })
	lx.PingList = make([]uint32, len(pingEntries))
	for i, e := range pingEntries {
		lx.PingList[i] = e.id
	}

	// Build ZeList sorted by ze_rank.
	zeEntries := make([]struct {
		id   uint32
		rank int32
	}, 0)
	for _, r := range rows {
		if r.zr >= 0 && r.id < N {
			zeEntries = append(zeEntries, struct {
				id   uint32
				rank int32
			}{uint32(r.id), int32(r.zr)})
		}
	}
	sort.Slice(zeEntries, func(i, j int) bool { return zeEntries[i].rank < zeEntries[j].rank })
	lx.ZeList = make([]uint32, len(zeEntries))
	for i, e := range zeEntries {
		lx.ZeList[i] = e.id
	}

	// rhyme members + ranks
	rows2, err := db.Query(`SELECT group_id, char_id FROM lexicon_rhyme_members ORDER BY group_id, rank`)
	if err != nil {
		return lx
	}
	defer rows2.Close()
	groupMap := map[int][]uint32{}
	maxGid := -1
	for rows2.Next() {
		var gid, cid int
		if err := rows2.Scan(&gid, &cid); err != nil {
			continue
		}
		groupMap[gid] = append(groupMap[gid], uint32(cid))
		if gid > maxGid {
			maxGid = gid
		}
	}
	lx.RhymeMembers = make([][]uint32, maxGid+1)
	lx.RhymeRank = make([][]int32, maxGid+1)
	for gid, members := range groupMap {
		lx.RhymeMembers[gid] = members
		ranks := make([]int32, N)
		for i := range ranks {
			ranks[i] = -1
		}
		for r, cid := range members {
			if int(cid) < N {
				ranks[cid] = int32(r)
			}
		}
		lx.RhymeRank[gid] = ranks
	}
	return lx
}
