import {t} from '../../i18n.js';

export function createBetaWorkspace({host,getChildViews,setCount}, plans) {
  return {
    render() {
      const experiments = getChildViews();
      setCount('');
      if (!experiments.length && !plans.length) {
        const empty = document.createElement('p');
        empty.className = 'beta-empty';
        empty.textContent = t('暂无可试用的功能。');
        host.replaceChildren(empty);
        return;
      }
      const list = document.createElement('ul');
      list.className = 'beta-experiments';
      for (const experiment of experiments) {
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'outline-button';
        button.dataset.view = experiment.id;
        button.textContent = t(experiment.label);
        item.append(button);
        list.append(item);
      }
      host.replaceChildren();
      if (experiments.length) host.append(list);
      if (plans.length) {
        const heading = document.createElement('h2');
        heading.textContent = t('计划中');
        const planned = document.createElement('ul');
        planned.className = 'beta-plans';
        for (const plan of plans) {
          const item = document.createElement('li');
          item.textContent = t(plan);
          planned.append(item);
        }
        host.append(heading, planned);
      }
    },
  };
}
