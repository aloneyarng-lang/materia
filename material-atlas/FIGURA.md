# Materia 科研绘图

在顶部打开「绘图」。选择方案后会显示合成示例。切到「数据」导入 CSV、TSV 或 XLSX，核对字段映射。也可以直接编辑表格或从 Excel 粘贴单元格。多工作表文件需选定工作表后应用。公式读取 Excel 保存的结果。

参数改动会刷新预览。数据有误时，预览保留上一次成功的图并显示原因。修正数据后再导出。SVG 和 PDF 为矢量，PNG 可选 96、150、300 或 600 DPI。画布尺寸以 CSS px 计，96 px 等于 1 英寸。

在预览工具栏的「主题」中选择冈部–伊藤、海蓝铜橙、矿青烟紫、朱砂靛蓝或石墨青金。系列图采用离散色组，热图和等值线使用随数值加深的顺序色阶。主题随项目保存并应用到三种导出格式。「方案原色」恢复方案及项目自带的颜色设置。配色参考 [Nature 制图指南](https://research-figure-guide.nature.com/figures/preparing-figures-our-specifications/)、[冈部–伊藤的色觉通用设计](https://jfly.uni-koeln.de/color/) 和 [Nature Communications 科学用色研究](https://www.nature.com/articles/s41467-020-19160-7)。

草稿自动保存在当前文献库。「保存项目」可创建以后重开的版本。「项目」中可打开项目、另存副本、导入独立 Figura 的单项目或 `workspace.json`，也可以备份当前项目或整个绘图工作区。导入工作区会合并项目。项目备份含数据和参数，自定义方案目录请单独备份。

## 安装新的绘图方案

点击方案栏右上角的「＋」，选择「安装方案文件夹」。也可打开自定义方案目录，放入方案后点击「重新扫描」。每个方案目录的名称须和小写字母、数字及连字符组成的 `manifest.id` 一致。每个文献库可以使用自己的自定义方案。

- `manifest.json` 声明 `id`、`apiVersion: 1`、字符串 `version`、名称、分类、说明、数据字段和参数。字段支持 `number` 和 `string`，参数支持 `number`、`text`、`color` 和 `select`。必须声明 `width` 和 `height` 数字参数。
- `plot.js` 导出 `render({data, params})`，返回自包含 SVG。根元素的 `width`、`height` 和 `viewBox` 须与画布参数一致。随包的 JavaScript 辅助文件可相对导入。
- API 1 方案可以接收可选的 `theme`，其中 `series` 为系列色组，`ramp` 为低到高的连续色阶，另有 `ink`、`axis` 和 `highlight`。已有方案的 `color`、`color2` 等颜色参数可以直接套用主题。方案写在绘图代码里的固定色由方案自身控制。
- `example.csv` 是 UTF-8 示例数据。用字段 key 作为表头可以自动匹配。可另外提供 `style-example.csv`。
- 封面使用 `cover.svg` 或清单指定的 SVG、PNG、JPEG 文件。请标注合成示例。

原 Figura 的 API 1 方案可继续使用。绘图在独立的受限环境中运行，方案无需网络、外部字体链接或 npm 依赖。安装前核对来源。项目记录所用方案的版本，恢复旧项目时可用同一版本的方案目录重新打开。
