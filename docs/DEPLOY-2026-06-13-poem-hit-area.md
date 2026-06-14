# 运维部署交接手册 — 增大诗·光点点击面积（2026-06-13）

> 配套开发文档：`docs/DEV-2026-06-13-poem-hit-area.md`。
> 性质：**纯前端（three.js 客户端拾取层）改动；数据零改动。**

## 0. 一句话

选中诗人后，诗·光点的可点击面积放大到 ≥2×（≈4.4×，且 = 可见光点，所见即所点），触控容差更大 —
手机也能轻松点中。改动文件仅 `src/three/gpuPick.ts`（+ 测试）。

## 1. 要部署什么 / 不动什么

- **变了（要上线）**：前端 JS bundle（新的 `dist/assets/*.js` + `index.html`）。
- **未变（不必动）**：`poems/`、`lines/`、`search/`、`charset/manifest/lexicon/gifts/poets.index` 全部不变；
  `deploy/*.conf`、CF Worker 均未改 → **无需重建数据、无需重传 `/data/`、无需 nginx reload、无数据缓存失效顾虑**。
- **契约保持**：未碰 `poems/` RAW / HTTP Range / charset 编号（这只是离屏拾取盘的尺寸 + 触控容差）。

## 2. 部署步骤（与 `docs/DEPLOY-2026-06-13-search-fix.md` 同，跳过所有数据/lines 步骤）

【构建机:`C:\Users\Cohen\Desktop\shiyun`，Git-Bash】
```bash
cd /c/Users/Cohen/Desktop/shiyun && git switch main && git pull && npm ci
npm run deploy:build                                   # tsc + vite build → dist/ + precompress(.gz)
rm -rf dist/data/lines_v1_backup dist/data/poems_v1_backup dist/data/search_v1_backup   # 同既有 runbook:删 v1 备份
scp -r -P <端口> dist/. <user@host>:/var/www/shiyun/dist/   # 本机无 rsync,用 scp(同既有 runbook)
```
- 缓存:`index.html`(no-cache)+ 内容哈希 bundle → 新前端**立即生效**;数据未变 → **无需 purge `/data/`**。
- 无需 `nginx -t` / reload（未改 .conf）。

## 3. 验收（关键:拾取盘是离屏不可见层,必须真机点测)

拾取盘渲染在离屏缓冲、肉眼不可见,**不能靠截图核验**。请按行为抽测:

1. **桌面**:打开站点 → 点一个诗人 → 其诗·光点高亮 → 鼠标点光点,应能选中(右侧面板出现该诗 / 飞到该行星)。
   对比上线前:以前需精确点在光点中心,现在点在光晕范围内即可中。
2. **手机/触控(重点)**:同样选中诗人后,用手指点诗·光点 → 应能轻松点中(容差更大)。
   反复点几颗不同的光点确认命中率明显提升。
3. **回归**:诗人星本身仍可正常点选;空隙处仍可"拉取虚空"(没有变得到处误选诗)。
4. **控制台**:首次点诗触发拾取着色器编译;DevTools Console 应**无** `THREE.WebGLProgram: shader error`
   (本次新增了一个 `uClickBoost` uniform,这是唯一的着色器改动;若报错请回滚,见 §4)。

## 4. 回滚

纯前端、单文件。回滚 = `git revert <本次 commit>` → `npm run deploy:build` → 删 v1 备份 → scp dist/。
无数据/nginx 需恢复。（commit 哈希见发布记录 / `git log`。）

## 5. 备注

- 本次只做"增大点击面积"(用户建议二)。用户还提了"触控捏合缩放"(建议一)—— 属较大相机/手势改动,
  本次未做,如需可另立项(`src/three/touchGesture.ts`)。
- 不变量:`POEM_CLICK_BOOST`(gpuPick.ts)≈ PoemOrbits 高亮 flareSize,使"可点盘 = 可见光点"。
  若将来调高亮 flare,请同步该常量(开发文档 §6 已注明)。
