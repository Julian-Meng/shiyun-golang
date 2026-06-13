# 诗云部署 Runbook（最终版）— 整联搜索修复发布

> **适用版本 / 日期 / 对应 commit**
> - **对应 commit**：`1347cc8`（`fix(search): 整联搜索命中正确的诗（多句重排 + 整行索引名家优先封顶）`）—— 已验证为 `main` 的 HEAD。
> - **改动文件（仅 3 个）**：`pipeline/build-lines.mjs`、`src/data/load.ts`、`src/data/load.test.ts`（已用 `git show --stat 1347cc8` 核对）。
> - **数据版本**：v2 数据集（poems 279MB · lines 904MB · search 137MB · 32,657 诗人 / 933,857 首）；本次仅 **lines/ 索引内容**重建（文件名不变）。
> - **runbook 日期**：2026-06-13。
> - **目标站点**：`https://shiyun.cohenjikan.com`，nginx 配置 `deploy/nginx.cohenjikan.conf`，站点根 `/var/www/shiyun/dist`。该主机**仅 `gzip_static`，无 ngx_brotli**。
>
> ⚠ **运维：开工前先看文末「需向开发确认的未知项」**——SSH 目标主机/账号、是否有 CDN 这两项本仓库里没有真实值,必须先拿到才能执行步骤 4 与缓存节。

---

## 0. 一句话变更摘要

寻诗整联搜索现在命中正确的诗：搜 `行到水穷处，坐看云起时` → **王维《终南别业》排第一**（修复前为《春山》/《颂古二十一首》）。变更只有两半：

1. **lines/ 整行索引数据重建**（封顶规则改为「名家不淘汰」，**文件名不变、内容变**）；
2. **前端 bundle 重建**（`load.ts` 整联多句重排 Plan C）。

**poems/、search/、charset.json、manifest.json、lexicon.json、gifts.json、poets.index.json 全部未改；任何 `.conf` 文件均未改 → nginx 无需 reload。**

---

## 1. 前置条件（开工前逐项核对）

### 1.1 构建机器
必须在 **main worktree**：`C:\Users\Cohen\Desktop\shiyun`。只有它同时拥有最新代码（pull 后）和完整且已校验的 ~1.1GB git-ignored 重数据，lines/ 也已在这里重建。

### 1.2 本机工具自检（Git-Bash 里逐条跑，**位置：任意目录**）
```bash
which node     # 期望: /c/Program Files/nodejs/node       —— 构建 + 验证脚本都靠它
which scp      # 期望: /usr/bin/scp（Git-Bash 内置）；底层是 C:\Windows\System32\OpenSSH\scp.exe
which curl     # 期望: /mingw64/bin/curl                  —— 部署后验证用
which rsync    # 期望: 【空】—— 本机【没有】rsync！本 runbook 全程用 scp，勿照搬别处的 rsync 命令
```
> 本机已确认 `rsync` **未安装**，`scp`/`node`/`curl` 均在。所有传输命令一律用 `scp`。仓库里 `deploy/nginx.conf:6` 出现的 `rsync -a dist/ user@host:...` 只是**注释示例模板**，不是真实可用主机，**忽略它**。

### 1.3 SSH 可达性（拿到 1.4 的真实主机后）
确认能用约定的账号/端口/密钥 SSH 到目标主机，且对 `/var/www/shiyun/dist/` 有写权限。

### 1.4 目标主机信息（**本仓库无真实值,见文末确认项**）
SSH 用户、主机名、端口、密钥/口令获取方式——本仓库与 `docs/DEPLOY.md` 均未记录,**必须先向开发/站点 owner 取得**,否则步骤 4 无法执行。下文统一用占位符 `$SSH`（例：`ops@1.2.3.4 -p 22`，密钥见 password manager），运维替换为真实值。

### 1.5 nginx 现状(无需改动,仅确认理解)
`deploy/nginx.cohenjikan.conf` 已生效:`gzip_static on`、`location /data/poems/` 关压缩 + `Accept-Ranges bytes`、`location ^~ /data/linesf/ { access_log off; return 404; }` 短路。**本次不碰任何 .conf。**

### 1.6 本次发布【无需】corpora
不跑 `build-data.mjs`(详见风险节 R4)。lines/ 已在本机重建。

---

## 2. 精确步骤

> 约定：⬛ = **已在本机完成**（仅核对，勿重跑）；🟧 = **运维需做**。命令均标注【位置】。

### ⬛ 步骤 0 —— lines/ 已重建（核对，勿重跑 build:lines）

开发者已在 main worktree 跑过 `npm run build:lines`，重建 `public/data/lines/`（扫 933,857 首，王维《终南别业》已进入 `行到水穷处` 桶）。

### 🟧 步骤 1 —— 拉取最新代码 + 安装依赖

【位置：Git-Bash，`C:\Users\Cohen\Desktop\shiyun`（main worktree 根）】
```bash
cd /c/Users/Cohen/Desktop/shiyun
git switch main           # 确保在 main（构建机就在 main 上，防御性确认）
git pull                  # fast-forward 到含 1347cc8 的最新 main
npm ci
```
> `public/data/` 是 git-ignored，`git pull` 不会覆盖已重建的 lines/。

### 🟧 步骤 2 —— 本地预检：确认 lines/ 真的重建好了（**在多分钟构建+传输之前**）

【位置：Git-Bash，repo 根】
```bash
# (a) 256 个桶都在：
ls public/data/lines/*.json | wc -l            # 必须 = 256

# (b) lines/ 是新近重建的（mtime 应为 6-13 重建时间，不是上次部署的旧时间）：
ls -lt --time-style=+%Y-%m-%d_%H:%M public/data/lines/24.json

# (c) 关键桶 24.json 里有王维《终南别业》（poetId 47b3a766）：
node -e "const b=require('./public/data/lines/24.json');const r=b['行到水穷处']||[];console.log('refs:',r.length);console.log('有终南别业:', r.some(x=>x.p==='47b3a766'&&x.t==='终南别业'));"
#  期望输出:  refs: 6   有终南别业: true
```
> **桶号怎么来的**：`行到水穷处` 经 FNV-1a `hashStr` & 0xff = `0x24` → 桶 `24.json`。已为你算好，无需手算。
> （`hashStr` 对 **UTF-16 code unit** 逐个 `charCodeAt`，不是按 Unicode 码点；自己实现别按码点算，否则桶号会错。本 runbook 全程用预算好的桶号 `24`，不必复算。）
>
> **任一项不符就停**：256 不对或 mtime 是旧的或 `有终南别业: false` → lines/ 没重建好或是半成品，**先回到步骤 0 让开发重跑 `npm run build:lines`**，不要继续构建传输。

### 🟧 步骤 3 —— 完整构建 + 预压缩（**必须一起跑，勿拆**）

【位置：Git-Bash，repo 根（precompress 用相对 `dist` 路径，必须在根且在 build 之后）】
```bash
npm run deploy:build
# = npm run build (tsc --noEmit && vite build → dist/)  &&  npm run precompress (node deploy/precompress.mjs)
```
这一步做三件事，缺一不可：
1. `tsc --noEmit` 类型检查 + `vite build` → `dist/`；vite（默认 `copyPublicDir`）把整个 `public/data/`（含新 lines/）拷进 `dist/data/`。
2. bundle 内容哈希文件名变化（`dist/assets/*.js` 新名），`dist/index.html` 引用新名。
3. `precompress` 遍历 `dist/`，给 `*.json`/`*.js`/`index.html`（含 `dist/data/lines/*.json`）写 `.br` + `.gz`，**自动跳过 `dist/data/poems/*.json`**（保持 RAW 供 Range，已核对 `precompress.mjs:21`）。

> ⏱ **耗时提醒**：precompress 对 ~791MB lines/ 做 brotli q11，**可能数分钟**，不是卡死。若用带超时的封装，超时调到 ≥600s。
> ⚠ **这一步是「stale .br/.gz」陷阱的唯一防线**：`gzip_static` 按文件名直发 `.gz`、**不校验是否与源一致**。必须用完整 `deploy:build` 让 `.gz/.br` 与新 raw json **同步重写**——绝不可只传新 json 留旧压缩兄弟，否则浏览器拿到旧字节、修复「看起来没生效」。

### 🟧 步骤 3.5 —— 删除 dist/ 里的 v1 备份目录（**关键，别跳过**）

【位置：Git-Bash，repo 根】
```bash
# vite 默认会把 public/data 下【全部】子目录拷进 dist/，包括 ~1.16GB 的 v1 回滚备份。
# 不删 → 步骤 4 会把这 1.16GB 陈旧 v1 数据一并推到生产（浪费带宽+污染站点）。
rm -rf dist/data/lines_v1_backup dist/data/poems_v1_backup dist/data/search_v1_backup

# 确认 dist/data 里已无任何 *_v1_backup：
ls dist/data/ | grep _v1_backup && echo "!! 仍有 v1 备份，再删一次" || echo "OK: dist/data 干净，无 v1 备份"
```
> 已实测：`public/data/{lines,poems,search}_v1_backup`（共约 1.16GB）确实会被 vite 拷进 `dist/data/`。这些只是开发机的 v1 回滚副本（风险节 R7），**绝不能部署**。

### 🟧 步骤 4 —— 本机冒烟测试（部署前）

【位置：Git-Bash，repo 根】
```bash
npm run test     # = vitest run；1347cc8 新增整联重排测试，必须全绿
npm run preview  # = vite preview (sirv)，本地起服务 dist/、支持 Range；默认 http://localhost:5199
```
preview 起来后在浏览器搜 `行到水穷处，坐看云起时`，确认 **#1 是王维《终南别业》**。看完 Ctrl-C 停掉 preview。

### 🟧 步骤 5 —— 同步 dist/ 到目标主机（用 scp，**本机无 rsync**）

【位置：Git-Bash，repo 根；`$SSH` 替换为 1.4 拿到的真实 `user@host -p 端口`】

> scp **没有** `--delete`，无法像 rsync 那样靠 mtime 跳过未改文件，也不会自动清孤儿。下面分两段：先全量推 `dist/`，再单独清理上一版 bundle 的孤儿哈希文件。

```bash
# 5a. 全量推送整个 dist/（含新 lines/+.gz/.br、新 assets/*.js、index.html；poems/ 仍是 RAW）
#     注意 dist/ 后面的 . 与目标尾部 /，把 dist 的【内容】铺进 /var/www/shiyun/dist/
scp -r -P 22 dist/. $SSH_USER@$SSH_HOST:/var/www/shiyun/dist/
#   ↑ 若端口非 22 改 -P；$SSH_USER@$SSH_HOST 用真实值。例：
#   scp -r -P 22 dist/. ops@1.2.3.4:/var/www/shiyun/dist/

# 5b. 清理上一版 bundle 的孤儿哈希文件（scp 不会删旧文件，旧 assets/*.js 会堆积）
#     —— assets/ 是 immutable 长缓存，旧文件留着只是占盘、不影响正确性；想清就在主机上跑：
ssh -p 22 $SSH_USER@$SSH_HOST 'cd /var/www/shiyun/dist && ls -t assets/*.js assets/*.css 2>/dev/null'
#     人工核对哪些是这次 index.html 不再引用的旧哈希，再删，例如：
#     ssh -p 22 $SSH_USER@$SSH_HOST 'rm -f /var/www/shiyun/dist/assets/<旧哈希文件名>'
```
> **为什么不担心 poems/279MB 白白重传**：`rsync -a` 会因 vite 每次重拷给 poems/ 新 mtime 而误判「变了」重传(审查指出的 `白白重传` 风险);**但本 runbook 用的是 scp,scp 本就是无脑全量拷贝、不做增量比对**——所以这里没有「mtime 假阳性」问题,代价是 poems/+lines/ 每次都全量传(约 1GB)。若想省这次全量、改用增量,见文末确认项(需主机端装 rsync)。**绝不要**为了省传而只单独 scp lines/ 却漏掉对应 `.gz`(又踩 stale 压缩坑)。

### 🟧 步骤 6 —— **不需要** reload nginx

本次发布**未改任何 `.conf`**。纯数据 + 静态文件 scp，**无需** `nginx -t` / `systemctl reload nginx`。
> 只有当你**编辑过** `deploy/nginx.cohenjikan.conf` 时才需要：
> `sudo nginx -t && sudo systemctl reload nginx`（本次发布不需要）。

---

## 3. 缓存失效处理

lines/*.json **文件名不变、内容变**，是本次核心风险。三层缓存：

### 3.1 stale 预压缩兄弟（最尖锐）
见步骤 3 + 3.5。用完整 `deploy:build` 重写 `.gz/.br` 并随 scp 全量覆盖即可避免。若不放心，部署后在主机上确认 `lines/24.json.gz` 的 mtime 与 `lines/24.json` 一致；不一致就删掉 `.gz`（`gzip on` 会按需现压）。

### 3.2 CDN / 边缘缓存（**先确认是否存在,见文末确认项**）
nginx 给 `/data/` 发 `Cache-Control: public, max-age=86400`（1 天，**非 immutable**，已核对 conf 第 53 行）。

- **如果 `shiyun.cohenjikan.com` 前面【有】CDN**：部署后**立即 purge `/data/lines/*` 前缀**（用对应 CDN 控制台/CLI；本仓库未记录是哪家 CDN，见确认项）。purge 后用边缘 URL 验证拿到新字节：
  ```bash
  # 期望 last-modified 是本次部署时间（而非旧时间），cache 命中应为 MISS/EXPIRED 后转 HIT
  curl -s -D- -o /dev/null https://shiyun.cohenjikan.com/data/lines/24.json | grep -iE 'last-modified|x-cache|cf-cache-status|age'
  ```
- **如果【没有】CDN（直连 nginx）**：**跳过 purge**，无需任何边缘操作；浏览器层 24h 内靠 etag/last-modified revalidate 自愈。不要去找一个不存在的 CDN 控制台。

### 3.3 浏览器缓存
24h 内自愈：内容+mtime 变 → etag/last-modified 变 → revalidate 后 nginx 返 200 + 新字节。`index.html` 是 `no-cache`，bundle 是内容哈希新名，**前端那一半立即生效**。

> ⚠ **当前生产用默认配置**（稳定 `/data/`、max-age=86400、**非 immutable**），所以改 lines/ 内容只需(有 CDN 时)purge 边缘即可、不必改路径。**没有**启用可选的 `/data/v2` immutable 路径;若将来启用了它,同版本改 lines/ 会被缓存一年,必须 `/data/v2 → /data/v3` 改路径 + `VITE_DATA_BASE` 同步改 + 重建重部署。

---

## 4. 验证（部署后，端到端）

> 验证命令均在 **Git-Bash** 里跑（本机 `python`/`node`/`curl` 都在 Git-Bash 的 PATH）。如改用 PowerShell，把 `-o /dev/null` 换成 `-o NUL`。

**A. 功能（live app，最关键）**：浏览器打开 https://shiyun.cohenjikan.com 进寻诗，搜 `行到水穷处，坐看云起时` → **#1 必须是王维《终南别业》**（修复前为《春山》/《颂古二十一首》）。

**B. 新 bundle 已上线**：view-source `index.html`，确认 `/assets/*.js` 哈希文件名**与上次部署不同**。
```bash
curl -s https://shiyun.cohenjikan.com/index.html | grep -oE '/assets/[^"]+\.js'
```

**C. 无 stale 压缩兄弟（按本主机实际：gzip，不是 brotli）**：
```bash
# 本主机只有 gzip_static（无 ngx_brotli）→ 用 Accept-Encoding: gzip。桶号已预算好 = 24。
curl -s -H 'Accept-Encoding: gzip' -D- -o /dev/null https://shiyun.cohenjikan.com/data/lines/24.json | grep -iE 'content-encoding|last-modified|etag'
#  期望: content-encoding: gzip      （证明发的是预压缩兄弟）
#  期望: last-modified 为【本次部署时间】，不是旧构建时间  ← 成功判据钉在这条
```
> 不要发 `Accept-Encoding: br`：本主机无 brotli 会忽略它、返回 gzip，反而看不出问题。**判据 = `last-modified` 是新时间 + `content-encoding: gzip`**。

**D. 边缘/源的新字节里确实有王维（shell 无关，用 node）**：
```bash
curl -s https://shiyun.cohenjikan.com/data/lines/24.json \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const b=JSON.parse(s);const r=b['行到水穷处']||[];console.log('有终南别业(47b3a766):', r.some(x=>x.p==='47b3a766'&&x.t==='终南别业'));})"
#  期望: 有终南别业(47b3a766): true
```
> 这里固定用 `node`（本机三种 shell 都在 PATH），不用 `python -c "..."`（PowerShell 引号转义易碎，且可能命中 Windows Store stub）。桶号已写死 `24`，无需手算 FNV-1a。

**E. 回归冒烟（未改路径仍正常）**：点一个诗人 → poems/ 仍走 206 Range（DevTools 网络面板看到 206 + `Accept-Ranges: bytes`）；寻诗单字搜索、赠诗 toggle 正常；`#a=<poetId>` / `#p=<form>.<index>` 分享链接能正确还原。

---

## 5. 回滚

**两半相互独立，可分别回滚；干净回滚两半都做。两段回滚的传输都用 scp（同步骤 5，本机无 rsync），目标主机用步骤 1.4 的真实 `$SSH`。**

### 5.1 回滚数据（lines/）
旧 lines/ 备份在 `C:\Users\Cohen\Desktop\诗云相关文件\shiyun-data-v3-2026-06-13.tar.gz`（已确认存在，~489MB）以及 `C:\Users\Cohen\Desktop\shiyun\backup-pack\lines.tar.gz`（已确认存在）。

【位置：Git-Bash】
```bash
cd /c/Users/Cohen/Desktop/shiyun/public/data
rm -rf lines
tar -xzf "/c/Users/Cohen/Desktop/诗云相关文件/shiyun-data-v3-2026-06-13.tar.gz"   # 或 backup-pack/lines.tar.gz
cd /c/Users/Cohen/Desktop/shiyun
npm run deploy:build      # 重新生成与旧 lines/ 匹配的 .gz/.br（必须！否则又是 stale 压缩坑）
rm -rf dist/data/lines_v1_backup dist/data/poems_v1_backup dist/data/search_v1_backup   # 同步骤 3.5
scp -r -P 22 dist/data/lines/. $SSH_USER@$SSH_HOST:/var/www/shiyun/dist/data/lines/
# 然后(若有 CDN)purge 边缘 /data/lines/*（文件名相同，正向/回滚都必须 bust 边缘）
```

### 5.2 回滚代码（bundle）
【位置：Git-Bash，repo 根，已在 main】
```bash
git switch main           # 防御性确认在 main
git revert 1347cc8        # 生成一个新 revert commit；或直接 checkout 上一个 commit 90a568d 构建
npm run deploy:build
rm -rf dist/data/lines_v1_backup dist/data/poems_v1_backup dist/data/search_v1_backup
scp -r -P 22 dist/. $SSH_USER@$SSH_HOST:/var/www/shiyun/dist/   # 含新 assets/* + index.html（no-cache，客户端立即翻转）
```
> **`git revert` 要不要 push？** revert 在 main 上生成新 commit。若只为「构建出回滚版 bundle」而临时回滚，可**仅本地构建、不 push**（构建完用 `git reset --hard origin/main` 复位）。若是要把回滚作为正式发布,则需 `git push origin main`。**先与开发确认走哪条**,别擅自 push 改写 main 历史。

### 5.3 半回滚后果
- 只回滚 JS、保留新 lines/ → 寻诗能用但失去整联多句重排；
- 只回滚 lines/、保留新 JS → 重排还在，但《终南别业》可能又被挤出 `行到水穷处` 桶。
**无 nginx 改动需撤销**；poems/search/charset/manifest/lexicon/gifts/poets.index 从未动过，无需恢复。

---

## 6. 风险 / 注意

**R1【linesf 404 事故教训 — 绝对不要碰】** `deploy/nginx.cohenjikan.conf` 第 46–49 行 `location ^~ /data/linesf/ { access_log off; return 404; }` **必须保持原样**。linesf/ 是 ~4.4GB delete-1 模糊索引，**故意不部署**；客户端一次模糊查询会向多个桶发请求、全部 404。**2026-06-13 曾因此触发日志挖矿自动封禁，把真实访客的 404 突发当扫描器，全站 403 宕机。** `^~` 精确前缀压过 regex location、`return 404` 让客户端 graceful-degrade、`access_log off` 把预期 404 藏起来不喂安全日志。`load.ts:268/285` 也会在首个 404 后 latch `_linesfUnavailable=true`、本会话停止再探（已核对）。本次发布不涉及 linesf/，**勿动此 block**。

**R2【最尖锐部署坑】stale `.gz`**：`gzip_static` 按文件名直发压缩兄弟、不校验内容；只传新 json 不重写 `.gz` = 永久发旧内容、200 状态、修复「不生效」。**永远用完整 `npm run deploy:build`**（见步骤 3 / 验证 C）。

**R3 poems/ 必须保持 RAW**：`location /data/poems/` 关 gzip + `Accept-Ranges: bytes`，因为 `poems/{bucket}.idx.json` 的字节偏移索引的是**未压缩**文件。precompress 已自动跳过 `data/poems/`（`precompress.mjs:21`，已核对）。**绝不给 poems/ 加压缩**，也**绝不把 poems/ 的关压缩规则套到 lines/**（lines/ 是整桶 fetch，应正常压缩）。

**R4【勿误诊为缺数据】不要为「修复没生效」去跑 `build-data.mjs`**：本次无需 corpora。`build-data.mjs` 会 **OVERWRITE** `public/data`，且缺 modern-poetry corpus 现在**会 FAIL LOUD**（旧行为是静默丢 508 个新诗诗人、令索引 desync）。只有在 `C:/corpus/Werneror-Poetry` 与 `C:/corpus/modern-poetry` 都已 clone 时才考虑（DEPLOY.md §1 Option B），与本发布无关。若验证 A 没出王维，按验证 C/D 排查 stale 压缩 / 缓存，**不要**重跑 build-data。

**R5 本机无 ngx_brotli（cohenjikan 主机）**：不要在 `nginx.cohenjikan.conf` 加 `brotli_static`/`brotli` 指令（会 config-test 失败）。该主机只用 `.gz`；`.br` 文件无害但被忽略。验证一律按 gzip 看。

**R6 构建位置**：必须在 main worktree 构建。`precompress` 用相对 `dist` 路径，**必须在 repo 根且 `npm run build` 之后**运行，否则 `dist/` 不存在会 exit 1（`precompress.mjs:30-35`）。

**R7【已实测会进 dist/】v1 备份**：`public/data/{lines,poems,search}_v1_backup`（共 ~1.16GB，pre-2026-06-10、29,808 诗人）在开发机仅供 rollback。**vite 默认 `copyPublicDir` 会把它们拷进 `dist/data/`**——所以步骤 3.5 的删除是**强制**的，否则会把 1.16GB 陈旧 v1 数据推到生产。**只能从清理过的 `dist/` 传输；永远不要 `scp public/data/`。**

**R8 传输 verb 已换为 scp**：本机无 rsync。scp 全量拷贝、无 `--delete`、无增量比对。旧 bundle 孤儿需在主机上人工清（步骤 5b）。确认目标确实是 `/var/www/shiyun/dist/`（conf 第 5 行 `root`，无 `alias`，数据必须物理位于 `dist/data/lines/`）。

---

## 7. 相关文件（绝对路径）

- `C:\Users\Cohen\Desktop\shiyun\src\data\load.ts` —— 前端整联多句重排 + `DATA_BASE = VITE_DATA_BASE || "/data"`（第 20 行）；linesf 会话级 latch（第 268/285 行）。
- `C:\Users\Cohen\Desktop\shiyun\pipeline\build-lines.mjs` —— lines/ 索引重建，名家优先封顶（`rankOf` 第 49 行，`lineBucket` 第 31 行）。
- `C:\Users\Cohen\Desktop\shiyun\deploy\precompress.mjs` —— 写 `.br/.gz`，跳过 `data/poems/`（第 21 行）。
- `C:\Users\Cohen\Desktop\shiyun\deploy\nginx.cohenjikan.conf` —— 生产配置；linesf 404 短路（46-49）、poems 关压缩（34-39）、/data/ max-age=86400（51-54）。
- `C:\Users\Cohen\Desktop\shiyun\public\data\lines\` —— 已重建索引数据（256 桶；`24.json` 含王维《终南别业》47b3a766）。
- 旧 lines/ 回滚备份：`C:\Users\Cohen\Desktop\诗云相关文件\shiyun-data-v3-2026-06-13.tar.gz` 及 `C:\Users\Cohen\Desktop\shiyun\backup-pack\lines.tar.gz`（均已确认存在）。

---

## 8. 需向开发确认的未知项（运维开工前必须取得）

> 以下为本仓库无真实值、必须先向开发/站点 owner 取得的环境项;取得前勿执行部署/回滚的传输与缓存步骤。

1. SSH 目标主机的真实连接信息：用户名、主机名/IP、端口、密钥或口令的获取方式。本仓库与 docs/DEPLOY.md 均无真实值（deploy/nginx.conf:6 的 `user@host` 只是注释模板）。步骤 5（部署）与步骤 5.x（回滚）全部依赖它。

2. 上传方式确认：本 runbook 默认用 scp（因构建机无 rsync）全量推送 dist/，每次约传 1GB（poems+lines）。如希望走增量（只传变化的 lines/+压缩兄弟、跳过未改的 poems/），需在【目标主机】侧安装 rsync 并改用 rsync 命令——请确认是否要这么做。

3. shiyun.cohenjikan.com 前面是否有 CDN / 边缘缓存？若有：是哪家（用于 purge /data/lines/* 的控制台或 CLI 命令）、以及 purge 凭据从哪取。若没有（直连 nginx）：缓存节 3.2 的 purge 步骤整段跳过。本仓库未记录是否存在 CDN。

4. 目标站点根确认：nginx 配置写的是 root /var/www/shiyun/dist（无 alias）。请确认生产主机上该路径确为站点根、且部署账号对其有写权限。

5. git revert 1347cc8 的处理：回滚 bundle 时,revert 产生的新 commit 是仅本地构建用(构建后 reset 复位)、还是要正式 push 到 origin/main？涉及是否改写 main 历史,需开发拍板。

---

## 附：已逐条修复的审查 gap 对照

| 审查 gap | 处理 |
|---|---|
| RED rsync 未安装 | 全程改 scp（已验证 `scp.exe` 在）；1.2 加 `which` 自检 |
| RED 占位主机 user@shiyun-host | 移入确认项 + 1.4 标注占位符 `$SSH`，等真实值 |
| RED 验证 C 用 brotli 但主机返 gzip | 改 `Accept-Encoding: gzip`，期望 `content-encoding: gzip`，判据钉在 last-modified |
| RED 验证 D 用 python 不可移植 | 改 node 一行（三 shell 都在 PATH） |
| ORANGE 桶号要手算 | 预算并写死 `24`（行到水穷处），含 UTF-16 code-unit 说明 |
| ORANGE header 陈旧 + v1 备份 | header 更新；实测 v1 备份会进 dist/ → 步骤 3.5 强制清理 |
| ORANGE 无 lines/ 本地预检 | 步骤 2：256 桶 + mtime + 桶 24 含王维 + npm test |
| ORANGE CDN purge 含糊 | CDN 是否存在移入确认项；分「有/无 CDN」两支，含 purge 后 curl 确认 |
| YELLOW poems mtime 重传 | 说明 scp 无增量、本就全量；不存在 mtime 假阳性问题 |
| YELLOW 回滚继承 R1/R2 + git revert | 回滚传输镜像为 scp；revert push 与否需先确认 + `git switch main` |