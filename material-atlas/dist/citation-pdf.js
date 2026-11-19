import {bibliography} from './citation-graph.js';
import {readPdfPages} from './pdf-text.js';

export async function readBibliography(bytes, signal) {
  const pages = await readPdfPages(bytes, signal);
  return bibliography(pages.map(page => page.text));
}
