package api

// DTO types that match the frontend's data contract exactly.
// All json tags follow the TS-side naming (contract.ts / load.ts).

// PoemDTO matches frontend PoemRecord = {t, f, p}.
type PoemDTO struct {
	T string   `json:"t"`
	F string   `json:"f"`
	P []string `json:"p"`
}

// GiftTuple matches frontend GiftEdge = [from, to, weight].
type GiftTuple struct {
	From   string `json:"from"`
	To     string `json:"to"`
	Weight int    `json:"weight"`
}

// ManifestDTO matches frontend DataManifest.
type ManifestDTO struct {
	Version     int            `json:"version"`
	N           int            `json:"n"`
	PullK       int            `json:"pullK"`
	CharsetHash string         `json:"charsetHash"`
	PoetCount   int            `json:"poetCount"`
	PoemCount   int            `json:"poemCount"`
	Buckets     []string       `json:"buckets"`
	DynCounts   map[string]int `json:"dynCounts"`
	PoemSidecar bool           `json:"poemSidecar"`
}

// SearchHitDTO matches frontend LineHit with poet attached.
type SearchHitDTO struct {
	PoetID      string   `json:"poetId"`
	PoemIdx     int      `json:"poemIdx"`
	Title       string   `json:"title"`
	Form        string   `json:"form"`
	FirstLine   string   `json:"firstLine"`
	Poet        *PoetDTO `json:"poet,omitempty"`
	LineMatches *int     `json:"lineMatches,omitempty"`
}

// PoetDTO matches frontend PoetRow.
type PoetDTO struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Dynasty     string  `json:"dynasty"`
	PoemCount   int     `json:"poemCount"`
	ClusterSize float64 `json:"clusterSize"`
}
