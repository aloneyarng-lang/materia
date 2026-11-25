# 青冥 · 天青极夜 · 浑仪星象

独立设计的 Materia 内置双模式主题，同时提供可单独导出的完整 `.mtheme.json` 主题包。取意古典天球「青冥」苍穹与现代晶体光学，结合天青釉白与极夜苍青双色系、透明玻璃光学高光及原创浑仪星图矢量标识。

## 设计语言

- **天青昼 × 青冥夜双模式配色**
  - **浅色（天青昼）**：雨过天青瓷雾底色（`#e9f2f2`）配瓷白浮层（`#fafefe`）、矿石孔雀青强调色（`#0b6b70`）与鎏金黄铜辅色（`#916010`），正文与背景、强调色与白字对比度均远超 WCAG AA 4.5 标准。
  - **深色（青冥夜）**：深海玄青底色（`#071316`）配子夜青石面板（`#102126`）、极光碧青强调色（`#52e0d2`）与浑仪鎏金（`#efc46e`），深色玻璃边缘自然映出清冽青碧高光。
- **独特星图标识（Star Map v3 `graphSymbols`）**
  - **文献节点（浑天六棱星枢）**：外圈浑仪经纬环与四向刻度、斜倾黄道环及伴星珠，内嵌六方切面晶核与鎏金极轴。
  - **关联节点（经纬联星仪）**：鎏金赤道圆环内交织纵横经纬椭圆弧、二分二至四极标点与菱形星枢。
  - **星图底纹（紫微垣北极浑仪星象图）**：以低透明度绘制同心赤纬环、十二辰经线、倾斜黄道大环，并以北极星为中心呈现北斗七星、仙后座与小熊座真实拱极星象连线。
  - 所有矢量图形均采用主题语义色（`theme-accent` / `theme-warning` / `theme-paper`），浅色与深色自动协同切换。
- **语义图标与排版**
  - 为 `assistant`、`orbit`、`network`、`star`、`library`、`folder`、`chart`、`palette`、`settings`、`files`、`tag`、`search`、`natural-layout`、`flask` 定制六棱晶核与浑仪风格圆润线框图标。
  - 标题采用内置 `Materia New York` + `Materia Source Han Sans` 衬线组合，正文采用 `Materia SF Pro` 体系，数字与等宽采用 `Materia SF Mono`，不重复打包字体二进制。

## 重新生成与校验

```sh
node theme-examples/qingming/build.mjs
node scripts/validate-theme-design.mjs theme-examples/qingming/青冥.mtheme.json
```
