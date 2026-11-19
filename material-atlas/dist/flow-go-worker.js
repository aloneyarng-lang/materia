import {rankGoMoves} from './flow-go-engine.js';

self.addEventListener('message',({data}) => {
  try { self.postMessage(rankGoMoves(data)); }
  catch { self.postMessage(null); }
});
