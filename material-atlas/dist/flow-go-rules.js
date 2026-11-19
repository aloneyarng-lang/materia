export const SIZE = 19;
export const BLACK = 1;
export const WHITE = 2;
export const KOMI = 7.5;
export const POINTS = SIZE * SIZE;
export const other = color => 3 - color;
export const files = 'ABCDEFGHJKLMNOPQRST';
export const coordinate = point => files[point % SIZE] + (SIZE - Math.floor(point / SIZE));

export const neighbors = Array.from({length:POINTS},(_,point) => {
  const row = Math.floor(point / SIZE), col = point % SIZE;
  const adjacent = [];
  if (row > 0) adjacent.push(point - SIZE);
  if (row < SIZE - 1) adjacent.push(point + SIZE);
  if (col > 0) adjacent.push(point - 1);
  if (col < SIZE - 1) adjacent.push(point + 1);
  return adjacent;
});

export function groupAt(board, start) {
  const color = board[start], stones = [start], known = new Set(stones), liberties = new Set();
  for (const point of stones) {
    for (const next of neighbors[point]) {
      if (!board[next]) liberties.add(next);
      else if (board[next] === color && !known.has(next)) {
        known.add(next);
        stones.push(next);
      }
    }
  }
  return {stones,liberties};
}

export const positionKey = (board,next) => next + ':' + board.join('');

export function placement(board, point, color, seen) {
  if (!Number.isInteger(point) || point < 0 || point >= POINTS || board[point]) return {error:'occupied'};
  const next = board.slice(), opponent = other(color);
  next[point] = color;
  let captured = 0;
  for (const adjacent of neighbors[point]) {
    if (next[adjacent] !== opponent) continue;
    const group = groupAt(next,adjacent);
    if (group.liberties.size) continue;
    captured += group.stones.length;
    for (const stone of group.stones) next[stone] = 0;
  }
  const own = groupAt(next,point);
  if (!own.liberties.size) return {error:'suicide'};
  const key = positionKey(next,opponent);
  if (seen.has(key)) return {error:'ko'};
  return {board:next,captured,key,liberties:own.liberties.size};
}

export function areaScore(board, dead = []) {
  const position = board.slice();
  for (const point of dead) position[point] = 0;
  const ownership = position.slice(), occupied = [0,0,0], territory = [0,0,0];
  const visited = new Uint8Array(POINTS);
  for (let point = 0; point < POINTS; point++) {
    if (position[point]) {
      occupied[position[point]]++;
      continue;
    }
    if (visited[point]) continue;
    const region = [point];
    visited[point] = 1;
    let border = 0;
    for (const empty of region) {
      for (const next of neighbors[empty]) {
        if (position[next]) border |= position[next];
        else if (!visited[next]) {
          visited[next] = 1;
          region.push(next);
        }
      }
    }
    if (border === BLACK || border === WHITE) {
      territory[border] += region.length;
      for (const empty of region) ownership[empty] = border;
    }
  }
  const black = occupied[BLACK] + territory[BLACK];
  const white = occupied[WHITE] + territory[WHITE] + KOMI;
  return {black,white,occupied,territory,ownership,winner:black > white ? BLACK : WHITE,margin:Math.abs(black - white)};
}

export function createGoGame(actions = []) {
  let state, history, seen, moves;
  function reset() {
    state = {board:new Uint8Array(POINTS),turn:BLACK,phase:'play',passes:0,last:null,
      captures:[0,0,0],prisoners:[0,0,0],score:null,winner:null};
    history = [];
    moves = [];
    seen = new Set([positionKey(state.board,BLACK)]);
  }
  function advance(point, result) {
    const color = state.turn;
    if (result) {
      state.board = result.board;
      state.captures[color] += result.captured;
      state.prisoners[color] += result.captured;
      state.passes = 0;
    } else {
      state.passes++;
      state.prisoners[other(color)]++;
    }
    moves.push({color,point,captured:result?.captured || 0});
    state.last = point;
    state.turn = other(color);
    seen.add(result?.key || positionKey(state.board,state.turn));
  }
  function finish(dead = []) {
    if (moves.at(-1)?.color === BLACK) advance(null);
    state.score = areaScore(state.board,dead);
    if (dead.length) {
      state.board = state.board.slice();
      for (const point of dead) {
        state.prisoners[other(state.board[point])]++;
        state.board[point] = 0;
      }
    }
    state.phase = 'finished';
    state.winner = state.score.winner;
  }
  function apply(action) {
    if (!action || typeof action !== 'object') return 'invalid';
    if (state.phase === 'play' && action.type === 'move') {
      const result = placement(state.board,action.point,state.turn,seen);
      if (result.error) return result.error;
      advance(action.point,result);
      history.push({type:'move',point:action.point});
      return '';
    }
    if (state.phase === 'play' && action.type === 'pass') {
      advance(null);
      if (state.passes >= 4) finish();
      else if (state.passes === 2) state.phase = 'scoring';
    } else if (state.phase === 'scoring' && action.type === 'resume') {
      state.phase = 'play';
    } else if (state.phase === 'scoring' && action.type === 'score') {
      if (action.dead !== undefined && !Array.isArray(action.dead)) return 'invalid';
      const dead = new Set(action.dead ?? []);
      if (dead.size > POINTS || [...dead].some(point => !Number.isInteger(point) || !state.board[point] ||
          groupAt(state.board,point).stones.some(stone=>!dead.has(stone)))) return 'invalid';
      finish([...dead]);
      history.push({type:'score',dead:[...dead]});
      return '';
    } else if (state.phase !== 'finished' && action.type === 'resign' && action.color === BLACK) {
      state.phase = 'finished';
      state.winner = WHITE;
    } else return 'invalid';
    history.push(action.type === 'resign' ? {type:'resign',color:BLACK} : {type:action.type});
    return '';
  }
  function restore(rows) {
    reset();
    for (const action of rows) {
      if (apply(action)) {
        reset();
        return;
      }
    }
  }
  reset();
  if (Array.isArray(actions) && actions.length <= 5000) restore(actions);
  return {
    get state() { return state; },
    get history() { return history.slice(); },
    get moves() { return moves.slice(); },
    get seen() { return seen; },
    apply,reset,
    undoRound() {
      let lastBlack = -1, color = BLACK;
      for (const [index,action] of history.entries()) {
        if (action.type === 'resign') { lastBlack = index; continue; }
        if (action.type !== 'move' && action.type !== 'pass') continue;
        if (color === BLACK) lastBlack = index;
        color = other(color);
      }
      if (lastBlack < 0) return false;
      restore(history.slice(0,lastBlack));
      return true;
    },
  };
}
