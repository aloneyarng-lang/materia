const namespace = 'http://www.w3.org/2000/svg';
const elements = new Set('svg g path rect circle ellipse line polyline polygon text tspan title desc defs clipPath linearGradient radialGradient stop'.split(' '));
const localReference = /^url\(#[a-z_][\w.-]*\)$/i;
export const svgLimit = 12 * 1024 * 1024;

export function parseSVG(source, {width, height}) {
  if (typeof source !== 'string' || source.length > svgLimit || /<!DOCTYPE/i.test(source)) throw Error('绘图结果无效或过大。');
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml'), root = doc.documentElement;
  if (doc.querySelector('parsererror') || root.localName !== 'svg' || root.namespaceURI !== namespace) throw Error('方案没有生成有效的 SVG。');
  const pixels = value => Number(String(value).replace(/px$/, ''));
  const viewBox = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (pixels(root.getAttribute('width')) !== width || pixels(root.getAttribute('height')) !== height
      || !viewBox || viewBox.length !== 4 || viewBox[0] !== 0 || viewBox[1] !== 0 || viewBox[2] !== width || viewBox[3] !== height) {
    throw Error('SVG 的画布尺寸与方案参数不一致。');
  }
  for (const element of doc.querySelectorAll('*')) {
    if (element.namespaceURI !== namespace || !elements.has(element.localName)) throw Error('SVG 含不支持的元素：' + element.localName);
    for (const attribute of element.attributes) {
      if (/^(?:on|style$)|href|^xml:base$/i.test(attribute.name)
          || /url\s*\(/i.test(attribute.value) && !localReference.test(attribute.value)) throw Error('SVG 含外部资源或活动内容。');
    }
  }
  return root;
}

export function sanitizeSVG(source, size) {
  return new XMLSerializer().serializeToString(parseSVG(source, size));
}
