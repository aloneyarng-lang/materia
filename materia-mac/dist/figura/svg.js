const namespace = 'http://www.w3.org/2000/svg';
const elements = new Set('svg g path rect circle ellipse line polyline polygon text tspan title desc defs clipPath linearGradient radialGradient stop'.split(' '));
const localReference = /^url\(#[a-z_][\w.-]*\)$/i;
export const svgLimit = 12 * 1024 * 1024;
export const montageSvgLimit = 26 * 1024 * 1024;
const embeddedRaster = /^data:image\/(?:png;base64,iVBORw0K|jpeg;base64,\/9j\/)[a-z0-9+/]+={0,2}$/i;

export function parseStaticSVG(source, allowRaster=false) {
  if (typeof source !== 'string' || source.length > (allowRaster?montageSvgLimit:svgLimit) || /<!DOCTYPE/i.test(source)) throw Error('绘图结果无效或过大。');
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml'), root = doc.documentElement;
  if (doc.querySelector('parsererror') || root.localName !== 'svg' || root.namespaceURI !== namespace) throw Error('方案没有生成有效的 SVG。');
  for (const element of doc.querySelectorAll('*')) {
    const raster=allowRaster&&element.localName==='image';
    if (element.namespaceURI !== namespace || !elements.has(element.localName)&&!raster) throw Error('SVG 含不支持的元素：' + element.localName);
    if (raster&&!embeddedRaster.test(element.getAttribute('href'))) throw Error('SVG 图片须内嵌 PNG 或 JPEG。');
    for (const attribute of element.attributes) {
      if (raster && attribute.name==='href' && embeddedRaster.test(attribute.value)) continue;
      if (/^(?:on|style$)|href|^xml:base$/i.test(attribute.name)
          || /url\s*\(/i.test(attribute.value) && !localReference.test(attribute.value)) throw Error('SVG 含外部资源或活动内容。');
    }
  }
  return root;
}

export function parseSVG(source, {width, height}, allowRaster=false) {
  const root = parseStaticSVG(source,allowRaster);
  const pixels = value => Number(String(value).replace(/px$/, ''));
  const viewBox = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (pixels(root.getAttribute('width')) !== width || pixels(root.getAttribute('height')) !== height
      || !viewBox || viewBox.length !== 4 || viewBox[0] !== 0 || viewBox[1] !== 0 || viewBox[2] !== width || viewBox[3] !== height) {
    throw Error('SVG 的画布尺寸与方案参数不一致。');
  }
  return root;
}

export function sanitizeSVG(source, size, allowRaster=false) {
  return new XMLSerializer().serializeToString(parseSVG(source,size,allowRaster));
}
