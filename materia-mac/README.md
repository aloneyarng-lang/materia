# Materia Atlas Core · 桌面端源码与开发说明

> 完整的项目特性介绍、架构总览与使用指南请参阅 **[根目录 README.md](../README.md)**。  
> 历史版本更新演进记录请参阅 **[CHANGELOG.md](../CHANGELOG.md)**。

---

## 📁 目录组织架构 (Directory Structure)

* **`desktop/`**：Electron 主进程（Main Process）。负责原生窗口生命周期、双向本地文件夹监听同步、与外部 Python 语音/机器学习 Worker 的 IPC 进程通信、以及打包分发配置。
* **`dist/`**：前端渲染进程源码（Renderer Process）。采用原生 ESM / Vanilla JS 模块化设计，包含文献星图、阅读器、Figura 绘图排版、笔记 Vault、AI 伴侣前端交互、离线学术词典及 KaTeX 离线公式渲染。
* **`ml/`**：材料科学机器学习引擎（Python 3.10+）。包含基于 scikit-learn 的 8 类回归算法、Magpie 元素特征工程及适用域分析。
* **`scripts/`**：自动化验证与部署脚本，包含 30+ 项各功能模块的 `verify:*` 验证工具与 `build:exe` 打包脚本。
* **`tests/`**：基于 Node.js 原生测试运行器（`node --test`）的自动化单元测试与回归套件（370 项全覆盖）。
* **`theme-examples/`**：内置透明玻璃主题包与第三方主题制作模板。

---

## 🛠️ 常用开发指令 (Development Scripts)

在 `material-atlas/` 目录下执行：

```bash
# 安装依赖
npm install

# 启动 Electron 桌面应用
npm start

# 启动本地开发服务并在浏览器中预览
npm run dev
npm run preview

# 运行全套 370 项自动化回归测试
npm test

# 检查所有模块代码语法
npm run check

# 打包构建 Windows x64 独立绿色发布包
npm run build:exe

# 构建并就地部署到工作区（保留用户文献数据与配置）
npm run deploy:local
```

---

## 🎨 应用图标与视觉资产

应用图标采用浅陶土橙圆角外壳与纯白星芒，星芒采用空心核心及独立轨道点设计。
* 设计源图：`desktop/materia-icon.svg`
* 浏览器与 Web 图标：`dist/favicon.svg`
* 桌面 EXE 图标生成脚本：`desktop/icon.mjs`
* 随应用打包自动生成 16、32、48、256 像素全规格图标，核心镂空在 16 像素下保持清晰留白与透明平滑边角。

---

## 📖 核心文档直达

* [AI_AGENT.md](AI_AGENT.md)：AI 伴侣模型适配、Prompts 与本地 GPT-SoVITS 语音配置
* [MODULES.md](MODULES.md)：微内核架构、生命周期钩子与插件模块开发规范
* [PREDICTION.md](PREDICTION.md)：材料性能预测模型格式、CSV 导入与特征配置
* [FIGURA.md](FIGURA.md)：Figura 论文插图装配与 Markdown 绘图语法
* [THEMES.md](THEMES.md)：主题包制作规范与 CSS 变量系统

## 本地启动与更新

双击项目根目录的 `Materia.exe` 启动当前安装版。请保留整个项目目录。

在 `material-atlas` 中运行 `npm run deploy:local`，更新 `release/current/Materia-win32-x64` 并重新生成根目录启动器。单独重建启动器可运行 `npm run build:launcher`。打包中间目录会在任务结束时自动清理；文献、笔记、设置和运行时依赖不属于清理范围。
