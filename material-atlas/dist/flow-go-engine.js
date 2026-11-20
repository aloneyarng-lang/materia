import {SIZE,POINTS,BLACK,WHITE,KOMI,neighbors,other,groupAt,placement,areaScore,positionKey} from './flow-go-rules.js';

const openingValue = [0,-1,1.7,2.6,1.35,.7,.3,.15,.05,0];
const geometry = Array.from({length:POINTS},(_,point) => {
  const x = point % SIZE, y = Math.floor(point / SIZE);
  const lines = [x,y,SIZE - x - 1,SIZE - y - 1].sort((a,b)=>a-b);
  const diagonals = [];
  for (const dx of [-1,1]) for (const dy of [-1,1]) {
    if (x + dx >= 0 && x + dx < SIZE && y + dy >= 0 && y + dy < SIZE) diagonals.push(point + dy * SIZE + dx);
  }
  return {x,y,diagonals,opening:openingValue[lines[0]] + .75 * openingValue[lines[1]]};
});

function groupsOn(board) {
  const at = new Array(POINTS);
  const groups = [];
  for (let point = 0; point < POINTS; point++) {
    if (!board[point] || at[point]) continue;
    const group = {...groupAt(board,point),color:board[point]};
    groups.push(group);
    for (const stone of group.stones) at[stone] = group;
  }
  return {at,groups};
}

function evaluate(board,color) {
  let value = 0;
  for (const {stones,liberties,color:owner} of groupsOn(board).groups) {
    const libertyCount = liberties.size;
    const strength = libertyCount === 1 ? -.65 : libertyCount === 2 ? .45 : 1;
    value += (owner === color ? 1 : -1) * (stones.length * strength + Math.min(libertyCount,8) * .16);
  }
  return value;
}

function distancesTo(board,color) {
  const distances = new Uint8Array(POINTS).fill(255);
  const queue = [];
  for (let point = 0; point < POINTS; point++) {
    if (board[point] !== color) continue;
    distances[point] = 0;
    queue.push(point);
  }
  for (const point of queue) {
    for (const next of neighbors[point]) {
      if (distances[next] !== 255) continue;
      distances[next] = distances[point] + 1;
      queue.push(next);
    }
  }
  return distances;
}

export function estimateBlackWinRate({board,turn,phase,winner}) {
  if (phase === 'finished') return winner === BLACK ? 100 : 0;
  const black = distancesTo(board,BLACK), white = distancesTo(board,WHITE);
  let empty = 0, influence = 0;
  for (let point = 0; point < POINTS; point++) {
    if (board[point]) continue;
    empty++;
    // Discount open intersections and cancel influence where both colors are close.
    influence += (Math.exp(-black[point] * .62) - Math.exp(-white[point] * .62)) * 1.2;
  }
  const open = empty / POINTS;
  const initiative = (turn === BLACK ? 1 : -1) * (.8 + .7 * open);
  const advantage = evaluate(board,BLACK) + influence + initiative - KOMI + (KOMI - 1.5) * open;
  const uncertainty = 4 + 15 * open;
  return Math.max(.5,Math.min(99.5,100 / (1 + Math.exp(-advantage / uncertainty))));
}

function isEye(board,point,color) {
  if (!neighbors[point].every(next => board[next] === color)) return false;
  const {diagonals} = geometry[point];
  const opposing = diagonals.filter(next => board[next] === other(color)).length;
  return opposing < (diagonals.length === 4 ? 2 : 1);
}

function localChoices(board,color,seen,allowPass,passes) {
  const {at,groups} = groupsOn(board);
  const stones = groups.flatMap(group => group.stones);
  const late = stones.length >= POINTS * .44;
  const area = late || passes ? areaScore(board) : null;
  const openingWeight = Math.max(.12,1 - stones.length / 85);
  const choices = [];
  for (let point = 0; point < POINTS; point++) {
    if (board[point] || isEye(board,point,color)) continue;
    const result = placement(board,point,color,seen);
    if (result.error) continue;
    const {x,y,opening} = geometry[point];
    let nearOwn = 7, nearEnemy = 7;
    for (const stone of stones) {
      const target = geometry[stone];
      const distance = Math.abs(x - target.x) + Math.abs(y - target.y);
      if (board[stone] === color) nearOwn = Math.min(nearOwn,distance);
      else nearEnemy = Math.min(nearEnemy,distance);
    }
    const adjacent = new Set(neighbors[point].map(next=>at[next]).filter(Boolean));
    let score = opening * openingWeight + result.captured * 2.5 + .13 * Math.min(5,result.liberties);
    if (stones.length) {
      score += nearOwn === 3 || nearOwn === 4 ? 1 : nearOwn === 1 ? -.48 : 0;
      score += nearEnemy === 2 || nearEnemy === 3 ? .52 : 0;
    }
    for (const group of adjacent) {
      if (group.color === color && group.liberties.size === 1 && result.liberties > 1) score += 1.4 + group.stones.length * .7;
      if (group.color !== color && group.liberties.size === 2 && result.liberties > 1) score += .7 + group.stones.length * .2;
    }
    if (result.liberties === 1) score -= result.captured ? 1.1 : 5;
    if (late && area?.ownership[point] === color) score -= 5;
    if (late && area?.ownership[point] === other(color) && result.liberties < 3 && !result.captured) score -= 3;
    choices.push({point,score,result});
  }
  if (allowPass) {
    const leading = area?.winner === color;
    const urgent = choices.some(choice=>choice.result.captured || choice.score > 2.6);
    choices.push({point:null,result:null,score:passes && leading && late && !urgent ? 2.2 : late ? -.18 : -8});
  }
  return choices.sort((a,b)=>b.score - a.score || (a.point ?? POINTS) - (b.point ?? POINTS));
}

export function rankGoMoves({board,turn,seen,passes = 0},{lookAhead = true} = {}) {
  const search = localChoices(board,turn,seen,true,passes);
  if (!lookAhead) return search.slice(0,4).map(({point,score})=>({point,score}));
  const candidates = search.slice(0,14);
  const pass = search.find(choice=>choice.point === null);
  if (!candidates.includes(pass)) candidates.push(pass);
  const baseline = evaluate(board,turn);
  for (const choice of candidates) {
    const next = choice.result?.board || board;
    const nextSeen = new Set(seen);
    nextSeen.add(choice.result?.key || positionKey(next,other(turn)));
    if (choice.point === null && passes) continue;
    const replies = localChoices(next,other(turn),nextSeen,false,0).slice(0,5);
    const replyValue = replies.length ? Math.min(...replies.map(({result})=>evaluate(result.board,turn))) : evaluate(next,turn);
    choice.score += .74 * Math.max(-14,Math.min(14,replyValue - baseline));
  }
  return candidates.sort((a,b)=>b.score - a.score || (a.point ?? POINTS) - (b.point ?? POINTS))
    .slice(0,4).map(({point,score})=>({point,score}));
}

// If life and death is unclear, require the position to be played out.
export function agreesWithDeadStones(board, dead, seen) {
  const checked = new Set();
  for (const stone of dead) {
    if (checked.has(stone)) continue;
    const group = groupAt(board,stone), color = board[stone];
    const [target] = group.liberties;
    if (group.liberties.size !== 1 || placement(board,target,color,seen).error !== 'suicide' ||
        placement(board,target,other(color),seen).error) return false;
    for (const member of group.stones) {
      checked.add(member);
      if (neighbors[member].some(point=>board[point] === other(color) && groupAt(board,point).liberties.size === 1)) return false;
    }
  }
  return true;
}
