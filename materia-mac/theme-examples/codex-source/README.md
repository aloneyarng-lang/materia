# Codex · 雾白工作台

主主题 `codex.mtheme.json` 使用本机已安装的苹方简体（PingFang SC），米白与炭黑配色、少量灰绿选中底色、统一圆角细线图标。

## 导入

在「主题与字体 → 导入主题包 / CSS」选择 `codex.mtheme.json`，预览后点击「应用并保存主题」。若已导入过同名主题，重新导入会更新它。在「字体与字号」点击「恢复跟随主题」，清除此前单独选择的字体；个人界面字号 100% 对应主题的 14px 基础字号。

若安装苹方后程序仍显示旧字体，请先退出再重新打开 Materia。主题包使用已安装的中文字体，不嵌入或分发苹方字体文件；换电脑时需在新电脑安装苹方。

## 字体与图标

- 正文：PingFang SC / 苹方-简，14px、400。
- 标题：同一字体族，500 字重。
- 数字：同一字体族。
- 代码：应用内置 Source Code Pro 等宽字体；代码中的中文优先使用苹方。
- 图标：40 个主要语义图标统一重绘，24px 网格、1.55px 线宽、圆角轮廓。
- 星图：空心圆点、细直线和干净底色。

保留的 `codex-source-han.mtheme.json` 是明确使用思源黑体的独立版本，其字体需本机安装。主题不修改文献、聊天、密钥或 PDF。

## 重新打包

```sh
node scripts/pack-theme.mjs theme-examples/codex-source/manifest.json theme-examples/codex.mtheme.json
```

代码字体引用应用内置 Source Code Pro，主题不重复嵌入字体。完整字体许可在应用 dist/fonts 中保留。本主题为独立制作的风格主题。

## v2.0 界面适配

主主题与思源黑体版均提供 light / dark 两种模式，沿用应用统一玻璃、圆角和按压反馈。可在主题窗口切换明暗模式。
