package engine

import (
	"math"
	"math/big"
	"sync"
)

// ── App-facing engine API (mirrors engineApi.ts) ──

const (
	POEM_PULL_K = 3200 // default void-pull alphabet cutoff (Zipf over top-K common chars)
	ZIPF_S      = 1.15 // Zipf exponent
	ZIPF_OFFSET = 350  // Zipf offset (flattens head so top chars share weight)
	FREE_GEN_L  = 30   // max symbols a 自由 void-pull generates
)

// PulledPoem is the result of a void pull or index lookup.
type PulledPoem struct {
	Form        PullForm `json:"form"`
	Lines       []string `json:"lines"`
	BabelIndex  string   `json:"babelIndex"`
	BabelDigits int      `json:"babelDigits"`
	LushiIndex  *string  `json:"lushiIndex,omitempty"`
	Valid       bool     `json:"valid"`
	Pos         Vec3     `json:"pos"`
}

// BabelCardinality returns N^L for a form.
func BabelCardinality(form FormDef, N int) *big.Int {
	return BabelSize(form.L, big.NewInt(int64(N)))
}

// PointForBabelIndex returns the canonical scattered position of a known Babel index.
func PointForBabelIndex(form FormDef, b *big.Int, N int, R float64) Vec3 {
	card := BabelCardinality(form, N)
	sc := Scatter(card, cFeistelKey, b)
	return IndexToPoint(sc, R)
}

// IndexFromPoint deterministically samples a big index from a world point, reduced mod M.
func IndexFromPoint(pos Vec3, M *big.Int) *big.Int {
	q := func(v float64) int64 {
		return int64(math.Round(v * 16))
	}
	sx := big.NewInt(q(pos.X) * cSeedMul1)
	sy := big.NewInt(q(pos.Y) * cSeedMul2)
	sz := big.NewInt(q(pos.Z) * cSeedMul3)
	seed := new(big.Int).Xor(sx, sy)
	seed.Xor(seed, sz)
	seed.And(seed, cU64)

	bitLen := M.BitLen() + 16
	out := new(big.Int)
	ctr := int64(0)
	for need := bitLen; need > 0; need -= 64 {
		v := new(big.Int).Xor(
			new(big.Int).SetInt64(seed.Int64()),
			new(big.Int).Mul(big.NewInt(ctr), big.NewInt(cCtrMul)),
		)
		out.Lsh(out, 64)
		out.Or(out, splitmix64(v))
		ctr++
	}
	return new(big.Int).Mod(out, M)
}

// ── Zipf-weighted void pull ──

var zipfCDFMu sync.Mutex
var zipfCDF = map[int][]float64{}

func buildZipfCDF(K int) []float64 {
	zipfCDFMu.Lock()
	defer zipfCDFMu.Unlock()
	if c, ok := zipfCDF[K]; ok {
		return c
	}
	c := make([]float64, K)
	var sum float64
	for i := 0; i < K; i++ {
		sum += 1.0 / math.Pow(float64(i+ZIPF_OFFSET), ZIPF_S)
		c[i] = sum
	}
	for i := 0; i < K; i++ {
		c[i] /= sum
	}
	zipfCDF[K] = c
	return c
}

func pickZipf(cdf []float64, u float64) int {
	lo, hi := 0, len(cdf)-1
	for lo < hi {
		m := (lo + hi) >> 1
		if u <= cdf[m] {
			hi = m
		} else {
			lo = m + 1
		}
	}
	return lo
}

// ── mulberry32 PRNG (deterministic, matches TS prng in engineApi.ts) ──

type mulberry32 struct{ a uint32 }

func newMulberry32(seed uint32) *mulberry32 {
	return &mulberry32{a: seed}
}

func (m *mulberry32) next() float64 {
	t := m.a + 0x6d2b79f5
	m.a = t
	t2 := uint32(uint64(t^(t>>15)) * uint64(1|t) & 0xffffffff)
	t3 := uint32(uint64(t2^(t2>>7)) * uint64(61|t2) & 0xffffffff)
	v := t3 ^ (t3 >> 14)
	return float64(v) / 4294967296.0
}

// posSeed derives a uint32 seed from a 3D point, matching TS posSeed.
func posSeed(pos Vec3, salt uint32) uint32 {
	bigM := big.NewInt(0x7fffffff)
	idx := IndexFromPoint(pos, bigM)
	n := new(big.Int).Mod(idx, bigM)
	return uint32(n.Int64()) ^ salt
}

// weightedSyms generates L Zipf-weighted char ids in [0, K), seeded from pos.
func weightedSyms(pos Vec3, L int, K int) []int {
	rnd := newMulberry32(posSeed(pos, 0))
	cdf := buildZipfCDF(K)
	out := make([]int, L)
	for i := 0; i < L; i++ {
		out[i] = pickZipf(cdf, rnd.next())
	}
	return out
}

// weightedFreeSyms generates 词-like variable-length syms with break symbols.
func weightedFreeSyms(pos Vec3, L int, M int, N int) []int {
	rnd := newMulberry32(posSeed(pos, 0x9e3779b9))
	cdf := buildZipfCDF(M)
	out := make([]int, 0, L)
	for i := 0; i < L; i++ {
		if rnd.next() < 1.0/6.0 {
			out = append(out, N)
		} else {
			out = append(out, pickZipf(cdf, rnd.next()))
		}
	}
	return out
}

// ── describe helpers ──

func toLines(charset []string, form FormDef, chars []int) []string {
	out := make([]string, form.Lines)
	for l := 0; l < form.Lines; l++ {
		var line string
		for i := 0; i < form.Cpl; i++ {
			line += charset[chars[l*form.Cpl+i]]
		}
		out[l] = line
	}
	return out
}

func lineBreakSyms(N int, lineCharIds [][]int) []int {
	var syms []int
	for l, ids := range lineCharIds {
		if l > 0 {
			syms = append(syms, N)
		}
		syms = append(syms, ids...)
	}
	return syms
}

func fixedFormSyms(form FormDef, N int, chars []int) []int {
	lines := make([][]int, form.Lines)
	for l := 0; l < form.Lines; l++ {
		lines[l] = chars[l*form.Cpl : (l+1)*form.Cpl]
	}
	return lineBreakSyms(N, lines)
}

func describe(lx Lexicon, charset []string, form FormDef, chars []int, pos Vec3) PulledPoem {
	matched := MatchVariant(lx, form, chars)
	N := lx.N
	syms := fixedFormSyms(form, N, chars)
	b := AnyRank(N, syms)
	result := PulledPoem{
		Form:        form.ID,
		Lines:       toLines(charset, form, chars),
		BabelIndex:  b.String(),
		BabelDigits: len(b.String()),
		Valid:       matched != nil,
		Pos:         pos,
	}
	if matched != nil {
		if lushiIndex, err := RegulatedRank(lx, form, *matched); err == nil {
			s := lushiIndex.String()
			result.LushiIndex = &s
		}
	}
	return result
}

func describeAny(lx Lexicon, charset []string, syms []int, pos Vec3) PulledPoem {
	N := lx.N
	lines := make([]string, 0)
	var cur string
	for _, s := range syms {
		if s == N {
			lines = append(lines, cur)
			cur = ""
		} else {
			cur += charset[s]
		}
	}
	lines = append(lines, cur)
	if len(lines) == 0 {
		lines = []string{""}
	}
	// Infer form from line structure — matches upstream describeAny
	form := InferForm(lines)
	b := AnyRank(N, syms)
	return PulledPoem{
		Form:        form,
		Lines:       lines,
		BabelIndex:  b.String(),
		BabelDigits: len(b.String()),
		Valid:       false,
		Pos:         pos,
	}
}

// PullAt generates a poem at the given world point for the given form.
// pullK limits the alphabet to top-K chars (Zipf-weighted). If 0, defaults to POEM_PULL_K.
func PullAt(lx Lexicon, charset []string, formId PullForm, pos Vec3, lushiOnly bool, pullK int) PulledPoem {
	R := pos
	K := pullK
	if K <= 0 {
		K = POEM_PULL_K
	}
	if formId == "ziyou" {
		N := lx.N
		M := K
		if M > N {
			M = N
		}
		return describeAny(lx, charset, weightedFreeSyms(pos, FREE_GEN_L, M, N), R)
	}
	form := FORMS[formId]
	if lushiOnly {
		size := RegulatedSize(lx, form)
		if size.Sign() > 0 {
			s := IndexFromPoint(pos, size)
			if poem, err := RegulatedUnrank(lx, form, s); err == nil {
				return describe(lx, charset, form, poem.Chars, R)
			}
		}
	}
	return describe(lx, charset, form, weightedSyms(pos, form.L, K), R)
}

// PullByIndex decodes a decimal index string back into a poem.
func PullByIndex(lx Lexicon, charset []string, indexInput string) *PulledPoem {
	digits := stripNonDigits(indexInput)
	if digits == "" {
		return nil
	}
	b, ok := new(big.Int).SetString(digits, 10)
	if !ok {
		return nil
	}
	N := lx.N
	syms := AnyUnrank(N, b)
	R := Vec3{}
	result := describeAny(lx, charset, syms, R)
	return &result
}

// InferForm guesses the 诗体 from line structure.
func InferForm(lines []string) PullForm {
	if len(lines) == 0 {
		return "ziyou"
	}
	lens := make([]int, len(lines))
	for i, l := range lines {
		lens[i] = len([]rune(l))
	}
	uniform := true
	for _, x := range lens {
		if x != lens[0] {
			uniform = false
			break
		}
	}
	if uniform {
		if len(lines) == 4 && lens[0] == 5 {
			return "wujue"
		}
		if len(lines) == 4 && lens[0] == 7 {
			return "qijue"
		}
		if len(lines) == 8 && lens[0] == 5 {
			return "wulu"
		}
		if len(lines) == 8 && lens[0] == 7 {
			return "qilu"
		}
	}
	return "ziyou"
}

func stripNonDigits(s string) string {
	out := make([]byte, 0, len(s))
	for i := 0; i < len(s); i++ {
		if s[i] >= '0' && s[i] <= '9' {
			out = append(out, s[i])
		}
	}
	return string(out)
}
