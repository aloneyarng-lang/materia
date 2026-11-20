# 博丽灵梦 · Hakurei Reimu

两款主题（朱白结界 / 梦想封印）已直接内置到软件及桌面打包流程，在「主题与字体」中开箱即用。

在 `material-atlas` 目录运行 `node theme-examples/hakurei-reimu/build.mjs` 可在本目录生成独立主题包。构建使用当前程序的公开主题校验器及 `dist/fonts` 中未经修改的思源黑体 CN、Inter 和 Source Code Pro，保留 OFL 许可；不打包 Apple 字体。

节点使用原创折角御札、朱印符线、红白阴阳玉，背景为鸟居结界底纹。`dist/reimu-presets.js` 同时提供内置定义和独立包源数据，采用通用 `assets.graphSymbols` 接口；导出后不依赖主题 ID。接口保持旧主题包和 CSS 导入兼容，图形不含脚本、位图或远程引用。
