# GEMINI · 星昼星穹 · 双子星图

由 Gemini 独立设计的 Materia 内置双模式主题，同时提供可单独导出的完整 `.mtheme.json` 主题包。

## 设计语言

- **双子星配色（北河二 Castor × 北河三 Pollux）**
  - **浅色（星昼）**：冷调星昼银白底色（`#edf0f9`）配北河二星辉靛蓝（`#3b4cca`）与北河三暖金（`#946214`），玻璃卡片与主文字对比度均远超 WCAG AA 4.5 标准。
  - **深色（星穹）**：深空天顶黑靛底色（`#0b0f1e`）配长波星辉矢车菊蓝（`#98b2ff`）与星光暖金（`#f0c674`），暗色玻璃边缘泛出克制的星光反光。
- **独特星图标识（Star Map v3 `graphSymbols`）**
  - **文献节点（四芒星棱镜）**：精密星盘外环、四向刻度、双曲线四芒星主徽与右上伴星光点。
  - **关联节点（双子连星仪）**：金色星盘圆环内，一靛一金两颗四芒双子星以轴线相连，呼应 Castor 与 Pollux 的双星意向。
  - **星图底纹（双子座天球星图）**：以低透明度呈现天球赤道环、倾斜黄道弧线与双子座真实星象连线（含北河二、北河三、井宿等主要恒星）。
  - 所有矢量星图符号均使用主题语义色（`theme-accent` / `theme-warning` / `theme-paper`），浅色与深色模式自动协调切换。
- **语义图标与排版**
  - 为 `assistant`、`orbit`、`network`、`star`、`library`、`folder`、`chart`、`palette`、`settings`、`files`、`tag`、`search`、`natural-layout` 定制四芒星与星盘风格圆润线框图标。
  - 引用软件内置 `Materia SF Pro` / `Materia Inter` / `Materia Source Han Sans` 与 `Materia SF Mono`（数字与等宽），不重复打包字体二进制。

## 重新生成与校验

```sh
node theme-examples/gemini/build.mjs
node scripts/validate-theme-design.mjs theme-examples/gemini/GEMINI.mtheme.json
```
