export const innovationSeaModule = {
  id: 'innovation-sea',
  label: '创意之海',
  title: '创意之海',
  icon: 'flask',
  panelId: 'innovation-sea',
  styles: [new URL('./workspace.css', import.meta.url).href],
  async create(context) {
    const {createInnovationSea} = await import('./workspace.js');
    return createInnovationSea(context);
  },
};
