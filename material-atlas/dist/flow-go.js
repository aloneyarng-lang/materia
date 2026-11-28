import {reportAchievement} from './flow-achievements.js';
import {getLocale,html,msg,t} from './i18n.js';
import {icon} from './icons.js';
import {SIZE,POINTS,BLACK,WHITE,files,coordinate,createGoGame,groupAt} from './flow-go-rules.js';
import {agreesWithDeadStones} from './flow-go-engine.js';
import {createGoCommentary,selectGoSpeech} from './flow-go-commentary.js';

const storageKey = 'materia.flow.go';
const ruleErrors = {occupied:'此处已有棋子。',suicide:'此处是禁入点，落子后无气。',ko:'此手会使同一方即将行棋的局面重复。'};

async function analyzeGo(actions, signal) {
  if (window.materiaDesktop?.analyzeGo) return window.materiaDesktop.analyzeGo(actions);
  const response = await fetch('/api/flow-go/analyze', {
    method: 'POST', headers: {'Content-Type':'application/json', 'X-Materia-Go':'1'},
    body: JSON.stringify(actions), signal
  });
  if (!response.ok) throw new Error('KataGo analysis failed');
  return response.json();
}

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

export function createFlowGo(panel, options = {}) {
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
        <div class="go-world"><span><b>世界线 · </b>黑棋胜率</span><output data-go="world"></output></div>
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
            <div class="go-commentary-box" data-go="commentary-box" hidden>
              <span class="go-commentary-tag">KURISU</span>
              <div class="go-commentary-stack">
                <p class="go-commentary-prev" data-go="commentary-prev" hidden></p>
                <p data-go="commentary" role="status" aria-live="polite"></p>
              </div>
              <button type="button" class="go-commentary-replay" data-go="commentary-replay" aria-label="重听红莉栖吐槽" title="重听">▶</button>
            </div>
            <div class="go-review-options">
              <label><input type="checkbox" data-go="recommend"> 推荐落点</label>
              <label><input type="checkbox" data-go="voice"> 红莉栖语音吐槽</label>
              <label><span>历史棋局</span><select data-go="archive"></select></label>
            </div>
            <div data-go="replay-tools" class="go-replay" hidden>
              <output data-go="replay-step" aria-live="polite"></output>
              <input type="range" data-go="replay-range" min="0" value="0" aria-label="复盘进度">
              <div class="go-count-tools">
                <button type="button" data-go="replay-first">开局</button>
                <button type="button" data-go="replay-prev">上一步</button>
                <button type="button" data-go="replay-next">下一步</button>
                <button type="button" data-go="replay-last">末步</button>
                <button type="button" data-go="replay-analyze">分析此步</button>
                <button type="button" data-go="replay-exit">回到对局</button>
              </div>
            </div>
            <div data-go="retry-tools" class="go-count-tools" hidden>
              <button type="button" data-go="retry">重试 KataGo</button>
            </div>
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
  let records = Array.isArray(saved?.records) ? saved.records.filter(record =>
    Number.isFinite(record?.date) && Math.abs(record.date) <= 8.64e15 &&
    Array.isArray(record.actions) && record.actions.length <= 5000) : [];
  let recommend = saved?.recommend !== false;
  let voiceEnabled = saved?.voiceEnabled !== false;
  let replay = null;
  let gameDate = Number.isFinite(saved?.gameDate) && Math.abs(saved.gameDate) <= 8.64e15 ? saved.gameDate : Date.now();
  const dateFormat = new Intl.DateTimeFormat(undefined, {dateStyle:'short',timeStyle:'short'});
  let listedRecords, listedCurrent;
  let winRate = null;
  let focused = center, analysis, hints = [], analyzing = false, analysisFailed = false, confirmation = '';
  let marked = new Set(), notice = '', mail = '';
  const commentary = createGoCommentary();
  let lastRemark = null, prevRemark = null, lastBlackWinRate = null, lastBlackHints = [], pendingBlackMove = null, prevWhitePoint = [...game.moves].reverse().find(m => m.color === WHITE)?.point ?? null, remarkEpoch = 0, hasGreeted = false;

  function deliverRemark(picked, { manual = false, moveCount = game.moves.length } = {}) {
    if (!picked || replay || !dialog.open) return;
    const state = options.getVoiceState?.() || { available: false, enabled: true, language: 'follow' };
    const spoken = picked.entry
      ? selectGoSpeech(picked.entry, state.language || 'follow', getLocale())
      : {
          id: picked.id,
          text: picked.text,
          speech: picked.speech || picked.text,
          language: picked.language || 'zh',
        };
    if (!spoken?.text) return;
    if (!manual) {
      commentary.recordSpoken({
        moveCount,
        category: picked.category || null,
        text: spoken.text,
        speech: spoken.speech,
      });
      if (lastRemark && lastRemark.text !== spoken.text) {
        prevRemark = lastRemark;
      }
    }
    lastRemark = {
      ...spoken,
      entry: picked.entry || null,
      category: picked.category || null,
      dynamic: Boolean(picked.dynamic),
    };
    render();
    if (options.speakCommentary && (manual || voiceEnabled)) {
      void options.speakCommentary({ ...spoken, manual, dynamic: Boolean(picked.dynamic) }).catch(() => {});
    }
  }

  async function deliverTurnRemark(turnContext) {
    const fallback = commentary.onTurnEvaluated(turnContext);
    if (!fallback || replay || !dialog.open) return;
    const epoch = ++remarkEpoch;
    if (typeof options.commentGo === 'function' && voiceEnabled) {
      const state = options.getVoiceState?.() || { language: 'follow' };
      try {
        const live = await Promise.race([
          options.commentGo({
            turn: { ...turnContext, categoryHint: fallback.category },
            recentDialogue: commentary.getRecentDialogue(),
            displayLocale: getLocale(),
            voiceLanguage: state.language || 'follow',
          }),
          new Promise(resolve => setTimeout(() => resolve({ ok: false, timeout: true }), 4200)),
        ]);
        if (epoch !== remarkEpoch || replay || !dialog.open) return;
        if (live?.ok && live.text) {
          deliverRemark({
            id: `live-${turnContext.moveCount}-${epoch}`,
            category: fallback.category,
            text: live.text,
            speech: live.speech || live.text,
            language: live.language,
            dynamic: true,
          }, { moveCount: turnContext.moveCount });
          return;
        }
      } catch {}
    }
    if (epoch !== remarkEpoch || replay || !dialog.open) return;
    deliverRemark(fallback, { moveCount: turnContext.moveCount });
  }

  let countedDate = game.state.phase === 'finished' ? gameDate : null;
  function persist(actions = game.history, archive = records, date = gameDate) {
    if (actions === game.history && game.state.phase === 'finished' && countedDate !== gameDate) {
      countedDate = gameDate;
      reportAchievement('flowGamesFinished', 1, 'add');
    }
    try {
      localStorage.setItem(storageKey,JSON.stringify({actions,records:archive,recommend,voiceEnabled,gameDate:date}));
      return true;
    } catch {
      notice = t('保存棋局失败。');
      return false;
    }
  }

  function updateArchive() {
    const select = get('archive');
    const current = game.history.length > 0;
    select.value = replay?.id ?? '';
    if (listedRecords === records && listedCurrent === current) return;
    listedRecords = records;
    listedCurrent = current;
    const options = [new Option(t('选择棋局复盘'), '')];
    if (current) options.push(new Option(t('当前棋局'), 'current'));
    records.forEach(({date,actions}, index)=>{
      const {state,moves} = createGoGame(actions);
      const result = state.phase === 'finished' ? (state.winner === BLACK ? t('黑胜') : t('白胜')) : t('未完局');
      const time = dateFormat.format(new Date(date));
      options.push(new Option(msg`${time} · ${moves.length} 手 · ${result}`, String(index)));
    });
    select.replaceChildren(...options);
    select.value = replay?.id ?? '';
    select.disabled = options.length === 1;
  }

  function stepReplay(index) {
    cancelAnalysis();
    hints = [];
    winRate = null;
    analysisFailed = false;
    replay.index = Math.min(replay.actions.length, Math.max(0,index));
    replay.position = createGoGame(replay.actions.slice(0,replay.index));
    render();
  }

  function showReplay(id) {
    if (!id) {
      replay = null;
      void nextTurn();
      return;
    }
    const actions = id === 'current' ? game.history : records[Number(id)]?.actions;
    if (!actions) return;
    confirmation = '';
    replay = {id,actions};
    stepReplay(0);
  }

  async function analyzeReplay() {
    const controller = analysis = new AbortController();
    analysisFailed = false;
    analyzing = true;
    render();
    try {
      const result = await analyzeGo(replay.position.history, controller.signal);
      if (controller.signal.aborted) return;
      winRate = result.winRate;
      hints = result.ranked.filter(point=>point !== null).slice(0,3);
    } catch (error) {
      if (controller.signal.aborted) return;
      console.warn('KataGo analysis failed', error);
      analysisFailed = true;
    }
    cancelAnalysis();
    render();
  }

  function render() {
    const viewed = replay?.position ?? game;
    const {board:position,phase,turn,captures,last,score,winner} = viewed.state;
    const playerTurn = !replay && phase === 'play' && turn === BLACK;
    const moves = viewed.moves;
    const visibleHints = recommend ? hints : [];
    const rank = new Map(visibleHints.map((point,index)=>[point,index + 1]));
    for (const [point,button] of buttons.entries()) {
      const color = position[point], candidate = rank.get(point);
      button.className = 'go-point';
      if (color) button.classList.add('has-stone',color === BLACK ? 'black' : 'white');
      if (point === last) button.classList.add('last');
      const dead = !replay && marked.has(point);
      if (dead) button.classList.add('dead');
      if (candidate) button.classList.add('hint',candidate === 1 ? 'first' : 'alternative');
      button.firstChild.textContent = candidate || '';
      button.tabIndex = point === focused ? 0 : -1;
      button.setAttribute('aria-label',[coordinate(point),color ? t(color === BLACK ? '黑棋' : '白棋') : '',
        candidate ? msg`推荐第 ${candidate} 位` : '',dead ? t('拟移除') : ''].filter(Boolean).join(' · '));
      button.setAttribute('aria-disabled',String(Boolean(replay) || (phase === 'scoring' ? !color : !playerTurn || Boolean(color))));
    }
    const winRateDigits = winRate === null ? null : Math.round(winRate * 10000);
    const world = winRateDigits === null ? '-------' : String(winRateDigits).padStart(7,'0');
    const worldDisplay = get('world');
    if (worldDisplay.textContent !== world) {
      const label = winRateDigits === null ? t('暂无胜率') : msg`黑棋估算胜率 ${(winRateDigits / 10000).toFixed(4)}%`;
      worldDisplay.setAttribute('aria-label',label);
      worldDisplay.title = label;
      worldDisplay.replaceChildren(...[...world].map(digit=>{
        const cell = document.createElement('span');
        cell.className = 'go-tube';
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
    let status = turn === BLACK ? t(analyzing && recommend ? '正在分析候选落点…' : '轮到你 · 黑棋') : t('红莉栖正在思考…');
    if (analysisFailed && !replay) status = t('KataGo 分析失败。');
    if (phase === 'scoring') status = t('双方已停一手。点选整块死棋后提交，或继续下棋。');
    if (phase === 'finished') {
      status = score ? msg`${winner === BLACK ? t('黑棋') : t('白棋')}胜 ${score.margin} 目 · 黑 ${score.black} / 白 ${score.white}` : t('你已认输，红莉栖获胜。');
    }
    if (replay && phase !== 'finished') status = phase === 'scoring' ? t('复盘 · 双方停一手') :
      (turn === BLACK ? t('复盘 · 黑棋待下') : t('复盘 · 白棋待下'));
    if (replay && analyzing) status = t('KataGo 正在分析复盘局面…');
    if (replay && analysisFailed) status = t('KataGo 分析失败。');
    get('status').textContent = status;
    get('notice').textContent = replay ? '' : notice;
    const remarkBox = get('commentary-box');
    remarkBox.hidden = Boolean(replay) || !lastRemark;
    if (!remarkBox.hidden) {
      const prevEl = get('commentary-prev');
      prevEl.hidden = !prevRemark;
      prevEl.textContent = prevRemark ? prevRemark.text : '';
      get('commentary').textContent = lastRemark.text;
    }
    get('mail').textContent = mail || t('退回你上一手之前');
    get('count').textContent = String(moves.length);
    get('moves').innerHTML = moves.map(({color,point},i)=>
      `<li><span>${i + 1}</span><span>${t(color === BLACK ? '黑' : '白')}</span><b>${point === null ? t('停一手') : coordinate(point)}</b></li>`).join('');
    get('hints').replaceChildren(...visibleHints.map((point,index)=>{
      const label = document.createElement('span');
      label.textContent = (index + 1) + '  ' + coordinate(point);
      label.title = index === 0 ? t('KataGo 首选') : t('KataGo 备选');
      return label;
    }));
    get('pass').disabled = !playerTurn;
    get('resign').disabled = Boolean(replay) || phase === 'finished';
    get('new').disabled = Boolean(replay);
    get('undo').disabled = Boolean(replay) || !game.history.some(action=>action.type === 'move' || action.type === 'pass' || action.type === 'resign');
    get('count-tools').hidden = Boolean(replay) || phase !== 'scoring';
    get('retry-tools').hidden = Boolean(replay) || !analysisFailed;
    get('recommend').checked = recommend;
    get('voice').checked = voiceEnabled;
    get('replay-tools').hidden = !replay;
    if (replay) {
      const {index,actions} = replay;
      get('replay-range').max = String(actions.length);
      get('replay-range').value = String(index);
      get('replay-step').textContent = msg`第 ${moves.length} 手 · 步骤 ${index} / ${actions.length}`;
      get('replay-first').disabled = get('replay-prev').disabled = index === 0;
      get('replay-last').disabled = get('replay-next').disabled = index === actions.length;
      get('replay-analyze').disabled = analyzing || phase !== 'play';
    }
    get('confirm-box').hidden = !confirmation;
    get('question').textContent = confirmation === 'new' ? t('保存当前棋谱并开始新棋局？') : t('确认认输？');
  }

  function cancelAnalysis() {
    analysis?.abort();
    analysis = null;
    analyzing = false;
  }

  async function nextTurn() {
    cancelAnalysis();
    hints = [];
    winRate = null;
    analysisFailed = false;
    updateArchive();
    if (game.state.phase !== 'play' || !dialog.open) {
      render();
      return;
    }
    const {turn} = game.state;
    const controller = analysis = new AbortController();
    analyzing = true;
    render();
    try {
      const result = await analyzeGo(game.history, controller.signal);
      if (controller.signal.aborted || !dialog.open) return;
      cancelAnalysis();
      winRate = result.winRate;
      if (turn === BLACK) {
        hints = result.ranked.filter(point=>point !== null).slice(0,3);
        lastBlackWinRate = result.winRate;
        lastBlackHints = hints.slice();
        render();
      } else {
        const blackInfo = pendingBlackMove;
        pendingBlackMove = null;
        const choice = result.ranked[0];
        if (game.apply(choice === null ? {type:'pass'} : {type:'move',point:choice})) {
          analysisFailed = true;
          render();
          return;
        }
        const whiteMove = game.moves.at(-1);
        const whitePoint = whiteMove?.point ?? null;
        const whiteCaptured = whiteMove?.captured || 0;
        const priorWhitePoint = prevWhitePoint;
        prevWhitePoint = whitePoint;
        if (game.state.phase === 'finished') {
          deliverRemark(commentary.onGameEnd({ reason: 'score', winner: game.state.winner, margin: game.state.score?.margin }));
        } else if (blackInfo) {
          void deliverTurnRemark({
            ...blackInfo,
            nextWinRate: result.winRate,
            whitePoint,
            whiteCoord: whitePoint === null ? 'PASS' : coordinate(whitePoint),
            whiteCaptured,
            whitePass: whitePoint === null,
            prevWhitePoint: priorWhitePoint,
            moveCount: game.moves.length,
          });
        }
        persist();
        void nextTurn();
      }
    } catch (error) {
      if (controller.signal.aborted || !dialog.open) return;
      console.warn('KataGo analysis failed', error);
      cancelAnalysis();
      analysisFailed = true;
      render();
    }
  }

  function playerMove(action) {
    if (game.state.phase !== 'play' || game.state.turn !== BLACK) return;
    const error = game.apply(action);
    if (error) {
      notice = t(ruleErrors[error]);
      render();
      return;
    }
    const blackMove = game.moves.at(-1);
    const blackPoint = blackMove?.point ?? null;
    pendingBlackMove = {
      blackPoint,
      blackCoord: blackPoint === null ? 'PASS' : coordinate(blackPoint),
      blackCaptured: blackMove?.captured || 0,
      captured: blackMove?.captured || 0,
      moveCount: game.moves.length,
      prevWinRate: lastBlackWinRate,
      playedTopHint: action.type === 'move' && lastBlackHints[0] === action.point,
      blackPass: action.type === 'pass',
      isPass: action.type === 'pass',
    };
    notice = '';
    persist();
    if (game.state.phase === 'finished') {
      pendingBlackMove = null;
      deliverRemark(commentary.onGameEnd({ reason: 'score', winner: game.state.winner, margin: game.state.score?.margin }));
    }
    nextTurn();
  }

  function choose(point) {
    if (game.state.phase !== 'scoring') {
      playerMove({type:'move',point});
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
    remarkEpoch++;
    cancelAnalysis();
    options.stopCommentary?.();
    confirmation = '';
    replay = null;
    dialog.close();
  }

  get('recommend').addEventListener('change', event=>{
    recommend = event.target.checked;
    persist();
    render();
  });
  get('voice').addEventListener('change', event=>{
    voiceEnabled = event.target.checked;
    if (!voiceEnabled) options.stopCommentary?.();
    persist();
    render();
  });
  get('archive').addEventListener('change', event=>showReplay(event.target.value));
  get('replay-range').addEventListener('input', event=>stepReplay(Number(event.target.value)));

  dialog.addEventListener('click',event=>{
    const button = event.target.closest('button');
    if (!button) return;
    if (replay) {
      switch (button.dataset.go) {
        case 'close': close(); break;
        case 'replay-first': stepReplay(0); break;
        case 'replay-prev': stepReplay(replay.index - 1); break;
        case 'replay-next': stepReplay(replay.index + 1); break;
        case 'replay-last': stepReplay(replay.actions.length); break;
        case 'replay-analyze': void analyzeReplay(); break;
        case 'replay-exit': showReplay(''); get('archive').focus(); break;
      }
      return;
    }
    if (button.dataset.goPoint !== undefined) {
      focused = Number(button.dataset.goPoint);
      choose(focused);
      return;
    }
    switch (button.dataset.go) {
      case 'close': close(); break;
      case 'retry': void nextTurn(); break;
      case 'undo':
        if (!game.undoRound()) return;
        remarkEpoch++;
        mail = t('D-Mail 已送达。已回到你上一手之前。');
        confirmation = notice = '';
        pendingBlackMove = null;
        lastBlackWinRate = null;
        prevWhitePoint = [...game.moves].reverse().find(m => m.color === WHITE)?.point ?? null;
        marked.clear();
        persist();
        deliverRemark(commentary.onUndo(game.moves.length));
        nextTurn();
        break;
      case 'pass': playerMove({type:'pass'}); break;
      case 'score':
        if (agreesWithDeadStones(game.state.board,marked,game.seen)) {
          notice = '';
          settle({type:'score',dead:[...marked]});
          if (game.state.phase === 'finished') {
            deliverRemark(commentary.onGameEnd({ reason: 'score', winner: game.state.winner, margin: game.state.score?.margin }));
          }
        } else {
          notice = t('红莉栖对死棋有异议，继续下棋解决。');
          deliverRemark(commentary.onDispute());
          settle({type:'resume'});
        }
        break;
      case 'commentary-replay':
        if (lastRemark) {
          deliverRemark(
            lastRemark.entry
              ? { category: lastRemark.category, entry: lastRemark.entry }
              : {
                  id: lastRemark.id,
                  category: lastRemark.category,
                  text: lastRemark.text,
                  speech: lastRemark.speech,
                  language: lastRemark.language,
                  dynamic: true,
                },
            { manual: true },
          );
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
        if (confirmation === 'new') {
          const actions = game.history;
          const archive = actions.length ? [{date:gameDate,actions}, ...records] : records;
          const date = Date.now();
          if (!persist([],archive,date)) {
            confirmation = '';
            render();
            break;
          }
          records = archive;
          gameDate = date;
          game.reset();
          commentary.reset();
          remarkEpoch++;
          lastRemark = null;
          prevRemark = null;
          pendingBlackMove = null;
          prevWhitePoint = null;
          lastBlackWinRate = null;
          lastBlackHints = [];
          hasGreeted = true;
          mail = '';
          focused = center;
          confirmation = notice = '';
          marked.clear();
          persist();
          deliverRemark(commentary.onOpening());
          nextTurn();
          buttons[focused].focus({preventScroll:true});
          break;
        }
        else if (confirmation === 'resign') {
          game.apply({type:'resign',color:BLACK});
          deliverRemark(commentary.onGameEnd({ reason: 'resign', winner: WHITE }));
        }
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
      if (!hasGreeted && game.state.phase === 'play' && game.moves.length === 0) {
        hasGreeted = true;
        deliverRemark(commentary.onOpening());
      }
      buttons[focused].focus({preventScroll:true});
    },
    hide() { if (dialog.open) close(); },
  };
}
