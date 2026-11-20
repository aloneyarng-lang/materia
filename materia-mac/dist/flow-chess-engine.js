import {Chess} from './vendor/chess/chess.js';

const pieces={p:100,n:320,b:335,r:500,q:900,k:0};
const timeout=Symbol('time limit');
const movePriority=san=>Number(san.includes('#'))*8+Number(san.includes('+'))*2+Number(san.includes('x'))*3+Number(san.includes('='))*4;

function evaluation(game){
  let score=0;
  for(const [rank,row] of game.board().entries()){
    for(const [file,piece] of row.entries()){
      if(!piece)continue;
      const sign=piece.color==='w'?1:-1;
      const center=7-Math.abs(3.5-rank)-Math.abs(3.5-file);
      const advancement=piece.color==='w'?6-rank:rank-1;
      const placement=piece.type==='p'?advancement*5+center*2:piece.type==='k'?-center*2:center*5;
      score+=sign*(pieces[piece.type]+placement);
    }
  }
  return game.turn()==='w'?score:-score;
}

export function chooseChessMove(fen,depth=3,budget=720){
  const game=new Chess(fen),deadline=performance.now()+budget;
  const moves=()=>game.moves().sort((a,b)=>movePriority(b)-movePriority(a));
  const root=moves();
  if(!root.length)return null;
  function score(level,alpha,beta,ply){
    if(performance.now()>deadline)throw timeout;
    if(!level){
      if(game.isCheck()&&game.isCheckmate())return -100000+ply;
      return evaluation(game);
    }
    const options=moves();
    if(!options.length)return game.isCheck()?-100000+ply:0;
    for(const move of options){
      game.move(move);
      let value;
      try{value=-score(level-1,-beta,-alpha,ply+1);}finally{game.undo();}
      alpha=Math.max(alpha,value);
      if(alpha>=beta)break;
    }
    return alpha;
  }
  let best=root[0];
  for(let level=1;level<=depth;level++){
    let alpha=-Infinity,preferred=best;
    try{
      for(const move of [best,...root.filter(move=>move!==best)]){
        game.move(move);
        let value;
        try{value=-score(level-1,-Infinity,-alpha,1);}finally{game.undo();}
        if(value>alpha){alpha=value;preferred=move;}
      }
      best=preferred;
    }catch(error){if(error!==timeout)throw error;break;}
  }
  return best;
}
