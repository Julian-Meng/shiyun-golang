# 诗云 · Poetry Cloud

<p align="center">
  <a href="README.en.md">English</a> | 中文
</p>

> 一张可漫游的三维星图：32,657 位真实诗人化为星团，虚空是一切可能的诗——点击拾取，编号即诗、诗即编号。

Forked from [Cohenjikan/shiyun](https://github.com/Cohenjikan/shiyun).  
前端保留原项目 Three.js 星系渲染引擎，后端以 Go + SQLite 重写。

---

## 架构

```
┌─ 前端 (Vite 8 + React 18 + TypeScript)
│   src/three/   3D 星系 · 诗人星团 · 赠诗网络 · GPU 拾取
│   src/ui/      HUD · 搜索 · 诗面板 · 设置
│   src/engine/  编号引擎 (rank/unrank, 纯 BigInt 数学)
│   src/data/    数据加载 (fetch → Go REST API)
└────────────────────────────────────────
┌─ Go 后端 (net/http + modernc.org/sqlite)
│   cmd/server/   REST API 服务
│   cmd/import/   JSON → SQLite 数据导入
│   internal/api/ 路由 · handler · 中间件
│   internal/db/  SQLite + FTS5 全文搜索
│   internal/engine/ 编号引擎 (Go 移植, 与 TS 版等价)
└────────────────────────────────────────
```

## 快速开始

**环境要求:** Node.js ≥ 18, Go ≥ 1.23

### 1. 安装依赖

```bash
npm install
cd backend && go mod tidy && cd ..
```

### 2. 准备语料库

```bash
git clone https://github.com/Cohenjikan/shiyun-corpus.git corpus/shiyun-corpus
```

### 3. 构建数据分片

```bash
npm run build:lines       # poems shard + 搜索索引
npm run build:fuzzy       # 模糊搜索索引 (可选)
```

### 4. 导入数据到 SQLite

```bash
cd backend
go run ./cmd/import/
cd ..
```

### 5. 启动开发环境

```bash
# 终端 1 — Go API server
cd backend && go run ./cmd/server/

# 终端 2 — Vite dev server
npm run dev                # → http://localhost:5199
```

Vite 自动将 `/api` 代理到 `localhost:8080`，前端即可调用后端接口。

或使用 Taskfile (需安装 [go-task](https://taskfile.dev/))：
```bash
task setup      # 安装所有依赖
task import     # 构建导入工具 + 执行导入
task dev        # 并发启动前后端
```

## 项目结构

```
├── src/                     # 前端源码
│   ├── engine/              #   编号引擎 (rank/unrank/scatter)
│   ├── data/                #   数据契约 & API 加载层
│   ├── three/               #   Three.js 3D 场景
│   ├── ui/                  #   React UI 组件
│   └── state/               #   Zustand 状态管理
├── public/                  # 静态资源 (favicon / og image)
├── pipeline/                # 数据构建脚本 (Node.js)
├── backend/                 # Go 后端
│   ├── cmd/
│   │   ├── server/          #   API 服务入口
│   │   └── import/          #   数据导入工具
│   ├── internal/
│   │   ├── api/             #   HTTP handlers + 中间件
│   │   ├── db/              #   数据库层 (SQLite + FTS5)
│   │   └── engine/          #   编号引擎 (BigInt 移植)
│   └── data/                #   shiyun.db (git-ignored)
├── Taskfile.yml             # 统一命令入口
├── .env.example             # 环境变量模板
└── vite.config.ts           # Vite 配置 (含 /api 代理)
```

## API 端点

所有端点前缀 `/api`，完整 13 个端点：

| Method | Path | 说明 |
|:---|:---|:---|
| `GET` | `/api/health` | 健康检查 |
| `GET` | `/api/manifest` | 数据集元信息 |
| `GET` | `/api/poets` | 诗人列表 (`?q=李白&limit=20`) |
| `GET` | `/api/poets/:id` | 诗人详情 |
| `GET` | `/api/poets/:id/poems` | 诗人全部诗作 |
| `GET` | `/api/poems/search?q=床前明月光` | FTS5 全文搜索 (含整联重排) |
| `GET` | `/api/poems/babel/:index` | 编号反查 |
| `GET` | `/api/poems/pull?form=wujue&x=100&y=200&z=300` | Void pull 生成诗 |
| `GET` | `/api/gifts` | 赠诗网络边 |
| `GET` | `/api/gifts/path?from=&to=` | BFS 诗人路径 |
| `GET` | `/api/charset` | 字库 |
| `GET` | `/api/lexicon` | 平水韵声调/韵部表 |
| `GET` | `/api/feedback` | 反馈收集 (可选) |

## 数据库

SQLite (WAL 模式), 含全量诗作文本 + FTS5 全文索引。

| 表 | 行数 | 说明 |
|:---|:---|:---|
| `poets` | 32,657 | 诗人元信息 |
| `poems` | 853,383 | 诗作全文 |
| `poems_fts` | 853,383 | FTS5 全文索引 |
| `charset` | 12,877 | 字库 (频率排序) |
| `lexicon_*` | — | 平水韵声调/韵部 |
| `gift_edges` | 4,980 | 赠诗网络有向边 |

## 部署

### Docker

多阶段构建，单镜像即可运行。Go 后端在容器内同时 serve API 和前端静态文件，无需额外反向代理。

```bash
# 1. 构建镜像
docker build -t shiyun .

# 2. 准备数据库（需先完成快速开始中的 Step 2-4）
mkdir -p data
cp backend/data/shiyun.db data/

# 3. 运行
docker run -d \
  --name shiyun \
  -p 8080:8080 \
  -v "$(pwd)/data:/app/data" \
  shiyun
```

浏览器访问 `http://localhost:8080`。

**Dockerfile 说明：**

- **Stage 1** — Node.js 构建前端 (`npm ci` → `npm run build` → `dist/`)
- **Stage 2** — Go 构建后端 (`CGO_ENABLED=0`，静态链接，strip symbols)
- **Stage 3** — Alpine 运行时，仅含二进制 + 前端静态文件
- 数据库通过 volume 挂载，不打包进镜像（`shiyun.db` ~679MB）

## 命令参考

`Taskfile.yml` 提供统一入口 (需安装 [go-task](https://taskfile.dev/))：

| 命令 | 功能 |
|:---|:---|
| `task setup` | 安装所有依赖 |
| `task dev` | 并发启动前后端 |
| `task build` | 构建前后端 |
| `task test` | 运行全部测试 |
| `task lint` | 代码检查 |
| `task import` | 构建并执行数据导入 |
| `task pipeline:lines` | 构建 poems shard + 搜索索引 |
| `task clean` | 清理构建产物 |

## 技术栈

| 层 | 技术 |
|:---|:---|
| 前端框架 | Vite 8 + React 18 + TypeScript |
| 3D 渲染 | Three.js 0.169 + @react-three/fiber |
| 状态管理 | Zustand 5 |
| 后端 | Go + net/http (零第三方 HTTP 依赖) |
| 数据库 | SQLite (modernc.org/sqlite, 纯 Go) |
| 搜索 | SQLite FTS5 |
| 编号引擎 | BigInt (TS `bigint` / Go `math/big`) |

## 核心概念

诗云有两个目录：

- **真实诗** — 从开放语料 (shiyun-corpus) 导入的 97 万首诗人作品。每位诗人化为一个星团，诗句可全文搜索。
- **所有可能的诗** — 通过可逆的 rank/unrank 数学映射（灵感来自博尔赫斯《巴别图书馆》和刘慈欣《诗云》）凭空计算生成——给定一个超长编号即可精确生成一首诗，反之亦然。**不存储、仅计算**。

两种诗的编号来自同一套 anyRank 全目录，因此 32,657 位真实诗人的每一首作品在"所有可能诗"的虚空中都有一个唯一的编号坐标。

## 开发进度

| Phase | 状态 | 内容 |
|:---|:---|:---|
| 1 基础设施 | ✅ | Go 项目骨架 + SQLite Schema + 数据导入 |
| 2 REST API | ✅ | 13 端点 + FTS5 搜索 + CORS/日志中间件 |
| 3 Engine 移植 | ✅ | rank/unrank/scatter/格律 全部 Go 化, 21 tests |
| 4 前端适配 | ✅ | load.ts API 化 + Vite proxy + 数据形状对齐 |
| 5 部署集成 | ✅ | Docker 多阶段构建 |
| 6 功能增强 | ⬜ | 用户系统 / 收藏 / AI 作诗 / i18n |

## 开发

```bash
# 后端
cd backend
go test ./...                        # 运行测试
go test ./internal/engine/ -v        # Engine 测试详情

# 前端
npm test                             # vitest
npm run typecheck                    # tsc --noEmit
```

## License

MIT — 详见原项目 [Cohenjikan/shiyun](https://github.com/Cohenjikan/shiyun).

---

<p align="center">
  <sub>Created by <a href="https://github.com/Cohenjikan">Cohenjikan</a> &amp; <strong>JulianM</strong><br>
  Powered by <strong>DeepSeek</strong> and <strong>Claude Code</strong></sub>
</p>
