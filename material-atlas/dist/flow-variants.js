const games = {
  xiangqi: {name:'中国象棋', ranks:10, pieces:{r:'车',n:'马',b:'相',a:'仕',k:'帅',c:'炮',p:'兵'}},
  shogi: {name:'日本将棋', ranks:9, pieces:{p:'步',l:'香',n:'桂',s:'银',g:'金',b:'角',r:'飞',k:'玉',
    '+p':'と','+l':'杏','+n':'圭','+s':'全','+b':'马','+r':'龙'}}
};
const opponent = {b:'象',a:'士',k:'将',p:'卒'};
const square = /[a-i](?:10|[1-9])/g;
const sessions = new Map();

function readBoard(fen, ranks) {
  const [layout, hand=''] = fen.split(' ')[0].split('[');
  const board = new Map();
  layout.split('/').slice(0,ranks).forEach((row,index) => {
    let file = 0;
    for (const token of row.match(/\d+|\+?[a-z]/gi) || []) {
      if (/^\d/.test(token)) file += Number(token);
      else board.set(String.fromCharCode(97+file++)+(ranks-index), token);
    }
  });
  return {board,hand:hand.replace(']','')};
}

export function showVariant(variant) {
  if (sessions.has(variant)) return sessions.get(variant)();
  const game = games[variant];
  if (!document.querySelector('link[data-flow-variants]')) {
    const link = document.createElement('link');
    link.rel='stylesheet'; link.href=new URL('./flow-variants.css',import.meta.url); link.dataset.flowVariants='';
    document.head.append(link);
  }
  const dialog = document.createElement('dialog');
  dialog.className = 'flow-variant '+variant;
  dialog.setAttribute('aria-label',game.name);
  dialog.innerHTML = '<header><h2></h2><button data-close aria-label="关闭">关闭</button></header><p data-status role="status"></p><div data-hand="other"></div><div class="fv-board"></div><div data-hand="own"></div><div data-choice></div><footer><button data-hint>建议</button><button data-undo>悔棋</button><button data-new>重新开局</button></footer>';
  document.body.append(dialog);
  const find = selector => dialog.querySelector(selector);
  find('h2').textContent = game.name;
  let moves=[], position, selected='', hint='', choices=[], busy=false, epoch=0;
  function name(token) {
    const key = token.toLowerCase();
    return (variant==='xiangqi' && token===key && opponent[key]) || game.pieces[key] || token;
  }
  function origin(move) { return move.includes('@') ? move.split('@')[0]+'@' : move.match(square)[0]; }
  function target(move) { return move.match(square).at(-1); }
  function describe(move) {
    if (!move) return '';
    const from=origin(move), to=target(move);
    return (from.endsWith('@') ? name(from[0])+'打入' : from+' → ')+to+(move.endsWith('+')?' 升变':'');
  }
  const button = (label,action) => {
    const b=document.createElement('button'); b.type='button'; b.textContent=label; b.onclick=action; return b;
  };
  function render() {
    const legal=position?.legal || [];
    const {board,hand}=readBoard(position?.fen || '',game.ranks);
    const grid=find('.fv-board');
    grid.replaceChildren();
    for(let rank=game.ranks;rank>=1;rank--) for(let file=0;file<9;file++) {
      const coord=String.fromCharCode(97+file)+rank, token=board.get(coord);
      const cell=button(token?name(token):'',()=>pick(coord));
      cell.setAttribute('aria-label',coord+' '+(token?name(token):'空位'));
      cell.title=coord;
      if(token) {
        cell.dataset.side=token===token.toUpperCase()?'own':'other';
        const piece=document.createElement('span');piece.textContent=name(token);cell.replaceChildren(piece);
      }
      if(selected===coord) cell.classList.add('selected');
      if(legal.some(m=>origin(m)===selected && target(m)===coord)) cell.classList.add('target');
      if(hint && [origin(hint),target(hint)].includes(coord)) cell.classList.add('hint');
      grid.append(cell);
      if(variant==='xiangqi' && rank===6 && file===8) {
        const river=document.createElement('div'); river.className='fv-river';river.textContent='楚河　　　汉界';grid.append(river);
      }
    }
    for(const side of ['own','other']) {
      const tray=find('[data-hand="'+side+'"]'); tray.replaceChildren();
      if(variant!=='shogi')continue;
      tray.append(side==='own'?'我的持驹：':'对手持驹：');
      const pieces=[...hand].filter(p=>/[a-z]/i.test(p) && (side==='own')===(p===p.toUpperCase()));
      if(!pieces.length) tray.append('无');
      for(const p of new Set(pieces)) {
        const b=button(name(p)+' ×'+pieces.filter(x=>x===p).length,()=>{selected=p+'@';choices=[];render();});
        b.disabled=busy||side==='other'||!legal.some(m=>origin(m)===p+'@');
        b.setAttribute('aria-pressed',String(selected===p+'@'));tray.append(b);
      }
    }
    find('[data-choice]').replaceChildren(...choices.map(m=>button(m.endsWith('+')?'升变':'不升变',()=>play(m))));
    find('[data-hint]').disabled=busy||!legal.length||moves.length%2!==0;
    find('[data-undo]').disabled=!moves.length;
  }
  function pick(coord) {
    if(busy || moves.length%2 || !position)return;
    const matches=position.legal.filter(m=>origin(m)===selected && target(m)===coord);
    if(matches.length===1)return play(matches[0]);
    if(matches.length>1)choices=matches;
    else {selected=selected!==coord && position.legal.some(m=>origin(m)===coord)?coord:'';choices=[];}
    render();
  }
  function play(move) { moves.push(move); resetSelection(); void update(); }
  function resetSelection(){selected='';choices=[];hint='';}
  async function update(wantHint=false) {
    const version=++epoch;
    const ai=moves.length%2===1;
    busy=true;render();
    const status=find('[data-status]');
    status.textContent=ai?'对手正在思考…':wantHint?'正在计算建议…':'正在读取棋局…';
    try {
      const api=window.materiaDesktop?.analyzeVariant;
      if(!api)throw Error('请在 Materia 桌面版中打开本地引擎');
      const next=await api(variant,[...moves],!!(ai||wantHint));
      if(version!==epoch)return;
      position=next;
      if(ai && next.best){moves.push(next.best);return update();}
      if(!next.legal.length)status.textContent=ai?'终局，你获胜。':'终局，对手获胜。';
      else if(wantHint && next.best){hint=next.best;status.textContent='建议走法：'+describe(hint);}
      else status.textContent=(variant==='xiangqi'?'你执红方':'你执先手')+' · '+(next.check?'被将军，请应将':'轮到你走棋')+(moves.length?' · 上一步 '+describe(moves.at(-1)):'');
    } catch(e) {
      if(version!==epoch)return;
      position=null;status.textContent=e.message;
    } finally {if(version===epoch){busy=false;render();}}
  }
  find('[data-close]').onclick=()=>dialog.close();
  find('[data-hint]').onclick=()=>update(true);
  find('[data-undo]').onclick=()=>{
    moves.splice(moves.length%2?moves.length-1:Math.max(0,moves.length-2));
    resetSelection();void update();
  };
  find('[data-new]').onclick=()=>{moves=[];resetSelection();void update();};
  dialog.onclose=()=>{epoch++;busy=false;};
  const open=()=>{if(!dialog.open){dialog.showModal();void update();}};
  sessions.set(variant,open);open();
}
