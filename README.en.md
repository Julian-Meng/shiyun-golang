# 诗云 · Poetry Cloud

<p align="center">
  English | <a href="README.md">中文</a>
</p>

> A roamable 3D star map: 32,657 real historical poets rendered as star clusters.  
> The void between them is the space of *all possible poems* — click to pull one out.  
> The number IS the poem, and vice versa.

Forked from [Cohenjikan/shiyun](https://github.com/Cohenjikan/shiyun).  
The original Three.js galaxy renderer is preserved; the backend is rewritten in Go + SQLite.

---

## Architecture

```
┌─ Frontend (Vite 8 + React 18 + TypeScript)
│   src/three/   Galaxy · Poet stars · Gift network · GPU picking
│   src/ui/      HUD · Search · Poem panels · Settings
│   src/engine/  Index engine (rank/unrank, pure BigInt math)
│   src/data/    Data loading (fetch → Go REST API)
└────────────────────────────────────────
┌─ Go Backend (net/http + modernc.org/sqlite)
│   cmd/server/   REST API server
│   cmd/import/   JSON → SQLite data import
│   internal/api/ Router · handlers · middleware
│   internal/db/  SQLite + FTS5 full-text search
│   internal/engine/ Index engine (Go port, equivalent to TS)
└────────────────────────────────────────
```

## Quick Start

**Requirements:** Node.js ≥ 18, Go ≥ 1.23

### 1. Install dependencies

```bash
npm install
cd backend && go mod tidy && cd ..
```

### 2. Clone the corpus

```bash
git clone https://github.com/Cohenjikan/shiyun-corpus.git corpus/shiyun-corpus
```

### 3. Build data shards

```bash
npm run build:lines       # poem shards + search index
npm run build:fuzzy       # fuzzy search index (optional)
```

### 4. Import data into SQLite

```bash
cd backend
go run ./cmd/import/
cd ..
```

### 5. Start development

```bash
# Terminal 1 — Go API server
cd backend && go run ./cmd/server/

# Terminal 2 — Vite dev server
npm run dev                # → http://localhost:5199
```

Vite proxies `/api` to `localhost:8080` automatically.

Or use the Taskfile (requires [go-task](https://taskfile.dev/)):
```bash
task setup      # install all dependencies
task import     # build + run data import
task dev        # start both services
```

## Project Structure

```
├── src/                     # Frontend source
│   ├── engine/              #   Index engine (rank/unrank/scatter)
│   ├── data/                #   Data contract & API loading
│   ├── three/               #   Three.js 3D scene
│   ├── ui/                  #   React UI components
│   └── state/               #   Zustand state management
├── public/                  # Static assets (favicon / og image)
├── pipeline/                # Data build scripts (Node.js)
├── backend/                 # Go backend
│   ├── cmd/
│   │   ├── server/          #   API server entry
│   │   └── import/          #   Data import tool
│   ├── internal/
│   │   ├── api/             #   HTTP handlers + middleware
│   │   ├── db/              #   Database layer (SQLite + FTS5)
│   │   └── engine/          #   Index engine (BigInt port)
│   └── data/                #   shiyun.db (git-ignored)
├── Taskfile.yml             # Unified task runner
├── .env.example             # Environment template
└── vite.config.ts           # Vite config (+ /api proxy)
```

## API Endpoints

All under `/api`, 13 endpoints:

| Method | Path | Description |
|:---|:---|:---|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/manifest` | Dataset metadata |
| `GET` | `/api/poets` | Poet list (`?q=LiBai&limit=20`) |
| `GET` | `/api/poets/:id` | Poet detail |
| `GET` | `/api/poets/:id/poems` | All poems by poet |
| `GET` | `/api/poems/search?q=moonlight` | FTS5 full-text search |
| `GET` | `/api/poems/babel/:index` | Index → poem lookup |
| `GET` | `/api/poems/pull?form=wujue&x=100&y=200&z=300` | Void pull |
| `GET` | `/api/gifts` | Gift network edges |
| `GET` | `/api/gifts/path?from=&to=` | BFS path between poets |
| `GET` | `/api/charset` | Character set |
| `GET` | `/api/lexicon` | Tone/rhyme tables |
| `GET` | `/api/feedback` | Feedback collection (optional) |

## Database

SQLite (WAL mode), includes full poem texts + FTS5 index.

| Table | Rows | Description |
|:---|:---|:---|
| `poets` | 32,657 | Poet metadata |
| `poems` | 853,383 | Full poem texts |
| `poems_fts` | 853,383 | FTS5 full-text index |
| `charset` | 12,877 | Character set (frequency-ordered) |
| `lexicon_*` | — | Tone & rhyme tables |
| `gift_edges` | 4,980 | Gift network directed edges |

## Deployment

### Docker

Multi-stage build → single image. The Go binary serves both API and frontend static files — no separate reverse proxy needed.

```bash
# 1. Build image
docker build -t shiyun .

# 2. Prepare database (requires Quick Start steps 2-4 first)
mkdir -p data
cp backend/data/shiyun.db data/

# 3. Run
docker run -d \
  --name shiyun \
  -p 8080:8080 \
  -v "$(pwd)/data:/app/data" \
  shiyun
```

Open `http://localhost:8080` in browser.

**Dockerfile stages:**

- **Stage 1** — Node.js frontend build (`npm ci` → `npm run build` → `dist/`)
- **Stage 2** — Go backend build (`CGO_ENABLED=0`, statically linked, stripped)
- **Stage 3** — Alpine runtime, binary + frontend assets only
- Database is volume-mounted, not baked into the image (`shiyun.db` ~679 MB)

## Commands

`Taskfile.yml` provides a unified entry point (requires [go-task](https://taskfile.dev/)):

| Command | Function |
|:---|:---|
| `task setup` | Install all dependencies |
| `task dev` | Start frontend + backend |
| `task build` | Build both |
| `task test` | Run all tests |
| `task lint` | Run linters |
| `task import` | Build + run data import |
| `task pipeline:lines` | Build poem shards + search index |
| `task clean` | Remove build artifacts |

## Tech Stack

| Layer | Technology |
|:---|:---|
| Frontend | Vite 8 + React 18 + TypeScript |
| 3D Rendering | Three.js 0.169 + @react-three/fiber |
| State | Zustand 5 |
| Backend | Go + net/http (zero 3rd-party HTTP deps) |
| Database | SQLite (modernc.org/sqlite, CGo-free) |
| Search | SQLite FTS5 |
| Index Engine | BigInt (TS `bigint` / Go `math/big`) |

## Core Concept

Poetry Cloud has two catalogs:

- **Real poems** — 970k+ works from the shiyun-corpus. Each poet is a star cluster; every line is searchable.
- **All possible poems** — generated on the fly via a reversible rank/unrank mathematical mapping (inspired by Borges' *Library of Babel* and Liu Cixin's *Poetry Cloud*). Given a number, you get an exact poem; given a poem, you get its number. **Not stored — computed.**

Both catalogs share one address space: every real poem has a unique coordinate in the void of all possible poems.

## Development Progress

| Phase | Status | Content |
|:---|:---|:---|
| 1 Infra | ✅ | Go project + SQLite schema + data import |
| 2 REST API | ✅ | 13 endpoints + FTS5 search + middleware |
| 3 Engine Port | ✅ | rank/unrank/scatter in Go, 21 tests |
| 4 Frontend | ✅ | API-adapted load.ts + Vite proxy |
| 5 Deploy | ✅ | Multi-stage Docker build |
| 6 Extras | ⬜ | User accounts / bookmarks / AI / i18n |

## Development

```bash
# Backend
cd backend
go test ./...                        # run tests
go test ./internal/engine/ -v        # engine tests (verbose)

# Frontend
npm test                             # vitest
npm run typecheck                    # tsc --noEmit
```

## License

MIT — see original project [Cohenjikan/shiyun](https://github.com/Cohenjikan/shiyun).

---

<p align="center">
  <sub>Created by <a href="https://github.com/Cohenjikan">Cohenjikan</a> &amp; <strong>JulianM</strong><br>
  Powered by <strong>DeepSeek</strong> and <strong>Claude Code</strong></sub>
</p>
