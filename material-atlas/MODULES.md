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

## 独立桌面服务

大文件或本机计算需要额外服务时，在 `desktop/modules/index.mjs` 登记 `{id, create(root)}`，并在前端描述中设置 `desktopStorage: true`。返回的存储对象实现 `root`、`load()`、`save(state)` 和 `queue`。

通用 `modules:load/save` 桥接会按已注册 ID 分发，并检查文献库标识；新功能无需新增 `main.mjs` 或 `preload.cjs` 的专属通道。预测模块是现有实例。

## 停用与移除

“设置 → 功能管理”可以停用材料、笔记和性能预测页面。停止前先等待保存，再释放实例、事件和样式，切回可用页面。数据保留在原文献库，重新启用后继续使用。

代码移除时，删除前端登记项与对应文件；如果有独立桌面服务，也删除它的服务登记项。不要删除用户数据文件。重新打包会自动包含当前运行目录的文件，不再维护第二份模块资源名单。

星图和文献是当前基础页面，不能在功能管理中关闭。材料、笔记已有视图暂时通过适配器接入，阅读器中的笔记服务仍是共用基础能力；本次没有声称把所有历史代码都改成独立插件。新页面和预测模块使用完整生命周期接口。

## 检查

- `node --test tests/modules.test.mjs`：生命周期、依赖、保存失败及文献库隔离。
- `node scripts/verify-module-contract.cjs`：临时登记新模块，验证自动导航、数据保存、事件清理、重新启用和删除登记项；不修改生产登记表。
- `node scripts/verify-prediction.cjs`：验证实际预测模块停用、重启、恢复后仍保留模型和数据。
- `npm run check`：递归检查模块子目录的语法。
- 打包会校验相对依赖，缺失模块文件会明确报错。
