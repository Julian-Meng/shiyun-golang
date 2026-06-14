# 开发文档 — 增大「诗·光点」点击面积（2026-06-13）

> 状态：**已完成**（代码 + 测试 + 文档已同步；见 §6 验证记录）。
> 触发：用户反馈「选中诗人后，代表诗的光点能不能放大一点点 / 能不能做触控缩放」。
> 业主要求：**诗本身的点击/选中面积增大至少一倍（≥2× 面积），让手机端也能轻松点中**。

## 1. 根因（代码级）

诗的「光点」是 GPU 颜色-ID 拾取（`gpuPick.ts`）。选中诗人时，高亮层（`PoemOrbits.tsx`）以
`sizeScale:860, maxPx:44` 渲染，并且 **可视**着色器再乘一个 flare：
`gl_PointSize = clamp(860/-mv.z, 1, 44) * flareSize`，`flareSize = 1 + uFlare*1.8`；选中保持期
`uFlare=0.6 → flareSize≈2.08`（[PoemOrbits.tsx:42-43](../src/three/PoemOrbits.tsx)、[:221-222](../src/three/PoemOrbits.tsx)）。

但 **拾取**着色器（[gpuPick.ts:142-144](../src/three/gpuPick.ts)）只算
`clamp(uScale/-mv.z, 1, uMax)` —— **没有乘 flare**。于是：

> 可点击圆盘的线性尺寸 ≈ 可见光点的 1/2.08 → **可点击面积只有看到的光点的约 ¼**。

用户看到一个大光点、却点在它的光晕上落空 —— 这正是「选中面积依然很小」的根因。

## 2. Spec（成功标准 + 边界）

**成功标准**
- 选中诗人后，每个诗·光点的拾取圆盘面积 **≥ 2× 旧值**，且 **≈ 可见（带 flare）光点**（所见即所点）。
- 触控（coarse 指针）下，光点附近的容差更大，手机能轻松点中。
- `vitest` + `npm run build` 通过；新逻辑有单测。

**边界（不动）**
- 不改 **可视**渲染（星空美感不变，用户称赞过画面）。
- 不改 **诗人**（poet）拾取的盘面 / gate；不改「哪些光点可点」的 gate 逻辑（同样的光点可点，只是盘更大）。
- 不碰 `poems/` RAW、HTTP Range、charset/编号（这是纯 three.js 客户端渲染改动）。

## 3. 方案（择优实施）

- **A（根因修复，核心）**：给诗拾取盘乘上 flare 因子，使可点击盘 = 可见光点。
  - 新增常量 `POEM_CLICK_BOOST ≈ 2.1`（≈ 高亮保持期 flareSize 2.08）。
  - `gpuPick.ts` 的诗拾取着色器：在 **未 flare 的 sz** 上做 gate（同样的光点可点），再
    `gl_PointSize = clamp(sz * uClickBoost, uGate, uMax * uClickBoost)`（盘 ≈ 可见光点）。
  - 线性 ×2.1 → 面积 ×≈4.4（≥2×），且所见即所点。**纯拾取层改动，可视零变化。**
- **B（移动端容差，补充）**：拾取窗口半径按指针类型自适应。
  - 提取纯函数 `pickRadiusPx(pr, coarse)`：鼠标 ~6 CSS-px、触控 ~11 CSS-px（`COARSE` 来自
    `detectQuality`，node 安全）。`pick()` 用它替换写死的 `6*pr`。
- **C（触控缩放 / 诗人内分片）**：用户也提了「触控放大缩小」。捏合缩放属较大的相机/手势改动（见
  `touchGesture.ts`），且 A+B 已满足「点击面积 ≥2× + 手机易点」的本次目标 → **本次不做**，列为后续。

## 4. 实施计划

| 文件 | 改动 |
|---|---|
| `src/three/gpuPick.ts` | +`POEM_CLICK_BOOST`；诗拾取着色器加 `uClickBoost` uniform 并乘到盘面；+纯函数 `poemPickDiscPx`、`pickRadiusPx`；`pick()` 用 `pickRadiusPx(pr, COARSE)`；import `COARSE`。 |
| `src/three/gpuPick.test.ts` | +测试：`POEM_CLICK_BOOST∈[√2,3]`；`poemPickDiscPx` 线性 ≥√2×（面积 ≥2×）；`pickRadiusPx` 触控>鼠标且 ≥2。 |

## 5. 验证方式
- 单测：上述新用例 + 既有 gpuPick 编码/`nearestPickId` 用例不回归。
- `tsc --noEmit` + `vite build` 通过。
- 可视：因拾取盘是离屏不可见层，盘面本身肉眼不可见；以「单测断言盘面 ≥2×」+「可视光点未变」为准，
  并在交接手册写明运维如何在真机/触控上抽测点中率。

## 6. 验证记录 / 最终值

**最终实现**（`src/three/gpuPick.ts`）：
- `POEM_CLICK_BOOST = 2.1`（≈ 高亮保持期 flareSize 2.08）→ 拾取盘线性 ×2.1 → **面积 ×≈4.4（≥2×）**，
  且 ≈ 可见光点（所见即所点）。诗拾取着色器:gate 仍在 **未 flare 的 sz** 上(同样的光点可点)，
  `gl_PointSize = clamp(sz * uClickBoost, uGate, uMax * uClickBoost)`。
- `pickRadiusPx(pr, coarse)`:鼠标 6 CSS-px、**触控 11 CSS-px**(×pr)；`pick()` 用 `pickRadiusPx(pr, COARSE)`
  替换写死的 `6*pr`。`COARSE`(`detectQuality`)node 安全(`typeof matchMedia` 守卫 → 测试中为 false)。
- 纯函数 `poemPickDiscPx` / `pickRadiusPx` 镜像着色器/pick() 的数学,作为单测锚点(改一处务必同步)。

**测试 / 构建**：
- 新增 4 条单测(`POEM_CLICK_BOOST∈[√2,3]`；`poemPickDiscPx` 线性 ≥√2× → 面积 ≥2×；盘面 = clamp×boost
  封顶 maxPx×boost；`pickRadiusPx` 触控>鼠标且 ≥2)。既有 gpuPick 编码/`nearestPickId` 用例不回归。
- **全量 212 测试通过** + `tsc --noEmit` + `vite build` 通过。
- 自审:仅改诗(poem)拾取层 —— 诗人(poet)拾取着色器/gate 未动；可视渲染未动(星空不变);
  GLSL 复读确认 uniform 已声明/提供/合法。拾取盘是离屏不可见层,无法截图核验;运行时点中率以真机抽测为准(见运维手册)。

**取舍**：选 A（根因:盘=可见光点）+ B（触控容差）。未做 C（捏合缩放）—— 属较大相机/手势改动,
A+B 已满足本次「面积 ≥2× + 手机易点」目标;若后续要触控缩放再单独立项(`touchGesture.ts`)。

**WYSIWYG 不变量**:`POEM_CLICK_BOOST` 应 ≈ PoemOrbits 高亮保持期 flareSize(`1 + HOLD_FLARE*1.8`,
当前 HOLD_FLARE=0.6 → 2.08)。若将来调 `HOLD_FLARE`/flare 公式,请同步本常量,使可点盘继续 = 可见光点。
