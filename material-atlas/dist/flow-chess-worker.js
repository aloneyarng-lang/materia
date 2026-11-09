import {chooseChessMove} from './flow-chess-engine.js';

self.onmessage=({data})=>{
  try{self.postMessage({move:chooseChessMove(data.fen,data.depth)});}
  catch{self.postMessage({move:null});}
};
