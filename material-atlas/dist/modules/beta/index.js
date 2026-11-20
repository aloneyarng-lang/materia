const betaPlans = [];

export const betaModule = {
  id: 'beta',
  label: 'Beta 测试',
  title: 'Beta 测试',
  icon: 'flask',
  panelId: 'beta-workspace',
  navigation: 'ribbon',
  ribbonGroup: 'bottom',
  styles: [new URL('./workspace.css', import.meta.url).href],
  async create(context) {
    const {createBetaWorkspace} = await import('./workspace.js');
    return createBetaWorkspace(context, betaPlans);
  },
};
