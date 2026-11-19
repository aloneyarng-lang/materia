import {html,msg,t} from './i18n.js';
import {icon} from './icons.js';
import {SIZE,POINTS,BLACK,WHITE,files,coordinate,createGoGame,groupAt,placement} from './flow-go-rules.js';
import {agreesWithDeadStones,rankGoMoves} from './flow-go-engine.js';

const storageKey = 'materia.flow.go';
const ruleErrors = {occupied:'此处已有棋子。',suicide:'此处是禁入点，落子后无气。',ko:'此手会使同一方即将行棋的局面重复。'};

function metalGrain() {
  const tile = document.createElement('canvas');
  tile.width = tile.height = 96;
  const paint = tile.getContext('2d');
  const image = paint.createImageData(tile.width,tile.height);
  let seed = 718;
  for (let index = 0; index < image.data.length; index += 4) {
    seed = (Math.imul(seed,1664525) + 1013904223) >>> 0;
    const tone = seed >> 31 ? 220 : 18;
    image.data[index] = image.data[index + 1] = image.data[index + 2] = tone;
    image.data[index + 3] = (seed >>> 20) & 19;
  }
  paint.putImageData(image,0,0);
  return tile.toDataURL();
}

function drawGrid(canvas) {
  const size = canvas.width, step = size / SIZE, first = step / 2, last = size - first;
  const ink = canvas.getContext('2d');
  const texture = ink.createImageData(size,size);
  let seed = 6967;
  for (let y = 0; y < size; y++) {
    const warm = 205 + 15 * Math.sin((y / size + .16) * Math.PI);
    for (let x = 0; x < size; x++) {
      seed = (Math.imul(seed,1664525) + 1013904223) >>> 0;
      const grain = (seed / 4294967296 - .5) * 7;
      const fibers = 2 * Math.sin(x * .09 + 3 * Math.sin(y / 231)) + 1.6 * Math.sin(x * .36 + y * .008);
      const tone = warm + 19 * Math.sin((x + y) / size * 1.35) + grain + fibers;
      const index = (y * size + x) * 4;
      texture.data[index] = tone + 11;
      texture.data[index + 1] = tone * .70;
      texture.data[index + 2] = tone * .33;
      texture.data[index + 3] = 255;
    }
  }
  ink.putImageData(texture,0,0);
  ink.strokeStyle = '#3d2512';
  ink.fillStyle = '#302012';
  ink.lineWidth = 1.45;
  ink.beginPath();
  for (let row = 0; row < SIZE; row++) {
    const offset = first + row * step;
    ink.moveTo(first,offset);
    ink.lineTo(last,offset);
    ink.moveTo(offset,first);
    ink.lineTo(offset,last);
  }
  ink.stroke();
  ink.strokeRect(first,first,last - first,last - first);
  for (const row of [3,9,15]) for (const col of [3,9,15]) {
    ink.beginPath();
    ink.arc(first + col * step,first + row * step,4.2,0,Math.PI * 2);
    ink.fill();
  }
}

function drawSignal(canvas, moves) {
  const ctx = canvas.getContext('2d');
  const {width,height} = canvas;
  ctx.clearRect(0,0,width,height);
  ctx.strokeStyle = '#9e94563b';
  ctx.beginPath();
  for (let x = 0; x <= width; x += 16) { ctx.moveTo(x,0); ctx.lineTo(x,height); }
  for (let y = 0; y <= height; y += 12) { ctx.moveTo(0,y); ctx.lineTo(width,y); }
  ctx.stroke();
  ctx.strokeStyle = '#ebc576';
  ctx.shadowColor = '#db9d49';
  ctx.shadowBlur = 7;
  ctx.beginPath();
  ctx.moveTo(0,height / 2);
  const slots = 8, step = width / slots;
  const recent = moves.slice(-slots);
  recent.forEach(({color,point,captured},index)=>{
    const x = (slots - recent.length + index) * step;
    const mid = height / 2;
    if (point === null) return;
    const amplitude = (color === BLACK ? -1 : 1) * Math.min(22,9 + captured * 3);
    ctx.lineTo(x,mid);
    ctx.lineTo(x + step * .3,mid);
    ctx.lineTo(x + step * .44,mid + amplitude);
    ctx.lineTo(x + step * .63,mid - amplitude * .32);
    ctx.lineTo(x + step * .76,mid);
  });
  ctx.lineTo(width,height / 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
}

export function createFlowGo(panel) {
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('./flow-go.css',import.meta.url).href;
  document.head.append(stylesheet);
  const dialog = document.createElement('dialog');
  dialog.className = 'flow-go';
  dialog.setAttribute('aria-label',t('和红莉栖下围棋'));
  dialog.style.setProperty('--go-grain','url(' + metalGrain() + ')');
  dialog.innerHTML = html`
    <header class="go-header">
      <div class="go-heading"><h2>STEINS;GATE</h2><span>LOCAL GO</span></div>
      <div class="go-header-tools">
        <div class="go-world"><span>WORLD LINE&nbsp; ▸</span><output data-go="world" aria-label="世界线读数"></output></div>
        <button type="button" class="go-close icon-button" data-go="close" aria-label="关闭棋局" title="关闭棋局">${icon('close')}</button>
      </div>
    </header>
    <div class="go-layout">
      <aside class="go-rail" aria-label="对局记录">
        <div class="go-rail-label">Future<br>Gadget<br>Lab.</div>
        <div class="go-rail-graphic" aria-hidden="true"><i></i><i></i><i></i></div>
        <figure class="go-scope">
          <div><canvas class="go-signal" width="144" height="72" aria-hidden="true"></canvas></div><figcaption>落子信号</figcaption>
        </figure>
        <div class="go-rail-mail"><span class="go-led" aria-hidden="true"></span>D-MAIL</div>
        <details class="go-history"><summary>棋谱 <span data-go="count"></span></summary><ol data-go="moves"></ol></details>
        <button type="button" class="go-new" data-go="new">${icon('refresh')} 新棋局</button>
        <small class="go-rule">19 路 · AGA<br>白贴 7.5 目</small>
      </aside>
      <div class="go-board-shell">
        <div class="go-file-labels" aria-hidden="true">${[...files].map(file=>`<span>${file}</span>`).join('')}</div>
        <div class="go-rank-labels" aria-hidden="true">${Array.from({length:SIZE},(_,i)=>`<span>${SIZE - i}</span>`).join('')}</div>
        <div class="go-board-surface">
          <canvas class="go-grid" width="760" height="760" aria-hidden="true"></canvas>
          <div class="go-board" role="group" aria-label="围棋棋盘"></div>
        </div>
      </div>
      <aside class="go-sidebar">
        <div class="go-players">
          <div class="go-player" data-go-player="1">
            <div class="go-seat go-seat-black" aria-hidden="true"><span>Σ</span></div>
            <div class="go-player-data"><div class="go-player-name"><i class="go-stone black" aria-hidden="true"></i><div><strong>OKABE</strong><small>你 · 黑棋</small></div></div><div class="go-player-score"><span>提子</span><b data-go="black">0</b></div><span class="go-turn-led">ON TURN</span></div>
          </div>
          <div class="go-player" data-go-player="2">
            <div class="go-seat go-seat-white" aria-hidden="true"><span></span></div>
            <div class="go-player-data"><div class="go-player-name"><i class="go-stone white" aria-hidden="true"></i><div><strong>KURISU</strong><small>红莉栖 · 白棋</small></div></div><div class="go-player-score"><span>提子</span><b data-go="white">0</b></div><span class="go-turn-led">ON TURN</span></div>
          </div>
        </div>
        <section class="go-dmail">
          <button type="button" data-go="undo"><span class="go-led" aria-hidden="true"></span><strong>D-Mail</strong><span class="go-mail-icon" aria-hidden="true"></span><span>悔棋</span></button>
          <div class="go-readout">
            <p data-go="status" role="status" aria-live="polite"></p>
            <p data-go="notice" role="status" aria-live="polite"></p>
            <div data-go="hints" class="go-hints" aria-label="候选落点"></div>
            <div data-go="count-tools" class="go-count-tools" hidden>
              <button type="button" data-go="score">提交数子</button><button type="button" data-go="resume">继续下棋</button>
            </div>
            <small data-go="mail">退回你上一手之前</small>
          </div>
        </section>
        <div class="go-commands">
          <button type="button" data-go="pass" aria-label="停一手"><strong>PASS</strong><small>停一手</small></button>
          <button type="button" data-go="resign" aria-label="认输"><strong>RESIGN</strong><small>认输</small></button>
        </div>
        <div class="go-confirm" data-go="confirm-box" hidden><p data-go="question"></p>
          <button type="button" data-go="confirm">确认</button><button type="button" data-go="cancel">取消</button>
        </div>
      </aside>
    </div>`;
  panel.append(dialog);

  const get = key => dialog.querySelector(`[data-go="${key}"]`);
  const board = dialog.querySelector('.go-board'), center = Math.floor(POINTS / 2);
  drawGrid(dialog.querySelector('.go-grid'));
  const signalDisplay = dialog.querySelector('.go-signal');
  const buttons = Array.from({length:POINTS},(_,point) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.goPoint = String(point);
    button.tabIndex = point === center ? 0 : -1;
    const mark = document.createElement('span');
    mark.setAttribute('aria-hidden','true');
    button.append(mark);
    return button;
  });
  board.replaceChildren(...buttons);

  let saved;
  try { saved = JSON.parse(localStorage.getItem(storageKey)); } catch {}
  const game = createGoGame(saved?.actions);
  let branch = Number.isSafeInteger(saved?.branch) && saved.branch >= 0 ? saved.branch % 1000000 : 0;
  let focused = center, worker, timer, generation = 0, hints = [], analyzing = false, confirmation = '';
  let marked = new Set(), notice = '', mail = '';

  function persist() {
    try { localStorage.setItem(storageKey,JSON.stringify({actions:game.history,branch})); }
    catch { notice = t('这盘棋未能保存，关闭应用前仍可继续。'); }
  }

  function render() {
    const {board:position,phase,turn,captures,last,score,winner} = game.state;
    const playerTurn = phase === 'play' && turn === BLACK;
    const moves = game.moves;
    const rank = new Map(hints.map((point,index)=>[point,index + 1]));
    for (const [point,button] of buttons.entries()) {
      const color = position[point], candidate = rank.get(point);
      button.className = 'go-point';
      if (color) button.classList.add('has-stone',color === BLACK ? 'black' : 'white');
      if (point === last) button.classList.add('last');
      if (marked.has(point)) button.classList.add('dead');
      if (candidate) button.classList.add('hint',candidate === 1 ? 'first' : 'alternative');
      button.firstChild.textContent = candidate || '';
      button.tabIndex = point === focused ? 0 : -1;
      button.setAttribute('aria-label',[coordinate(point),color ? t(color === BLACK ? '黑棋' : '白棋') : '',
        candidate ? msg`推荐第 ${candidate} 位` : '',marked.has(point) ? t('拟移除') : ''].filter(Boolean).join(' · '));
      button.setAttribute('aria-disabled',String(phase === 'scoring' ? !color : !playerTurn || analyzing || Boolean(color)));
    }
    const world = '1.' + String(branch).padStart(6,'0');
    const worldDisplay = get('world');
    if (worldDisplay.textContent !== world) {
      worldDisplay.replaceChildren(...[...world].map(digit=>{
        const cell = document.createElement('span');
        cell.className = digit === '.' ? 'go-decimal' : 'go-tube';
        cell.textContent = digit;
        return cell;
      }));
    }
    drawSignal(signalDisplay,moves);
    get('black').textContent = String(captures[BLACK]).padStart(2,'0');
    get('white').textContent = String(captures[WHITE]).padStart(2,'0');
    for (const card of dialog.querySelectorAll('[data-go-player]')) {
      card.classList.toggle('active',phase === 'play' && Number(card.dataset.goPlayer) === turn);
    }
    let status = playerTurn ? t(analyzing ? '正在分析候选落点…' : '轮到你 · 黑棋') : t('红莉栖正在思考…');
    if (phase === 'scoring') status = t('双方已停一手。点选整块死棋后提交，或继续下棋。');
    if (phase === 'finished') {
      status = score ? msg`${winner === BLACK ? t('黑棋') : t('白棋')}胜 ${score.margin} 目 · 黑 ${score.black} / 白 ${score.white}` : t('你已认输，红莉栖获胜。');
    }
    get('status').textContent = status;
    get('notice').textContent = notice;
    get('mail').textContent = mail || t('退回你上一手之前');
    get('count').textContent = String(moves.length);
    get('moves').innerHTML = moves.map(({color,point},i)=>
      `<li><span>${i + 1}</span><span>${t(color === BLACK ? '黑' : '白')}</span><b>${point === null ? t('停一手') : coordinate(point)}</b></li>`).join('');
    get('hints').replaceChildren(...hints.map((point,index)=>{
      const label = document.createElement('span');
      label.textContent = (index + 1) + '  ' + coordinate(point);
      label.title = index === 0 ? t('本地引擎首选') : t('本地引擎备选');
      return label;
    }));
    get('pass').disabled = !playerTurn;
    get('resign').disabled = phase === 'finished';
    get('undo').disabled = !game.history.some(action=>action.type === 'move' || action.type === 'pass' || action.type === 'resign');
    get('count-tools').hidden = phase !== 'scoring';
    get('confirm-box').hidden = !confirmation;
    get('question').textContent = confirmation === 'new' ? t('开始新棋局并替换当前棋谱？') : t('确认认输？');
  }

  function cancelAnalysis() {
    generation++;
    clearTimeout(timer);
    worker?.terminate();
    worker = null;
    analyzing = false;
  }

  function nextTurn() {
    cancelAnalysis();
    hints = [];
    if (game.state.phase !== 'play' || !dialog.open) {
      render();
      return;
    }
    const {board:position,turn,passes} = game.state;
    const input = {board:position,turn,passes,seen:game.seen};
    const token = generation;
    analyzing = true;
    render();
    function finish(ranked) {
      if (generation !== token || !dialog.open) return;
      cancelAnalysis();
      const legal = ranked.filter(({point})=>point === null || !placement(position,point,turn,input.seen).error);
      if (turn === BLACK) {
        hints = legal.filter(({point})=>point !== null).slice(0,3).map(({point})=>point);
        render();
      } else {
        const choice = legal[0]?.point ?? null;
        game.apply(choice === null ? {type:'pass'} : {type:'move',point:choice});
        persist();
        nextTurn();
      }
    }
    function fallback() {
      if (generation === token) finish(rankGoMoves(input,{lookAhead:false}));
    }
    try {
      worker = new Worker(new URL('./flow-go-worker.js',import.meta.url),{type:'module'});
      worker.onmessage = event => Array.isArray(event.data) ? finish(event.data) : fallback();
      worker.onerror = event => { event.preventDefault(); fallback(); };
      worker.postMessage(input);
      timer = setTimeout(fallback,1800);
    } catch { timer = setTimeout(fallback,0); }
  }

  function playerMove(action) {
    if (game.state.phase !== 'play' || game.state.turn !== BLACK) return;
    const error = game.apply(action);
    if (error) {
      notice = t(ruleErrors[error]);
      render();
      return;
    }
    notice = '';
    persist();
    nextTurn();
  }

  function choose(point) {
    if (game.state.phase !== 'scoring') {
      if (!analyzing) playerMove({type:'move',point});
      return;
    }
    const position = game.state.board;
    if (!position[point]) return;
    for (const stone of groupAt(position,point).stones) {
      if (marked.has(stone)) marked.delete(stone);
      else marked.add(stone);
    }
    notice = marked.size ? msg`已选 ${marked.size} 颗待确认的死棋` : '';
    render();
  }

  function settle(action) {
    game.apply(action);
    marked.clear();
    persist();
    nextTurn();
  }

  function close() {
    cancelAnalysis();
    confirmation = '';
    dialog.close();
  }

  dialog.addEventListener('click',event=>{
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.goPoint !== undefined) {
      focused = Number(button.dataset.goPoint);
      choose(focused);
      return;
    }
    switch (button.dataset.go) {
      case 'close': close(); break;
      case 'undo':
        if (!game.undoRound()) return;
        branch = (branch + 1) % 1000000;
        mail = t('D-Mail 已送达。已回到你上一手之前。');
        confirmation = notice = '';
        marked.clear();
        persist();
        nextTurn();
        break;
      case 'pass': playerMove({type:'pass'}); break;
      case 'score':
        if (agreesWithDeadStones(game.state.board,marked,game.seen)) {
          notice = '';
          settle({type:'score',dead:[...marked]});
        } else {
          notice = t('红莉栖对死棋有异议，继续下棋解决。');
          settle({type:'resume'});
        }
        break;
      case 'resume': notice = ''; settle({type:'resume'}); break;
      case 'new':
      case 'resign': confirmation = button.dataset.go; render(); get('confirm').focus(); break;
      case 'cancel':
        get(confirmation).focus();
        confirmation = '';
        render();
        break;
      case 'confirm':
        if (confirmation === 'new') { game.reset(); branch = 0; mail = ''; focused = center; }
        else if (confirmation === 'resign') game.apply({type:'resign',color:BLACK});
        confirmation = notice = '';
        marked.clear();
        persist();
        nextTurn();
        buttons[focused].focus({preventScroll:true});
        break;
    }
  });
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('keydown',event=>{
    event.stopPropagation();
    if (event.target.dataset.goPoint === undefined) return;
    const current = Number(event.target.dataset.goPoint);
    const row = Math.floor(current / SIZE), col = current % SIZE;
    const delta = {ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]}[event.key];
    if (!delta) return;
    event.preventDefault();
    const [newRow,newCol] = [row + delta[0],col + delta[1]];
    if (newRow < 0 || newCol < 0 || newRow >= SIZE || newCol >= SIZE) return;
    buttons[focused].tabIndex = -1;
    focused = newRow * SIZE + newCol;
    buttons[focused].tabIndex = 0;
    buttons[focused].focus({preventScroll:true});
  });
  return {
    show() {
      if (dialog.open) return;
      dialog.showModal();
      nextTurn();
      buttons[focused].focus({preventScroll:true});
    },
    hide() { if (dialog.open) close(); },
  };
}
