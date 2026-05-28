# LitFolio 用户手册

中文用户手册的 LaTeX 源码与截图工具。

## 目录

```
docs/manual/
├── manual.tex            # 主 LaTeX
├── preface.tex           # 前言
├── part1-workflow.tex    # 第 1~4 章
├── part2-discovery.tex   # 第 5~8 章
├── part3-admin.tex       # 第 9~12 章 + 附录
├── figures/              # 18 张 PNG 截图
└── capture/              # 截图脚本子项目（独立 package.json）
```

## 一键重建

```bash
# 1) 重新跑截图（Playwright + 模拟 Tauri IPC）
cd docs/manual/capture
pnpm install
pnpm capture

# 2) 用 xelatex 编两遍（解决目录与交叉引用）
cd ..
xelatex manual.tex
xelatex manual.tex
```

产物：`docs/manual/manual.pdf`。

## 截图工作原理

LitFolio 是 Tauri 桌面应用。截图脚本用一个 vite 子配置（`capture/vite.screenshot.config.ts`），通过 alias 把 `@tauri-apps/api/core` 替换成 `capture/mock-tauri.ts`——后者实现了同形 `invoke()`，返回 `capture/seed-data.ts` 的样例数据。Playwright 启 Chromium 访问该 vite dev server，按 `capture/routes.mjs` 逐条截图。

主代码零侵入：`pnpm tauri dev` / `pnpm tauri build` 完全不走截图配置。

## 依赖

- LaTeX：xelatex + ctex + tcolorbox + titlesec + xcolor + graphicx
- 字体（可选，缺则 fallback）：Lora、Source Han Serif SC、JetBrains Mono
- Node：≥ 18（capture 子项目）
- Playwright：会在 `pnpm install` 时自动装 Chromium

## 重跑某一张截图

把 `routes.mjs` 中其它条目临时注释掉即可。
