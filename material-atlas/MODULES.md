# Materia 功能模块

工作区页面由 `dist/modules/index.js` 登记。顶部导航、快捷操作、页面容器、启用状态和打包资源都从登记信息生成。`dist` 是当前应用实际维护的前端源码，不是另一个构建系统的临时输出。

## 添加一个页面

创建 `dist/modules/my-feature.js`，在 `dist/modules/index.js` 导入并加入 `WORKSPACE_MODULES`。不需要修改 `app.js`、主 HTML、快捷操作列表或打包文件清单。

```js
export const myFeature = {
  id: 'my-feature',
  label: '新功能',
  title: '新功能',
  icon: 'chart',
  panelId: 'my-feature-panel',
  styles: [new URL('./my-feature.css', import.meta.url).href],
  async create(context) {
    let payload = await context.services.load();
    let state = payload.state || { count: 0 };
    let pending = Promise.resolve();

    function render() {
      context.host.replaceChildren();
      const button = document.createElement('button');
      button.textContent = String(state.count);
      context.host.append(button);
    }

    context.on(context.host, 'click', () => {
      state.count += 1;
      const snapshot = structuredClone(state);
      pending = pending.then(() => context.services.save({
        libraryKey: payload.libraryKey,
        state: snapshot,
      }));
      render();
    });

    return {
      render,
      flush: () => pending,
      async reset() {
        payload = await context.services.load();
        state = payload.state || { count: 0 };
      },
      dispose() {
        // Stop this feature's workers, observers and external resources here.
      },
    };
  },
};
```

`styles` 可省略。使用自己的目录组织页面、数据逻辑、计算 worker、样式和测试。不要让主程序直接导入模块实现。

## 接口与职责

- `create(context)`：首次进入时创建一次，可以动态导入较大的实现。模块停用后重新进入会重新创建。
- `render()`：显示或刷新自己的页面。
- `flush()`：等待保存；仍在训练等不能安全退出时应抛出明确错误。停用、切换文献库和退出会等待它。
- `reset()`：文献库切换后清理旧状态，重新读取当前库。不要把旧库的草稿写到新库。
- `dispose()`：停止 worker、计时器、观察器等资源。通过 `context.on()` 注册的事件和模块样式由宿主统一移除。

`context.host` 是页面容器；`context.getPapers()` 提供文献快照；`toast`、`saveText`、`setCount` 是通用界面服务。普通模块的 `services.load/save` 使用 `module:<id>` 独立命名空间。预测模块保留已有的独立文件存储，升级不迁移或删除用户数据。

`requires: ['another-module']` 可声明模块依赖。依赖会先初始化，启用时自动补齐；仍被其他功能依赖的模块不能单独停用。重复标识、未知依赖和循环依赖会在登记时明确报错。

默认是独立页面，不展示文献筛选器和文献详情。确实使用全库筛选的已有页面可声明 `libraryView: true`。`bodyClass` 只用于确实需要页面专属布局的情况，停用时宿主会清理。

使用 `parentView` 将页面归入一个主视图。性能预测通过材料页的入口打开，并沿用「材料」的标签选中状态。页面的存储和生命周期仍由模块登记管理。

## Beta 测试

实验功能放在 `dist/modules/beta/<功能标识>/`，在 `dist/modules/beta/index.js` 的 `betaExperiments` 中登记模块描述。每项功能使用独立的 `id`、`panelId` 和 `create(context)`，需要时可在 `create` 中动态导入实现。Beta 页面自动列出已启用的实验功能。功能可单独停用，移除时删除对应登记项及实现目录。转为正式功能时，可沿用原 `id` 并将描述移到正式模块登记表，已有模块数据仍可读取。

模块描述中的 `navigation: 'ribbon'` 可将独立页面入口放在左侧图标栏。

尚未实现的功能可先在 `betaPlans` 中登记为文案。接入实现后，移除对应计划文案并在 `betaExperiments` 中登记模块。

## 引文交叉图谱

从桌面版或网页预览的「研读 → 引文交叉」进入。支持勾选多篇已录入文献（或按文件夹分组批量选择、同步文献列表勾选）作为种子，实时检索 OpenAlex 参考文献（当刚发表的新文献尚无 OpenAlex 引文记录时自动扫本地 PDF 参考文献页兜底），并与当前文献库及阅读状态双向交叉，突出展示多篇文献共同引用但尚未入库或仍在「未读」状态的文献。支持在详情面板直接打开本地 PDF、切换阅读状态、复制 BibTeX 或导出未看共引清单，无需安装 Python 或额外服务。

## 独立桌面服务

大文件或本机计算需要额外服务时，在 `desktop/modules/index.mjs` 登记 `{id, create(root)}`，并在前端描述中设置 `desktopStorage: true`。返回的存储对象实现 `root`、`load()`、`save(state)` 和 `queue`。

通用 `modules:load/save` 桥接会按已注册 ID 分发，并检查文献库标识；新功能无需新增 `main.mjs` 或 `preload.cjs` 的专属通道。预测模块是现有实例。

## 研读

从桌面版左侧图标工具栏的「研究 → 研读」进入。左侧可按标题、DOI 或作者搜索当前文献库的 PDF。选择文献和处理方式后即可运行。预设菜单可新建预设，旁边的铅笔可修改当前预设。正文预设可指定起止页。逐图预设按 Figure、Fig. 或「图」编号图注及临近图形定位，也可补录。图号和原文图注放在左侧原图下方，右侧整列显示可独立滚动的 AI 解读。可用滚轮缩放原图，放大后按住右键拖动。看图时，在报告下方的「继续追问」输入问题会自动附上当前原图，也可以在问题中指定其他图号。

「研读」中的创新性和局限性时间线按发表年份展示两类条目，并标明每条的类型。点击「筛选文献」可在时间线内打开文献筛选设置。自动归类使用本地关键词，仅处理能匹配到一个方向的条目。

「论文导图与逐图证据」提供研究速览、交互式导图和逐图证据。研究速览按 PDF 目录或正文小标题的原名、顺序和层级逐节概括，并标出原文页码。识别不到小标题时按页码分段。交互式导图从左往右展开章节和小节，支持方向键切换，右侧显示章节详情。点击相关图号在当前章节下展开原图。工作室会复用同一篇文献已有的逐图解读。生成期间可点击「停止生成」取消当前请求。

处理方式旁的「＋」用于新建预设。可以分别选择组合流程、仅导图、仅逐图或按页处理正文；组合流程的导图指令和逐图指令可分开填写。逐图解读约束为每个子图一小段。图解旁的刷新按钮只重做当前一幅图。点击生成的文字可以就地编辑，点到别处或按 Ctrl+Enter 保存到 Markdown 与 HTML 报告，按 Esc 取消。

右上角「Aa」打开文字显示设置。可选择研读页字体，并分别设置工具栏、文献列表、研究速览、导图、图注、图解、正文和追问的字号。留空跟随主题，保存后重开仍生效。

「AI 工作室库」按「文献名 / 方案编号与名称 / 运行编号」归档，例如「文献名 / 003论文导图与逐图证据 / 001」。方案编号在创建时固定，修改方案名或文件夹名称后的文字还能按编号识别。每次运行单独保存；删除某次运行后，编号继续递增。双击 `报告.html` 可在浏览器里离线阅读排版后的报告，`报告.md` 保留源文本。重新选择文献和方案会加载最近的报告和已保存的追问，打开旧报告时也会补生成 HTML。

在 Materia「设置 → AI 服务」配置连接和模型。AI 工作室、研究助手、笔记 AI 编辑及阅读翻译使用同一份配置。逐图处理需要支持图片的模型。选择「本地反重力」时，保持已登录的 Antigravity 桌面客户端打开即可发送原图，模型留空时会自动选择支持图片的模型。图解结合图注、图相关段落和全篇文本，长文档使用带页码的分布抽样。API 密钥可仅在本次运行使用，或由系统加密保存。处理预设独立保存在 Materia 用户配置目录。

工作室依赖 Python 3.10+ 和 `desktop/literature-workbench/requirements.txt` 中的 PyMuPDF。Windows 会优先使用 `%LOCALAPPDATA%\LiteratureWorkbench\venv\Scripts\python.exe`，其他平台默认使用 `python3`。可将 `MATERIA_WORKBENCH_PYTHON` 指向已经安装依赖的 Python 解释器。

## 停用与移除

“设置 → 功能管理”可以停用材料、笔记、性能预测和绘图页面。停止前先等待保存，再释放实例、事件和样式，切回可用页面。数据保留在原文献库，重新启用后继续使用。绘图方案与项目的使用方法见 [FIGURA.md](FIGURA.md)。

代码移除时，删除前端登记项与对应文件；如果有独立桌面服务，也删除它的服务登记项。不要删除用户数据文件。重新打包会自动包含当前运行目录的文件，不再维护第二份模块资源名单。

星图和文献是当前基础页面，不能在功能管理中关闭。材料、笔记已有视图暂时通过适配器接入，阅读器中的笔记服务仍是共用基础能力；本次没有声称把所有历史代码都改成独立插件。新页面和预测模块使用完整生命周期接口。

## 检查

- `node --test tests/modules.test.mjs`：生命周期、依赖、保存失败及文献库隔离。
- `node scripts/verify-module-contract.cjs`：临时登记新模块，验证自动导航、数据保存、事件清理、重新启用和删除登记项；不修改生产登记表。
- `node scripts/verify-prediction.cjs`：验证实际预测模块停用、重启、恢复后仍保留模型和数据。
- `npm run check`：递归检查模块子目录的语法。
- 打包会校验相对依赖，缺失模块文件会明确报错。
