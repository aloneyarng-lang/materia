import {applyFigureTheme} from './schemes/figure-themes.js';

self.onmessage = async ({data}) => {
  try {
    const {render} = await import(data.url + '/plot.js');
    const svg = await render(applyFigureTheme(data.input));
    if (typeof svg !== 'string' || !svg.includes('<svg') || svg.length > 12 * 1024 * 1024) throw Error('绘图实现须返回有效且小于 12 MB 的 SVG。');
    self.postMessage({svg});
  } catch (error) {
    self.postMessage({error:error?.message || String(error)});
  }
};
