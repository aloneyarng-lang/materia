import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {BLACK, KOMI, SIZE, coordinate, createGoGame, files, placement} from '../dist/flow-go-rules.js';

const engineDir = fileURLToPath(new URL('./vendor/katago/', import.meta.url));
const colorName = color => color === BLACK ? 'B' : 'W';

function pointFromMove(move) {
  if (move === 'pass') return null;
  const match = /^([A-HJ-T])([1-9]|1[0-9])$/.exec(move);
  return match ? (SIZE - Number(match[2])) * SIZE + files.indexOf(match[1]) : undefined;
}

export function createGoAnalysis() {
  const pending = new Map();
  let engine, nextId = 0, idle;

  function close(error = new Error('KataGo stopped')) {
    clearTimeout(idle);
    const child = engine;
    engine = undefined;
    child?.kill();
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    pending.clear();
  }

  function start() {
    const child = spawn(path.join(engineDir, 'katago.exe'), [
      'analysis', '-config', path.join(engineDir, 'materia.cfg'),
      '-model', path.join(engineDir, 'kata1-b10c128-s1141046784-d204142634.txt.gz')
    ], {cwd: engineDir, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']});
    engine = child;
    let diagnostics = '';
    child.stderr.setEncoding('utf8').on('data', chunk => {
      diagnostics = (diagnostics + chunk).slice(-4096);
    });
    const fail = error => { if (engine === child) close(error); };
    child.on('error', fail);
    child.stdin.on('error', fail);
    child.on('exit', code => fail(new Error(`KataGo exited (${code}): ${diagnostics}`)));
    createInterface({input: child.stdout}).on('line', line => {
      if (engine !== child) return;
      let result;
      try { result = JSON.parse(line); } catch { return; }
      const request = pending.get(result.id);
      if (!request || result.isDuringSearch || result.warning) return;
      pending.delete(result.id);
      clearTimeout(request.timer);
      if (result.error) request.reject(new Error(result.error));
      else request.resolve(result);
      if (!pending.size) idle = setTimeout(close, 60_000);
    });
  }

  async function analyze(actions) {
    if (!Array.isArray(actions) || actions.length > 5000) throw new Error('Invalid Go history');
    const game = createGoGame();
    for (const action of actions) {
      if (game.apply(action)) throw new Error('Invalid Go history');
    }
    const {board, turn, phase} = game.state;
    if (phase !== 'play') throw new Error('Go game is not in play');
    if (pending.size >= 4) throw new Error('KataGo is busy');

    const id = String(++nextId);
    const query = {
      id, boardXSize: SIZE, boardYSize: SIZE, komi: KOMI, rules: 'aga', whiteHandicapBonus: '0',
      moves: game.moves.map(({color, point}) => [colorName(color), point === null ? 'pass' : coordinate(point)]),
      maxVisits: 128, overrideSettings: {maxTime: 4}
    };
    clearTimeout(idle);
    if (!engine) start();
    const {moveInfos, rootInfo} = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => close(new Error('KataGo timed out')), 25_000);
      pending.set(id, {resolve, reject, timer});
      engine.stdin.write(JSON.stringify(query) + '\n');
    });
    if (rootInfo?.currentPlayer !== colorName(turn) || !Number.isFinite(rootInfo.winrate) || !Array.isArray(moveInfos)) {
      throw new Error('Invalid KataGo analysis response');
    }
    const ranked = moveInfos.sort((a,b) => a.order - b.order)
      .map(({move}) => pointFromMove(move))
      .filter(point => point === null || (point !== undefined && !placement(board, point, turn, game.seen).error));
    if (!ranked.length) throw new Error('KataGo returned no legal move');
    return {ranked, winRate: rootInfo.winrate * 100};
  }

  return {analyze, close};
}
