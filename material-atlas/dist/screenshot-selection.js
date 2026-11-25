import {NOTE_IMAGE_MAX_BYTES} from './note-model.js';

const clamp = value => Math.max(0, Math.min(1, value));

export function screenshotCrop(region, width, height) {
  if (!region || !['left', 'top', 'right', 'bottom'].every(key => Number.isFinite(region[key]))) return null;
  const x = Math.floor(clamp(region.left) * width);
  const y = Math.floor(clamp(region.top) * height);
  const right = Math.ceil(clamp(region.right) * width);
  const bottom = Math.ceil(clamp(region.bottom) * height);
  if (right - x < 2 || bottom - y < 2) return null;
  return {x, y, width: right - x, height: bottom - y};
}

export async function selectScreenshot(source, {guide, confirm, cancel, onReady}) {
  let preview = source;
  if (typeof source === 'string') {
    preview = new Image();
    preview.src = source;
    await preview.decode();
    preview.draggable = false;
    preview.alt = '';
  }
  const sourceWidth = preview.naturalWidth ?? preview.width;
  const sourceHeight = preview.naturalHeight ?? preview.height;

  const dialog = document.createElement('dialog');
  dialog.className = 'screenshot-selection';
  dialog.setAttribute('aria-label', guide);
  const toolbar = document.createElement('div');
  toolbar.className = 'screenshot-toolbar';
  const caption = document.createElement('span');
  caption.textContent = guide;
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = cancel;
  toolbar.append(caption, close);
  const selection = document.createElement('div');
  selection.className = 'screenshot-rectangle';
  selection.hidden = true;
  const actions = document.createElement('div');
  actions.className = 'screenshot-confirmation';
  actions.hidden = true;
  const accept = document.createElement('button');
  accept.type = 'button';
  accept.textContent = confirm;
  const discard = document.createElement('button');
  discard.type = 'button';
  discard.textContent = cancel;
  actions.append(discard, accept);
  dialog.append(preview, selection, toolbar, actions);
  document.body.append(dialog);
  try {
    return await new Promise(resolve => {
      let start, pointer, selected, imageFrame, previewFrame, pendingEnd;
      const point = event => ({
        x: clamp((event.clientX - imageFrame.x) / imageFrame.width),
        y: clamp((event.clientY - imageFrame.y) / imageFrame.height),
      });
      function regionAt(end) {
        return {left: Math.min(start.x, end.x), top: Math.min(start.y, end.y),
          right: Math.max(start.x, end.x), bottom: Math.max(start.y, end.y)};
      }
      function draw(region) {
        selection.style.left = imageFrame.x + region.left * imageFrame.width + 'px';
        selection.style.top = imageFrame.y + region.top * imageFrame.height + 'px';
        selection.style.width = (region.right - region.left) * imageFrame.width + 'px';
        selection.style.height = (region.bottom - region.top) * imageFrame.height + 'px';
      }
      function showSelection() {
        toolbar.hidden = Boolean(selected);
        selection.hidden = actions.hidden = !selected;
        if (!selected) return;
        draw(selected);
        const margin = 8;
        const {right, bottom, top} = selection.getBoundingClientRect();
        const {width, height} = dialog.getBoundingClientRect();
        const left = Math.max(margin, Math.min(right - actions.offsetWidth, width - actions.offsetWidth - margin));
        const below = bottom + margin;
        const y = below + actions.offsetHeight <= height - margin
          ? below : Math.max(margin, top - actions.offsetHeight - margin);
        actions.style.left = left + 'px';
        actions.style.top = y + 'px';
        accept.focus({preventScroll:true});
      }
      function stopPreview() {
        if (previewFrame != null) cancelAnimationFrame(previewFrame);
        previewFrame = undefined;
      }
      function finish(region) {
        stopPreview();
        resolve(region);
      }
      close.addEventListener('click', () => finish(null));
      discard.addEventListener('click', () => finish(null));
      accept.addEventListener('click', () => {if (selected) finish(selected);});
      dialog.addEventListener('cancel', event => {event.preventDefault(); finish(null);});
      dialog.addEventListener('pointerdown', event => {
        if (event.button !== 0 || event.target.closest('.screenshot-toolbar, .screenshot-confirmation') || pointer != null) return;
        const {width, height} = dialog.getBoundingClientRect();
        const scale = Math.min(width / sourceWidth, height / sourceHeight);
        const w = sourceWidth * scale, h = sourceHeight * scale;
        imageFrame = {x:(width - w) / 2, y:(height - h) / 2, width:w, height:h};
        pointer = event.pointerId;
        start = point(event);
        dialog.setPointerCapture(pointer);
        selection.hidden = false;
        toolbar.hidden = actions.hidden = true;
        draw(regionAt(start));
      });
      dialog.addEventListener('pointermove', event => {
        if (pointer !== event.pointerId) return;
        pendingEnd = point(event);
        if (previewFrame == null) previewFrame = requestAnimationFrame(() => {
          previewFrame = undefined;
          draw(regionAt(pendingEnd));
        });
      });
      dialog.addEventListener('pointercancel', event => {
        if(pointer !== event.pointerId)return;
        stopPreview();
        pointer = undefined;
        showSelection();
      });
      dialog.addEventListener('pointerup', event => {
        if (pointer !== event.pointerId) return;
        stopPreview();
        const region = regionAt(point(event));
        pointer = undefined;
        if ((region.right - region.left) * imageFrame.width >= 4 && (region.bottom - region.top) * imageFrame.height >= 4) {
          selected = region;
        }
        showSelection();
      });
      dialog.showModal();
      onReady?.();
    });
  } finally {
    dialog.close();
    dialog.remove();
  }
}

export async function browserScreenshot(labels) {
  const stream = await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});
  const video = document.createElement('video');
  const canvas = document.createElement('canvas');
  try {
    video.srcObject = stream;
    await video.play();
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video,0,0);
  } finally {
    stream.getTracks().forEach(track => track.stop());
    video.srcObject = null;
  }
  const region = await selectScreenshot(canvas,labels);
  const crop = screenshotCrop(region,canvas.width,canvas.height);
  if (!crop) return null;
  const result = document.createElement('canvas');
  const scale = Math.min(1,1600 / Math.max(crop.width,crop.height));
  result.width = Math.max(1,Math.round(crop.width * scale));
  result.height = Math.max(1,Math.round(crop.height * scale));
  result.getContext('2d').drawImage(canvas,crop.x,crop.y,crop.width,crop.height,0,0,result.width,result.height);
  const encode = (type, quality) => new Promise(resolve => result.toBlob(resolve,type,quality));
  let blob = await encode('image/png');
  for (const quality of [.85,.65,.5]) {
    if (blob?.size <= NOTE_IMAGE_MAX_BYTES) break;
    blob = await encode('image/jpeg',quality);
  }
  if (!blob?.size || blob.size > NOTE_IMAGE_MAX_BYTES) throw Error('无法截取当前屏幕。');
  return {blob,width:result.width,height:result.height};
}
