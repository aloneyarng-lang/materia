export const figuraModule = {
  id:'figura', label:'绘图', title:'科研绘图', icon:'chart', panelId:'figura-workspace',
  desktopStorage:true,
  styles:[new URL('../figura/workspace.css', import.meta.url).href],
  async create(context) {
    const {createFiguraController} = await import('../figura/controller.js');
    return createFiguraController(context, globalThis.materiaDesktop);
  },
};
