# 星图主题接口 v3（兼容 v1/v2）

## v3 扩展：主题自带矢量图形

当前程序的 `graphThemeVersion` 为 `3`。旧版 v1/v2 主题包与 CSS 继续使用原有字段；包的 `schemaVersion` 保持 `2`。新增的 `symbol` 形态用于任何主题的原创图形，不根据名称或内置 ID 开启。

```json
{
  "format": "materia-theme",
  "schemaVersion": 2,
  "name": "任意自定义图形主题",
  "graph": { "nodeShape": "symbol", "relationShape": "circle", "background": "plain" },
  "assets": {
    "fonts": [],
    "graphSymbols": {
      "node": [
        {"tag":"rect","attrs":{"x":7,"y":0,"width":10,"height":24,"fill":"#fff8e8","stroke":"theme-accent","stroke-width":1}},
        {"tag":"path","attrs":{"d":"M12 4V20M9 9H15","fill":"none","stroke":"theme-accent","stroke-width":1}}
      ]
    }
  }
}
```

`assets.graphSymbols.node`、`relation`、`background` 各自为最多 32 个 SVG 图形的数组；对应 `graph.nodeShape`、`relationShape`、`background` 设为 `symbol` 时必须提供资源。使用与图标相同的 24×24 坐标，中心为 (12,12)。节点按主题节点大小缩放，点击区域、标签避让与连线留白包含图形外缘；背景以低透明度居中显示，不参与力学或点击。

支持 path、rect、circle、ellipse、line、polyline、polygon 及原有图标几何属性。填色、描边只接受十六进制颜色、`none`、`currentColor` 或 `theme-accent`、`theme-ink`、`theme-warning`、`theme-paper`、`theme-canvas` 语义色。脚本、事件、外部资源和任意 CSS 均拒绝。图形资源参与完整包预览、保存、导出和重启恢复。

内置博丽灵梦两款采用此接口，源数据为 `dist/reimu-presets.js`，也是之后制作新包的例子。仅导出 CSS 时，自定义图形退为方形／圆形与纯色背景；完整图形需使用 JSON 包。导入新包需具备 v3 图形能力的程序，旧包无需转换。

以下保留 v2 接口说明。

Materia 1.4.5 起，主题包可配置恒星、带环行星、程序生成的星野与星云。使用现有「主题与字体 → 导入主题包 / CSS」即可导入，无需安装插件。主题包仍为 `format: "materia-theme"`、`schemaVersion: 2`；桌面能力接口 `materiaDesktop.info().graphThemeVersion` 为 `2`。

旧主题包、CSS 主题与内置主题继续可用。升级后的程序可以读写全部字段；带新增字段的包需要新版程序。程序运行过程中升级文件后，应退出并重新打开，以同时加载新的界面与本地存储接口。

## 最小完整包

任意主题名称都能使用这些功能，不按名称或内置 ID 开启效果。

```json
{
  "format": "materia-theme",
  "schemaVersion": 2,
  "name": "我的深空航图",
  "tokens": {
    "--canvas": "#060b19",
    "--paper": "#080e1d",
    "--surface": "#111b30",
    "--panel": "#18243b",
    "--sidebar": "#0b1325",
    "--ink": "#e7efff",
    "--muted": "#a2b4d0",
    "--line": "#30425e",
    "--teal": "#c8e1ff",
    "--teal-light": "#233754",
    "--on-accent": "#0c1c30",
    "--warning": "#efc98d",
    "--theme-mode": "dark"
  },
  "graph": {
    "nodeShape": "star",
    "relationShape": "planet",
    "nodeFill": "solid",
    "colorMode": "accent",
    "background": "nebula",
    "glow": 5,
    "edgeStyle": "straight",
    "edgeOpacity": 0.3,
    "starDensity": 1.2,
    "starOpacity": 0.65,
    "starColor": "#d5e6ff",
    "nebulaIntensity": 0.7,
    "nebulaColor": "#7354ba",
    "nebulaColorSecondary": "#247f9b",
    "orbitScale": 1.8,
    "orbitTilt": 28,
    "twinkle": "subtle",
    "seed": 214
  }
}
```

完整 UI、图标和字体资源可继续按 [THEMES.md](THEMES.md) 添加。上面的配置仅演示星图接口。

## 新增字段

| JSON `graph` 字段 | CSS 变量 | 范围 / 含义 |
| --- | --- | --- |
| `nodeShape` / `relationShape` | `--graph-node-shape` / `--graph-relation-shape` | 新增 `star`（四向衍射光芒、亮核及光晕）、`planet`（有明暗面的球体、倾斜前后光环） |
| `background` | `--graph-background` | 新增 `stars`（星野）、`nebula`（星野与双色星云） |
| `starDensity` | `--graph-star-density` | 0–2；默认 1，最多 520 颗装饰星，0 为无星 |
| `starOpacity` | `--graph-star-opacity` | 0–1；默认 0.55 |
| `starColor` | `--graph-star-color` | 颜色；默认 `#cfe3ff` |
| `nebulaIntensity` | `--graph-nebula-intensity` | 0–1；默认 0.5，0 关闭星云雾气 |
| `nebulaColor` | `--graph-nebula-color` | 主星云颜色；默认 `#6553ab` |
| `nebulaColorSecondary` | `--graph-nebula-color-secondary` | 辅星云颜色；默认 `#257c9b` |
| `orbitScale` | `--graph-orbit-scale` | 1.2–2.6；行星光环相对节点基础半径，默认 1.65 |
| `orbitTilt` | `--graph-orbit-tilt` | 0–180 度；光环逆时针倾角，默认 25 |
| `twinkle` | `--graph-twinkle` | `off` / `subtle`；默认关闭，只影响部分背景星 |
| `seed` | `--graph-seed` | 0–65535 的整数；默认 42，相同数值生成相同星野 |

原有圆形、菱形、六边形、方形、填充、连线、网格、文字、光晕等字段保留，范围见 [THEMES.md](THEMES.md)。颜色接受十六进制、rgb/rgba、hsl/hsla；`auto` 使用主题的对应颜色。JSON 数值不带单位，CSS 中 `--graph-glow` 仍带 `px`。JSON 的 `graph` 对明确填写的项目优先于 `tokens`。

## CSS 主题同样支持

```css
/* @name: 深空星野 */
:root {
  --canvas: #060b19;
  --teal: #c8e1ff;
  --warning: #efc98d;
  --graph-node-shape: star;
  --graph-relation-shape: planet;
  --graph-background: nebula;
  --graph-color-mode: accent;
  --graph-star-density: 1.2;
  --graph-nebula-intensity: 0.7;
  --graph-orbit-scale: 1.8;
  --graph-orbit-tilt: 28;
  --graph-glow: 5px;
  --graph-twinkle: subtle;
}
```

## 行为约定

- 图形由同一渲染器按已校验配置生成。主题不携带脚本、任意 HTML、远程图片或可执行扩展。
- 背景星与星云是装饰，不代表文献，不参与点击、标签避让、关联统计或力学模拟。背景不会随节点拖动而生成额外关系。
- 文献节点与关联节点可独立选形；行星光环会计入连线端点、点击范围与标题避让。切换主题保留坐标、固定状态、缩放与视图中心。
- 手动「宇宙星野」方案可试用新形态；完整体验请用主题包，并将「星图形态」设为「跟随主题包」。手动方案不会被写回导出的主题设计。
- 背景静态生成并复用；最多 520 颗星，仅部分星缓慢闪烁。暂停布局、拖动以及系统「减少动态效果」会暂停或关闭闪烁。
- 导入预览可取消；保存、重新打开、完整主题包导出及 CSS 导出均保留新字段。旧主题缺少字段时保持旧有外观。
## 星芒节点与官方图片（星图 API v5）

`graph.nodeShape` / `relationShape` 可设为 `nova`：亮核、分层光晕、细光环与四方向放射线。`graph.nodeColor`、`relationColor` 接受颜色或 `auto`，在 `colorMode: "accent"` 下分别控制文献和关联节点。纯色背景可与星芒独立搭配，光效不修改关联关系、位置或拖动行为。

`assets.artwork` 可包含 `logo`、`portrait` 两张内嵌位图。每项填写 `{mime, data, source, credit, alt}`，只允许 PNG/JPEG/WebP Base64，单张 3 MB，合计 6 MB，尺寸上限 8192 像素。运行时只从内嵌数据解码；导出和导入完整包会保留图片及来源，不要求特定主题 ID。图片在主题预览和局部品牌栏显示，不作为壁纸。
