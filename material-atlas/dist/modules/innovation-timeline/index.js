export const timelineModules = [
  ['combined-timeline', '创新性和局限性时间线', ['innovations', 'limitations']],
].map(([id, label, fields]) => ({
  id,
  label,
  title: label,
  panelId: id,
  parentView: 'research',
  storageKey: 'module:innovation-timeline',
  styles: [new URL('./workspace.css', import.meta.url).href],
  async create(context) {
    const {createInnovationTimeline} = await import('./workspace.js');
    return createInnovationTimeline({...context, fields, label});
  },
}));
