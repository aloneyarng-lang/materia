import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const engine = fileURLToPath(new URL('./engines/fairy-stockfish.exe', import.meta.url));
const movePattern = /^(?:[a-i](?:10|[1-9])[a-i](?:10|[1-9])\+?|[PLNSGBR]@[a-i][1-9])$/i;

export function analyzeVariant(variant, moves, search = false) {
  if (!['xiangqi','shogi'].includes(variant) || !Array.isArray(moves) ||
      moves.length > 2048 || !moves.every(m => typeof m === 'string' && movePattern.test(m))) {
    throw Error('棋局记录无效');
  }
  return new Promise((resolve,reject) => {
    const child = spawn(engine, [], {windowsHide:true, stdio:['pipe','pipe','ignore']});
    let buffer = '', fen = '', check = false, finished = false;
    const legal = [];
    function finish(error, best = null) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      child.kill();
      if (error) reject(error);
      else resolve({fen, check, legal, best});
    }
    const timer = setTimeout(() => finish(Error('棋力引擎响应超时')), 15000);
    child.on('error', () => finish(Error('无法启动本地 Fairy-Stockfish 引擎')));
    child.stdin.on('error', () => finish(Error('棋力引擎连接中断')));
    child.on('close', () => finish(Error('棋力引擎已退出')));
    const send = command => child.stdin.write(command+'\n');
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      buffer += chunk;
      let end;
      while (!finished && (end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0,end).trim();
        buffer = buffer.slice(end+1);
        if (line === 'uciok') {
          send('setoption name UCI_Variant value '+variant);
          send('isready');
        } else if (line === 'readyok') {
          send('position startpos'+(moves.length?' moves '+moves.join(' '):''));
          send('d');
          send('go perft 1');
        } else if (line.startsWith('Fen:')) fen = line.slice(4).trim();
        else if (line.startsWith('Checkers:')) check = !!line.slice(9).trim();
        else if (/^\S+:\s*1$/.test(line) && movePattern.test(line.split(':')[0])) legal.push(line.split(':')[0]);
        else if (line.startsWith('Nodes searched:')) {
          if (!fen || Number(line.split(':')[1]) !== legal.length) finish(Error('无法读取完整的合法着法'));
          else if (search && legal.length) send('go movetime 850');
          else finish();
        } else if (line.startsWith('bestmove ')) {
          const best = line.split(/\s+/)[1];
          if (legal.includes(best)) finish(null,best);
          else if (['(none)','0000'].includes(best)) finish(null);
          else finish(Error('引擎返回了无效着法'));
        }
      }
    });
    send('uci');
  });
}
