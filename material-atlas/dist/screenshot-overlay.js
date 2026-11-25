import {selectScreenshot} from './screenshot-selection.js';

const overlay = globalThis.materiaScreenshot;
overlay.receive(async ({source, guide, confirm, cancel}) => {
  try {
    const region = await selectScreenshot(source, {guide, confirm, cancel, onReady:overlay.ready});
    overlay.finish(region);
  } catch {
    overlay.finish(null);
  }
});
