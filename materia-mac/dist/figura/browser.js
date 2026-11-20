import {preparePlot, validateScheme} from './model.js';

const bundled = new URL('./schemes/', import.meta.url);

async function resource(url) {
  const response = await fetch(url);
  if (!response.ok) throw Error('无法加载绘图方案资源。');
  return response;
}

export async function browserCatalog() {
  const ids = await (await resource(new URL('./schemes/catalog.json', import.meta.url))).json();
  return Promise.all(ids.map(async id => {
    const manifest = await (await resource(new URL(id + '/manifest.json', bundled))).json();
    const scheme = validateScheme(manifest, id);
    return {...scheme, coverURL:new URL(id + '/' + scheme.cover, bundled).href, samples:['example.csv']};
  }));
}

export async function browserSample(scheme, filename) {
  return (await resource(new URL(scheme.id + '/' + filename, bundled))).text();
}

export function browserPlot(scheme, draft) {
  const input = preparePlot(scheme, draft);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./plot-worker.js', import.meta.url), {type:'module'});
    const timer = setTimeout(() => finish(Error('绘图超时，请检查方案或减少数据。')), 10000);
    function finish(error, svg) {
      clearTimeout(timer);
      worker.terminate();
      if (error) reject(error);
      else resolve(svg);
    }
    worker.onmessage = ({data}) => finish(data.error ? Error(data.error) : null, data.svg);
    worker.onerror = event => finish(Error(event.message || '方案依赖无法加载。'));
    worker.postMessage({url:new URL(scheme.id, bundled).href, input});
  });
}
