# Materia (Amadeus) · 材料科学研究工作区

> **A Modern Materials Science Literature, Knowledge Graph & AI Research Companion Platform**
> 专为材料科学、物理与化学研究者打造的 Windows 桌面级文献工作区与智能科研平台。

---

## 📖 项目简介 (Overview)

**Materia** 是一个深度模块化、面向科研工作流的桌面级系统（基于 Electron + Node.js 构建）。它突破了传统文献管理软件（如 Zotero、EndNote）单调的列表模式，将文献、实验数据、知识图谱、绘图排版与多角色 AI 科研伴侣无缝交织在一起：

* **文献管理与星图**：自动双向文件夹同步，内容指纹防重，自然力导向星图布局与文献相似度图谱。
* **学术沉浸阅读**：逐行高亮/下划线、专注模式、四语（中/英/日/德）学术离线词典与划词 AI 翻译。
* **AI 科研伴侣 (Amadeus)**：集成牧濑红莉栖 (Kurisu)、蕾塞 (Reze)、甘雨 (Ganyu) 等多角色情境记忆网络，支持本地 GPT-SoVITS 实时语音合成与文献阅读导读。
* **Figura 论文插图蒙太奇**：专为学术论文打造的多图面板装配工作区，支持 Markdown 图表直导与矢量 SVG 输出。
* **材料机器学习预测 (ML Engine)**：内置 8 类经典回归模型、嵌套分组交叉验证（GroupKFold）与材料适用域预警。
* **全库离线笔记 Vault**：原生纯文本 Markdown 结构，离线 KaTeX 数学公式渲染与双向知识连接。

---

## ✨ 核心特性 (Key Features)

### 1. 🌌 知识星图与文献库 (Star Graph & Library)
* **双向文件夹同步**：默认监听文献库文件夹，移动、改名、新增 PDF 实时同步，保持原有的标签、笔记与实验数据。
* **自然整理布局**：多组布局平滑迭代，自动优化节点间距、标题避让与连线交叉，支持固定引脚与局部展开。
* **阅读状态与热力图**：快速标记未读 ⚪、在读 🟡、精读 🟢、归档 🟣，并在设置中按年份展示每日文献导入贡献热力图。

### 2. 📖 学术沉浸阅读器 (Academic Reader)
* **丰富阅读模式**：支持单页、双页并排、向下连续、横向滚动等多种版面，保持视口比例与完整亮度。
* **行内批注与标记**：逐行跟随文字缩放的高亮与下划线标记（按 `H` / `U` 快捷保存，`Ctrl+Z` 撤销）。
* **全离线学术词典**：内置数万条中、英、日、德材料与物理学术术语词典，零外网依赖、零 Token 消耗、即查即用。

### 3. 🤖 AI 科研伴侣系统 (Amadeus & Multi-Character AI)
* **深度角色性格与记忆**：内置 Amadeus（牧濑红莉栖）、蕾塞、甘雨三套完整角色语料体系与独立记忆库，能够跟随科研上下文持续交互。
* **本地 GPT-SoVITS 配音流水线**：解耦式本地推理架构，显存自动回收与生命周期管理，实现口型与台词流式同步播放。
* **文献朗读导读**：在阅读器中选中文献段落即可让 AI 伴侣分句解析朗读，科研更具沉浸感。

### 4. 🔬 Figura 论文插图排版 (Paper Montage)
* **科学绘图装配**：专为 SCI 论文插图设计的蒙太奇工作区，轻松完成多子图 (a, b, c, d) 布局装配。
* **Markdown 图表直接导入**：支持将 Markdown 格式的实验数据直接转化为高精矢量图表。
* **严谨学术导出**：支持无损 SVG 矢量图形与高分辨率印刷级 PNG 导出。

### 5. ⚙️ 通用材料机器学习引擎 (Materials ML Engine)
* **科学计算栈**：接入完整 Python / NumPy / SciPy / scikit-learn 环境。
* **8 类材料回归算法**：包含随机森林 (RF)、梯度提升 (GBR)、支持向量机 (SVR)、核岭回归 (KRR) 等。
* **材料专用特征工程**：支持元素成分（at.% / wt.% / mol.% / 化学计量式）与自定义工艺、相结构、计算特征提取。
* **严谨验证机制**：嵌套分组验证、留一验证、P90 经验置信区间与适用域 (Applicability Domain) 警告。

### 6. 📝 离线全库笔记 Vault (Notes Vault)
* **纯文本 Markdown 体系**：本地文件树存储，零私有格式锁定，与外部编辑器（如 VS Code、Obsidian）无缝互通。
* **离线 KaTeX 渲染**：完美呈现行内公式 $E=mc^2$ 与复杂矩阵块级公式。

---

## 💻 运行环境与要求 (Requirements)

* **操作系统**：Windows 10 / 11 (x64)
  > 注：当前版本针对 Windows 桌面体验进行了深度优化，包含特定 PowerShell / Cmd 原生脚本支持。
* **Node.js**：18.0.0 或更高版本
* **Python 环境**：Python 3.10+（用于机器学习引擎与本地语音 worker 推理）
* **语音模型包（可选）**：如需使用角色语音配音，外部 GPT-SoVITS 运行环境与模型包解压至当前用户主目录下的 `~/.materia/voice` 即可。

---

## 🚀 快速上手 (Quick Start)

### 1. 克隆仓库
```bash
git clone https://github.com/aloneyarng-lang/materia.git
cd materia
```

### 2. 安装项目依赖
进入 `material-atlas` 核心目录：
```bash
cd material-atlas
npm install
```

### 3. 本地运行与开发
```bash
# 启动 Electron 桌面应用
npm start

# 或启动本地浏览器预览服务
npm run preview
```

### 4. 自动化测试套件
项目配备了完整的自动化回归测试（共 370 项测试）：
```bash
npm test
```

### 5. 打包桌面分发程序 (EXE)
```bash
npm run build:exe
```
执行后将在 `release/` 目录生成绿色便携式 `Materia-win32-x64` 独立可执行程序文件夹。

---

## 📚 文档索引 (Documentation)

* [AI_AGENT.md](material-atlas/AI_AGENT.md)：AI 伴侣系统架构、服务配置规范与本地语音部署说明
* [FIGURA.md](material-atlas/FIGURA.md)：Figura 论文插图蒙太奇与 Markdown 图表排版指南
* [PREDICTION.md](material-atlas/PREDICTION.md)：材料机器学习性能预测引擎设计与使用要求
* [MODULES.md](material-atlas/MODULES.md)：微内核架构、模块生命周期与页面扩展开发
* [THEMES.md](material-atlas/THEMES.md)：主题包制作规范、双模式玻璃材质与视觉变量
* [CHANGELOG.md](CHANGELOG.md)：从 1.0 到 3.0 的完整版本更新日志

---

## 🛡️ 隐私与数据安全 (Privacy & Security)

* **数据私有化**：你的所有文献 PDF、实验数据、笔记及私有配置保存在本地文献库目录中，默认完全离线运行。
* **绝无后台上传**：不采集用户文献数据、不强制绑定云端账号。使用 AI 翻译或大模型对话时，仅将用户主动选择的文本发送至用户自行配置的 API 节点。
* **安全过滤**：代码仓库通过 `.gitignore` 严密排除了本地文献、个人笔记库、私有凭证与历史会话。

---

## 📄 开源许可证 (License)

本项目代码遵循 MIT 许可证开放。所附带的学术词典、字体及角色资源各自保留原作者的版权与开源许可声明（详见各资源子目录下的 LICENSE 与 README）。

## 本地启动与更新

双击项目根目录的 `Materia.exe` 启动当前安装版。请保留整个项目目录。

启动入口：`materia/Materia.exe`。这是原生 Windows 启动器，指向 `material-atlas/release/current/Materia-win32-x64/Materia.exe`。

在 `material-atlas` 中运行 `npm run cleanup` 可预览可清理的旧打包目录，运行 `npm run cleanup -- --apply` 执行清理。仅处理已识别的构建产物和旧发布目录；含个人数据、符号链接或最近一小时仍在修改的目录会跳过。请在打包、更新和程序退出后运行。

在 `material-atlas` 中运行 `npm run deploy:local`，更新 `release/current/Materia-win32-x64` 并重新生成根目录启动器。单独重建启动器可运行 `npm run build:launcher`。打包中间目录会在任务结束时自动清理；文献、笔记、设置和运行时依赖不属于清理范围。
