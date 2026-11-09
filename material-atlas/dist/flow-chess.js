import {Chess,SQUARES} from './vendor/chess/chess.js';
import {chooseChessMove} from './flow-chess-engine.js';
import {html,t} from './i18n.js';
import {icon} from './icons.js';

const glyph={k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'};
const name={k:'王',q:'后',r:'车',b:'象',n:'马',p:'兵'};
const storageKey='materia.flow.chess';

export function createFlowChess(panel){
  const dialog=document.createElement('dialog');
  dialog.className='flow-chess';
  dialog.setAttribute('aria-label',t('Flow 心流 · 国际象棋'));
  dialog.innerHTML=html`
    <header class="flow-heading">
      <div><small>FLOW · AMADEUS</small><h2>心流 · 国际象棋</h2></div>
      <button type="button" class="icon-button" data-flow="close" aria-label="关闭棋局" title="关闭棋局">${icon('close')}</button>
    </header>
    <div class="flow-layout">
      <div class="flow-board" data-flow="board" role="group" aria-label="国际象棋棋盘"></div>
      <aside class="flow-side">
        <div class="flow-player"><span class="flow-avatar" aria-hidden="true"></span><div><strong>Amadeus</strong><small>执黑 · 本地对手</small></div></div>
        <p data-flow="status" class="flow-status" role="status"></p>
        <div class="flow-promotion" data-flow="promotion" hidden>
          <strong>选择升变棋子</strong>
          <div>${['q','r','b','n'].map(type=>html`<button type="button" data-flow-promote="${type}" aria-label="${t(name[type])}">${glyph[type]}</button>`).join('')}</div>
        </div>
        <div class="flow-moves" data-flow="moves" aria-label="棋谱"></div>
        <div class="flow-tools">
          <label><span>难度</span><select data-flow="difficulty"><option value="2">轻松</option><option value="3" selected>标准</option></select></label>
          <button type="button" class="icon-button" data-flow="undo" aria-label="悔棋" title="悔棋">${icon('undo')}</button>
          <button type="button" class="icon-button" data-flow="new" aria-label="新棋局" title="新棋局">${icon('refresh')}</button>
        </div>
      </aside>
    </div>`;
  panel.append(dialog);
  const get=key=>dialog.querySelector(`[data-flow="${key}"]`),board=get('board'),game=new Chess();
  let selected='',promotion=null,worker=null,thinking=false,thinkingTimer,generation=0,focused='e2';
  try{
    const saved=JSON.parse(localStorage.getItem(storageKey)||'[]');
    if(Array.isArray(saved)&&saved.length<=512)for(const san of saved)game.move(san);
  }catch{game.reset();}

  function remember(){
    try{localStorage.setItem(storageKey,JSON.stringify(game.history().slice(0,512)));}catch{}
  }
  function stateText(){
    if(game.isCheckmate())return game.turn()==='w'?t('将死，Amadeus 获胜。'):t('将死，你赢了！');
    if(game.isStalemate())return t('逼和，棋局结束。');
    if(game.isDraw())return t('和棋，棋局结束。');
    if(promotion)return t('白兵抵达底线，请选择升变棋子。');
    if(game.turn()==='b')return t('Amadeus 正在思考…');
    return game.isCheck()?t('你被将军了 · 白方走棋'):t('轮到你 · 白方走棋');
  }
  function render(){
    const history=game.history({verbose:true}),last=history.at(-1);
    const allowed=new Set(selected?game.moves({square:selected,verbose:true}).map(move=>move.to):[]);
    const checked=game.isCheck()?game.findPiece({type:'k',color:game.turn()})[0]:null;
    board.innerHTML=SQUARES.map((square,index)=>{
      const row=Math.floor(index/8),column=index%8,piece=game.get(square);
      const label=square+(piece?' · '+t(piece.color==='w'?'白':'黑')+t(name[piece.type]):'');
      const classes=['flow-square',(row+column)%2?'dark':'light'];
      if(square===selected)classes.push('selected');
      if(square===last?.from||square===last?.to)classes.push('last');
      if(square===checked)classes.push('check');
      if(allowed.has(square))classes.push(piece?'capture':'available');
      return `<button type="button" class="${classes.join(' ')}" data-square="${square}" tabindex="${square===focused?0:-1}" aria-label="${label}" aria-pressed="${square===selected}">
        ${column===0?`<small class="flow-rank">${square[1]}</small>`:''}
        ${row===7?`<small class="flow-file">${square[0]}</small>`:''}
        ${piece?`<span class="flow-piece ${piece.color}" aria-hidden="true">${glyph[piece.type]}</span>`:''}
      </button>`;
    }).join('');
    get('status').textContent=stateText();
    get('promotion').hidden=!promotion;
    get('undo').disabled=!history.length;
    const moves=get('moves');
    moves.innerHTML=history.reduce((rows,move,index)=>{
      if(index%2===0)rows.push([`<span>${index/2+1}.</span>`,`<b>${move.san}</b>`]);
      else rows.at(-1).push(`<b>${move.san}</b>`);
      return rows;
    },[]).map(row=>'<div>'+row.join('')+'</div>').join('')||html`<p>点击白棋，再点高亮格走棋。</p>`;
    moves.scrollTop=moves.scrollHeight;
  }
  function cancelThinking(){
    generation++;
    clearTimeout(thinkingTimer);
    worker?.terminate();worker=null;thinking=false;
  }
  function computerMove(){
    if(thinking||!dialog.open||game.turn()!=='b'||game.isGameOver())return;
    const turn=++generation,fen=game.fen(),depth=Number(get('difficulty').value);
    thinking=true;
    function finish(move){
      if(turn!==generation)return;
      cancelThinking();
      if(!dialog.open||game.fen()!==fen)return;
      try{game.move(move||game.moves()[0]);}catch{
        const legal=game.moves()[0];
        if(legal)game.move(legal);
      }
      const restore=board.contains(document.activeElement);
      remember();render();
      if(restore)board.querySelector(`[data-square="${focused}"]`)?.focus({preventScroll:true});
    }
    const fallback=()=>{
      if(turn!==generation)return;
      let move;
      try{move=chooseChessMove(fen,2,100);}catch{}
      finish(move);
    };
    try{
      worker=new Worker(new URL('./flow-chess-worker.js',import.meta.url),{type:'module'});
      worker.onmessage=event=>event.data.move?finish(event.data.move):fallback();
      worker.onerror=event=>{event.preventDefault();fallback();};
      worker.postMessage({fen,depth});
      thinkingTimer=setTimeout(fallback,2000);
    }catch{thinkingTimer=setTimeout(fallback,0);}
  }
  function play(move){
    game.move(move);
    selected='';promotion=null;
    remember();render();computerMove();
    board.querySelector(`[data-square="${focused}"]`)?.focus({preventScroll:true});
  }
  function choose(square){
    if(thinking||promotion||game.turn()!=='w'||game.isGameOver())return;
    focused=square;
    const legal=selected?game.moves({square:selected,verbose:true}).filter(move=>move.to===square):[];
    if(legal.length){
      if(legal[0].promotion){
        promotion={from:selected,to:square};
        render();get('promotion').querySelector('button').focus();
      }else play(legal[0]);
      return;
    }
    selected=game.get(square)?.color==='w'&&selected!==square?square:'';
    render();board.querySelector(`[data-square="${focused}"]`)?.focus({preventScroll:true});
  }
  dialog.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.square)choose(button.dataset.square);
    if(button.dataset.flowPromote&&promotion)play({...promotion,promotion:button.dataset.flowPromote});
    if(button.dataset.flow==='close')dialog.close();
    if(button.dataset.flow==='new'){
      cancelThinking();game.reset();selected='';promotion=null;focused='e2';remember();render();
    }
    if(button.dataset.flow==='undo'){
      cancelThinking();
      if(!promotion){do{game.undo();}while(game.turn()!=='w'&&game.history().length);}
      selected='';promotion=null;remember();render();
    }
  });
  dialog.addEventListener('close',cancelThinking);
  dialog.addEventListener('keydown',event=>{
    event.stopPropagation();
    const square=event.target.dataset.square;
    const offsets={ArrowUp:-8,ArrowDown:8,ArrowLeft:-1,ArrowRight:1};
    const offset=offsets[event.key];
    if(!square||!offset)return;
    event.preventDefault();
    const next=SQUARES[SQUARES.indexOf(square)+offset];
    if(next){
      event.target.tabIndex=-1;focused=next;
      const target=board.querySelector(`[data-square="${next}"]`);
      target.tabIndex=0;target.focus({preventScroll:true});
    }
  });
  return {
    show(){
      render();
      if(!dialog.open)dialog.showModal();
      computerMove();
    },
  };
}
