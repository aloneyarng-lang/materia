# Claude · 灰白

在 Materia 的「设置 → 主题与字体 → 主题文件 → 导入主题」中打开 [Claude-灰白.mtheme.json](Claude-灰白.mtheme.json)，预览后应用。浅色版以参考截图中的 `#F9F9F7` 为工作区底色、`#F0EFEC` 为次级面板色、`#131313` 为文字和主要操作色。陶土橙 `#D97757` 只用于 Materia 左上角的品牌标识，不染色按钮、链接或选中态。深色版使用暖黑与米灰。搜索框、分段导航和浮动工具沿用 Materia 的玻璃和胶囊控件，星图使用圆点与细直线。

英文使用内嵌的 Lora 正体及斜体。简体中文优先使用系统苹方，随后回退到微软雅黑 UI 或内置思源黑体。「字体与字号」中的个人选项优先于主题。Lora 来自 Google Fonts，主题包内附原始许可。 [字体源文件](https://github.com/google/fonts/tree/main/ofl/lora) · [SIL Open Font License](OFL.txt)

陶土橙色值和 Lora 的选用参考了 Anthropic 的公开品牌指南，工作区中性色取样自参考截图。圆角与玻璃控件参考了 Apple 对 Liquid Glass 的工具栏分组说明。 [Anthropic 品牌指南](https://github.com/anthropics/skills/blob/main/skills/brand-guidelines/SKILL.md) · [Apple Liquid Glass](https://developer.apple.com/documentation/TechnologyOverviews/adopting-liquid-glass) · [Apple 系统字体目录](https://developer.apple.com/fonts/system-fonts/)

在 `material-atlas` 目录下重新打包和校验。

```sh
node scripts/pack-theme.mjs theme-examples/claude-paper/manifest.json theme-examples/claude-paper/Claude-灰白.mtheme.json
node scripts/validate-theme-design.mjs theme-examples/claude-paper/Claude-灰白.mtheme.json
```
