# 主题示例

新主题请先阅读 [制作规范](DESIGN_RULES.md) 与 [目录约束](AGENTS.md)。根目录模板和北航蓝示例已更新为一个包包含浅色／深色的玻璃主题；其余旧包保留作兼容示例。


- `hakurei-reimu/`：**博丽灵梦 · 朱白结界 / 梦想封印**，已作为两款内置主题随程序提供。使用原创折角御札、朱印符线、红白阴阳玉和鸟居结界底纹，采用通用的星图接口。目录保留独立包构建脚本与说明。

- `liquid-glass/`：**澄璃 · Liquid Glass / Midnight Glass，Clear v2**。macOS 灵感的中性纯色背景、高透明玻璃与按压回弹；包含跟随指针的局部反光、胶囊控件、11 个自定义细线图标与通透圆环星图。导入目录中的 `01-澄璃-浅色.mtheme.json` 或 `02-澄璃-深色.mtheme.json`；玻璃与交互效果需要随本工作区更新的程序。目录附实际效果截图、使用说明和构建源文件。

- `deepfield.mtheme.json` / `deepfield/`：**远星航图 · Deepfield**。基于星图接口 v2 制作的完整宇宙主题包，文献呈现为四向光芒冷白恒星，关联节点呈现为暖金带环行星，搭配蓝紫双色星云与远景星野。可直接导入 `deepfield.mtheme.json`，或在 `deepfield/` 文件夹查看使用说明、精简 CSS 与实际效果截图。
- `buaa-blue.mtheme.json` / `buaa-blue.css`：**北航蓝 · 空天**。北航专属定制主题，包含官方校徽、校名矢量图标、航空航天深蓝调色板与晶格星图形态。
- `blueprint.mtheme.json`：**工程蓝图 · Blueprint**。直接从「主题与字体 → 导入主题包 / CSS」导入，预览后应用。包含真实等宽字体、自定义助手图标和技术式 UI。
- `blueprint-source/`：同一主题的可编辑源文件夹，含 manifest、字体、图标图形和字体许可。
- `SOURCE-CODE-PRO-LICENSE.md`：字体分发许可。

完整格式与字段范围见程序旁的 `THEMES.md` 与 `GRAPH_THEME_API.md`。此示例的字体包含西文与数字；中文由微软雅黑等后备字体显示。

- [命运石之门 · 世界线](steins-gate/README.md)：内置双模式玻璃主题，官网原图与橙青星芒节点，附可独立导入的完整包。

- `codex.mtheme.json`：苹方简体 Codex 雾白工作台，浅色／深色双模式与统一玻璃界面。
- `codex-source-han.mtheme.json`：保留的思源黑体版本。

- [Claude · 灰白](claude-paper/README.md) 结合 Claude 手机端参考截图与 Anthropic 官方品牌配色，提供暖灰白与墨黑双模式、仅用于品牌标识的陶土橙、Lora 英文衬线及中文黑体。
