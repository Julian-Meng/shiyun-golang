# 诗云 · Poetry Cloud

**[中文](#中文) · [English](#english)**

A roamable 3D star map where real historical poets are real-corpus star clusters, and the
void between them is the space of *all possible* regulated-verse poems — pulled out on click
via an index↔poem bijection that is **computed, never stored**.

> 灵感来自刘慈欣《诗云》与博尔赫斯《巴别图书馆》。诗不被储存——给一个编号就能算出第几首诗,
> 反之亦然。杰作只是噪声海里的零测度亮点。

![status](https://img.shields.io/badge/engine-34%2F34_green-success) ![status](https://img.shields.io/badge/build-static-blue)

---

## 中文

一张可在其中飞行的三维星图:**每位历史诗人是一团真实星**(他真实写过的诗),星团之间的**虚空是一切可能的近体诗**。点击虚空,就从噪声里 `unrank` 出一首诗,并显示它在"全集目录"里那个长达 82–229 位的编号——地址几乎和诗本身一样长(目录即图书馆)。

- **全朝代**:先秦 → 当代,15 个朝代同心壳,可按朝代筛选(语料以 [Werneror/Poetry](https://github.com/Werneror/Poetry) 全历代为骨,叠加 [chinese-poetry](https://github.com/chinese-poetry/chinese-poetry) 的唐宋繁体)。
- **四种诗体**:五绝/七绝/五律/七律;**格律开关**:在"合律子目录"里漫游(嵌套于纯随机目录内)。
- **纯静态**:所有索引运算与渲染都在浏览器,服务器只发静态文件,**永不加后端**。

运行:
```bash
npm install
npm run dev     # 开发预览
npm test        # 引擎往返测试
npm run build   # 静态构建 → dist/
```

文档:[架构](docs/ARCHITECTURE.md) · [引擎接口](docs/ENGINE_API.md) · [数据契约](docs/DATA_CONTRACT.md) · [数据管线](docs/PIPELINE.md)

---

## English

A 3D star map you fly through: **each historical poet is a cluster of real stars** (poems
they actually wrote); the **void between clusters is every possible regulated-verse poem**.
Click the void and a poem is `unrank`ed out of the noise, shown with its 82–229-digit address
in the "complete catalog" — the address is nearly as long as the poem itself (the catalog
*is* the library).

- **All dynasties** 先秦→当代, 15 concentric shells, filterable; corpus = Werneror (full
  history) backbone + chinese-poetry traditional 唐宋 overlay.
- **Four forms** (5/7-char quatrains & regulated verse) + a 格律 toggle that roams only the
  valid sub-catalog (nested inside the random one).
- **Fully static** — all index math + rendering run client-side; the server only serves
  files. No backend, ever.

```bash
npm install && npm run dev
```

Docs: [Architecture](docs/ARCHITECTURE.md) · [Engine API](docs/ENGINE_API.md) ·
[Data Contract](docs/DATA_CONTRACT.md) · [Pipeline](docs/PIPELINE.md)

---

*Engine math: base-N (Babel) + mixed-radix-product (格律) rank/unrank, reversible BigInt
Feistel scatter. Pure TypeScript, zero deps, 34 round-trip tests. MIT.*
