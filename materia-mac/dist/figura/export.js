const maxPixels = 64000000;
const bytesOf = (length, value) => {
  const bytes = new Uint8Array(length);
  new DataView(bytes.buffer).setUint32(0, value);
  return bytes;
};

// Chromium encodes canvas PNGs at 96 DPI. Write the requested physical resolution.
function pngResolution(bytes, dpi) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunk = new Uint8Array(21), data = new DataView(chunk.buffer);
  data.setUint32(0, 9);
  chunk.set([112, 72, 89, 115], 4); // pHYs
  const perMeter = Math.round(dpi / 0.0254);
  data.setUint32(8, perMeter);
  data.setUint32(12, perMeter);
  chunk[16] = 1;
  let crc = 0xffffffff;
  for (const byte of chunk.subarray(4, 17)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  chunk.set(bytesOf(4, crc ^ 0xffffffff), 17);
  const parts = [bytes.subarray(0, 33), chunk]; // signature and IHDR
  for (let offset = 33; offset < bytes.length;) {
    const end = offset + 12 + view.getUint32(offset);
    if (end > bytes.length) throw Error('PNG 编码不完整。');
    if (view.getUint32(offset + 4) !== 0x70485973) parts.push(bytes.subarray(offset, end));
    offset = end;
  }
  return new Blob(parts, {type:'image/png'});
}

export async function exportPNG(svg, {width, height}, dpi) {
  if (![96, 150, 300, 600].includes(dpi)) throw Error('PNG 分辨率不受支持。');
  const canvas = document.createElement('canvas'), w = Math.round(width * dpi / 96), h = Math.round(height * dpi / 96);
  if (w * h > maxPixels || w > 16384 || h > 16384) throw Error('PNG 尺寸过大，请降低 DPI 或减小画布。');
  canvas.width = w;
  canvas.height = h;
  const image = new Image();
  image.src = svgImage(svg);
  await image.decode();
  canvas.getContext('2d').drawImage(image, 0, 0, w, h);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw Error('PNG 生成失败。');
  return {blob:pngResolution(new Uint8Array(await blob.arrayBuffer()), dpi), width:w, height:h};
}

export const svgImage = svg => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
