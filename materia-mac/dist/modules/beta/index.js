// Import each experiment's module descriptor here and add it to this list.
export const betaExperiments = [];

const betaPlans = [
  '每个文献标注1-3个创新点，创新点随时间轴排布等等的概念应用',
];

export const betaModule = {
  id: 'beta',
  label: 'Beta 测试',
  title: 'Beta 测试',
  icon: 'flask',
  panelId: 'beta-workspace',
  navigation: 'ribbon',
  styles: [new URL('./workspace.css', import.meta.url).href],
  async create(context) {
    const {createBetaWorkspace} = await import('./workspace.js');
    return createBetaWorkspace(context, betaPlans);
  },
};
