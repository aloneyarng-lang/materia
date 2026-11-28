import test from 'node:test';
import assert from 'node:assert/strict';
import {SIZE,POINTS,BLACK,WHITE,KOMI,neighbors,placement,positionKey,areaScore,createGoGame} from '../dist/flow-go-rules.js';
import {rankGoMoves,agreesWithDeadStones,estimateBlackWinRate} from '../dist/flow-go-engine.js';
import {
  GO_COMMENTARY_LINES,
  buildGoCommentaryMessages,
  createGoCommentary,
  parseGoCommentaryReply,
  selectGoSpeech,
} from '../dist/flow-go-commentary.js';

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

test('Go commentary speaks continuously on every move with contextual & multi-move continuity',()=>{
  const commentary = createGoCommentary();

  const open = commentary.onOpening();
  assert.equal(open.category,'opening');
  assert.ok(GO_COMMENTARY_LINES.opening.some(item=>item.id===open.entry.id));

  // Consecutive moves with zero time/move cooldown still speak every single turn
  const corner = commentary.onTurnEvaluated({blackPoint:at(3,3),prevWinRate:50,nextWinRate:50.5,moveCount:2});
  assert.equal(corner.category,'opening_corner');

  const flow = commentary.onTurnEvaluated({blackPoint:at(9,3),prevWinRate:50.5,nextWinRate:51,moveCount:18});
  assert.equal(flow.category,'opening_flow');

  const blunder = commentary.onTurnEvaluated({blackPoint:at(10,10),prevWinRate:52,nextWinRate:39,blackCaptured:1,moveCount:34});
  assert.equal(blunder.category,'blunder');

  const doubleBlunder = commentary.onTurnEvaluated({blackPoint:at(11,10),prevWinRate:39,nextWinRate:26,moveCount:36});
  assert.equal(doubleBlunder.category,'double_blunder');

  const recover = commentary.onTurnEvaluated({blackPoint:at(12,10),prevWinRate:26,nextWinRate:27,moveCount:38});
  assert.equal(recover.category,'recover_after_blunder');

  const whiteBigCap = commentary.onTurnEvaluated({blackPoint:at(12,11),whiteCaptured:3,prevWinRate:27,nextWinRate:24,moveCount:40});
  assert.equal(whiteBigCap.category,'white_big_capture');

  const blackBigCap = commentary.onTurnEvaluated({blackPoint:at(13,11),blackCaptured:3,prevWinRate:24,nextWinRate:30,moveCount:42});
  assert.equal(blackBigCap.category,'black_big_capture');

  const brilliant = commentary.onTurnEvaluated({blackPoint:at(6,6),prevWinRate:35,nextWinRate:45,moveCount:44});
  assert.equal(brilliant.category,'brilliant');

  const streak = commentary.onTurnEvaluated({blackPoint:at(6,7),prevWinRate:45,nextWinRate:46,playedTopHint:true,moveCount:46});
  assert.equal(streak.category,'streak_brilliant');

  const swingBlack = commentary.onTurnEvaluated({blackPoint:at(7,7),prevWinRate:45,nextWinRate:56,moveCount:48});
  assert.equal(swingBlack.category,'lead_swing_black');

  const swingWhite = commentary.onTurnEvaluated({blackPoint:at(7,8),prevWinRate:54,nextWinRate:47,moveCount:50});
  assert.equal(swingWhite.category,'lead_swing_white');

  const localFight = commentary.onTurnEvaluated({blackPoint:at(5,5),prevWhitePoint:at(6,5),prevWinRate:44,nextWinRate:45,moveCount:52});
  assert.equal(localFight.category,'local_fight');

  const tenuki = commentary.onTurnEvaluated({blackPoint:at(15,15),prevWhitePoint:at(5,5),prevWinRate:45,nextWinRate:46,moveCount:54});
  assert.equal(tenuki.category,'tenuki');

  const closeGame = commentary.onTurnEvaluated({blackPoint:at(10,15),prevWhitePoint:at(14,15),prevWinRate:49,nextWinRate:50,moveCount:56});
  assert.equal(closeGame.category,'close_game');
  const closeGame2 = commentary.onTurnEvaluated({blackPoint:at(10,16),prevWhitePoint:at(14,16),prevWinRate:50,nextWinRate:51,moveCount:58});
  assert.equal(closeGame2.category,'close_game');
  assert.notEqual(closeGame2.entry.id,closeGame.entry.id);

  const blackAhead = commentary.onTurnEvaluated({blackPoint:at(10,16),prevWhitePoint:at(14,16),prevWinRate:60,nextWinRate:61,moveCount:60});
  assert.equal(blackAhead.category,'black_ahead');

  const whiteAhead = commentary.onTurnEvaluated({blackPoint:at(10,16),prevWhitePoint:at(14,16),prevWinRate:35,nextWinRate:34,moveCount:62});
  assert.equal(whiteAhead.category,'white_ahead');

  const endgame = commentary.onTurnEvaluated({blackPoint:at(2,2),prevWhitePoint:at(16,16),prevWinRate:50,nextWinRate:50,moveCount:142});
  assert.equal(endgame.category,'endgame_push');

  const passMove = commentary.onTurnEvaluated({blackPass:true,prevWinRate:50,nextWinRate:50,moveCount:144});
  assert.equal(passMove.category,'pass_move');

  // Record spoken continuity and build live LLM continuation prompt
  commentary.recordSpoken({moveCount:56,category:'close_game',text:closeGame.entry.zh,speech:closeGame.entry.zh});
  commentary.recordSpoken({moveCount:58,category:'close_game',text:closeGame2.entry.zh,speech:closeGame2.entry.zh});
  assert.equal(commentary.getRecentDialogue().length,2);

  const messages = buildGoCommentaryMessages({
    turn:{moveCount:60,blackPoint:at(3,3),whitePoint:at(15,15),prevWhitePoint:at(14,15),prevWinRate:50,nextWinRate:52.4,categoryHint:'tenuki'},
    recentDialogue:commentary.getRecentDialogue(),
    displayLocale:'zh-CN',
    voiceLanguage:'ja',
  });
  assert.equal(messages.length,2);
  assert.match(messages[0].content,/接着上一轮的话题/);
  assert.match(messages[1].content,/"moveCount":60/);

  const parsedCross = parseGoCommentaryReply('```json\n{"text":"你居然真的脱先了。","speech":"本当に手を抜いたのね。"}\n```',{displayLocale:'zh-CN',voiceLanguage:'ja'});
  assert.deepEqual(parsedCross,{text:'你居然真的脱先了。',speech:'本当に手を抜いたのね。',language:'ja'});
  const parsedPlain = parseGoCommentaryReply('「这步棋还算冷静。」',{displayLocale:'zh-CN',voiceLanguage:'follow'});
  assert.deepEqual(parsedPlain,{text:'这步棋还算冷静。',speech:'这步棋还算冷静。',language:'zh'});

  // D-Mail undo, dispute, resign, and win/loss remarks
  assert.equal(commentary.onUndo(38).category,'undo');
  assert.equal(commentary.onDispute().category,'dispute');
  assert.equal(commentary.onGameEnd({reason:'resign',winner:WHITE}).category,'resign');
  assert.equal(commentary.onGameEnd({reason:'score',winner:BLACK,margin:3.5}).category,'black_win');
  assert.equal(commentary.onGameEnd({reason:'score',winner:WHITE,margin:5.5}).category,'white_win');

  // Direct language mapping without extra translation
  const sample = GO_COMMENTARY_LINES.blunder[0];
  const followJa = selectGoSpeech(sample,'follow','ja');
  assert.equal(followJa.language,'ja');
  assert.equal(followJa.text,sample.ja);
  assert.equal(followJa.speech,sample.ja);
  const crossVoice = selectGoSpeech(sample,'ja','zh-CN');
  assert.equal(crossVoice.language,'ja');
  assert.equal(crossVoice.text,sample.zh);
  assert.equal(crossVoice.speech,sample.ja);
});
