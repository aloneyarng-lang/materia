export const citationAtlasModule = {
  id: 'citation-atlas',
  label: '引文交叉',
  title: '引文交叉图谱',
  panelId: 'citation-atlas',
  parentView: 'research',
  styles: [new URL('./workspace.css', import.meta.url).href],
  async create(context) {
    const { createCitationCrossWorkspace } = await import('./workspace.js');
    return createCitationCrossWorkspace(context);
  },
};
