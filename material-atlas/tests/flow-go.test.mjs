import test from 'node:test';
import assert from 'node:assert/strict';
import {SIZE,POINTS,BLACK,WHITE,KOMI,neighbors,placement,positionKey,areaScore,createGoGame} from '../dist/flow-go-rules.js';
import {rankGoMoves,agreesWithDeadStones,estimateBlackWinRate} from '../dist/flow-go-engine.js';

const at = (x,y) => y * SIZE + x;
function position(black,white) {
  const board = new Uint8Array(POINTS);
  for (const point of black) board[point] = BLACK;
  for (const point of white) board[point] = WHITE;
  return board;
}

test('edge liberties, group captures, and self-capture use orthogonal intersections',()=>{
  assert.deepEqual(neighbors[0],[SIZE,1]);
  assert.ok(neighbors[1].includes(0));
  assert.ok(neighbors[SIZE].includes(0));
  assert.equal(neighbors[SIZE - 1].includes(SIZE),false);
  const corner = position([], [at(1,0),at(0,1)]);
  assert.equal(placement(corner,0,BLACK,new Set()).error,'suicide');
  const chain = position([at(0,1),at(1,1)],[0,1]);
  const capture = placement(chain,at(2,0),BLACK,new Set());
  assert.equal(capture.captured,2);
  assert.equal(capture.board[0],0);
  assert.equal(capture.board[1],0);
  assert.equal(chain[0],WHITE);
});

test('ko and longer repeating positions are blocked only for the same next player',()=>{
  const board = position([at(2,1),at(1,2),at(3,2)],[at(2,2),at(1,3),at(3,3),at(2,4)]);
  const blackTurn = positionKey(board,BLACK);
  const taken = placement(board,at(2,3),BLACK,new Set([blackTurn]));
  assert.equal(taken.captured,1);
  assert.equal(placement(taken.board,at(2,2),WHITE,new Set([blackTurn,taken.key])).error,'ko');
  assert.deepEqual(placement(taken.board,at(2,2),WHITE,new Set([positionKey(board,WHITE)])).board,board);
  const unrelatedOpposingTurn = positionKey(taken.board,BLACK);
  assert.equal(placement(board,at(2,3),BLACK,new Set([unrelatedOpposingTurn])).captured,1);
});

test('passes, disputed positions, White last and area scoring include all live stones and komi',()=>{
  const game = createGoGame();
  game.apply({type:'move',point:0});
  game.apply({type:'pass'});
  game.apply({type:'pass'});
  assert.equal(game.state.phase,'scoring');
  assert.equal(game.state.turn,WHITE);
  assert.deepEqual(game.state.prisoners,[0,1,1]);
  game.apply({type:'resume'});
  game.apply({type:'pass'});
  assert.equal(game.state.phase,'play');
  game.apply({type:'pass'});
  assert.equal(game.state.phase,'finished');
  assert.equal(game.moves.at(-1).color,WHITE);
  assert.equal(game.state.score.black,POINTS);
  assert.equal(game.state.score.white,KOMI);
  const shared = position([0],[POINTS - 1]);
  assert.deepEqual([areaScore(shared).black,areaScore(shared).white],[1,1 + KOMI]);
  const agreed = createGoGame([{type:'move',point:0},{type:'pass'},{type:'pass'}]);
  agreed.apply({type:'score',dead:[]});
  assert.equal(agreed.moves.at(-1).color,WHITE);
});

test('scoring removes agreed groups together and D-Mail reconstructs the previous legal position',()=>{
  const game = createGoGame();
  for (const point of [at(0,1),at(0,0),at(1,1),at(1,0)]) game.apply({type:'move',point});
  game.apply({type:'pass'});
  game.apply({type:'pass'});
  assert.equal(game.apply({type:'score',dead:[0]}),'invalid');
  assert.equal(game.apply({type:'score',dead:[0,1]}),'');
  assert.equal(game.state.board[0],0);
  assert.equal(game.state.score.occupied[WHITE],0);
  assert.equal(game.undoRound(),true);
  assert.equal(game.state.turn,BLACK);
  assert.equal(game.state.phase,'play');
  assert.equal(game.state.board[0],WHITE);
  assert.equal(game.moves.length,4);
  assert.deepEqual(createGoGame(game.history).state,game.state);
  assert.equal(game.apply({type:'move',point:at(2,0)}),'');
  assert.equal(game.state.captures[BLACK],2);
});

test('the engine ranks unique legal placements and prefers a clean group capture',()=>{
  const game = createGoGame();
  const opening = rankGoMoves({...game.state,seen:game.seen});
  assert.equal(new Set(opening.map(choice=>choice.point)).size,4);
  assert.ok(opening.every(choice=>!placement(game.state.board,choice.point,BLACK,game.seen).error));
  const board = position([at(0,1),at(1,1)],[0,1]);
  const choices = rankGoMoves({board,turn:BLACK,seen:new Set()});
  assert.equal(choices[0].point,at(2,0));
  assert.ok(choices.slice(1).every(choice=>choice.score<=choices[0].score));
  assert.equal(agreesWithDeadStones(position([at(5,5)],[at(9,9)]),[at(9,9)],new Set()),false);
});

test('black win estimate reacts to play, reverses on undo and gives the actual result when finished',()=>{
  const game = createGoGame();
  const opening = estimateBlackWinRate(game.state);
  assert.equal(opening,50);
  game.apply({type:'move',point:at(3,3)});
  const afterBlack = estimateBlackWinRate(game.state);
  assert.ok(afterBlack > opening);
  game.apply({type:'move',point:at(15,15)});
  assert.ok(estimateBlackWinRate(game.state) < afterBlack);
  game.undoRound();
  assert.equal(estimateBlackWinRate(game.state),opening);
  game.apply({type:'resign',color:BLACK});
  assert.equal(estimateBlackWinRate(game.state),0);
  const scored = createGoGame([{type:'move',point:0},{type:'pass'},{type:'pass'},{type:'score'}]);
  assert.equal(estimateBlackWinRate(scored.state),100);
});
