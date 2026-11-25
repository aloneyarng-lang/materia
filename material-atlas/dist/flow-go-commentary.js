import { BLACK } from './flow-go-rules.js';

export const GO_COMMENTARY_LINES = Object.freeze({
  opening: Object.freeze([
    {
      id: 'open-1',
      zh: '既然敢挑战，就让我看看你这盘的布置有几分站得住脚。黑棋先下吧。',
      ja: '挑戦する気があるなら、どこまで筋が通っているか見せてもらいましょうか。黒からどうぞ。',
      en: 'If you are going to challenge me, show me what kind of opening you have. Black to move.',
    },
    {
      id: 'open-2',
      zh: '局部变量已经初始化了。别刚开局就在常识上栽跟头，你先走。',
      ja: '盤面の初期化は完了。序盤の定石でつまずかないでよね、あなたから。',
      en: 'Board state initialized. Try not to trip over basic joseki right out of the gate. Your move.',
    },
    {
      id: 'open-3',
      zh: '十九路棋盘可不讲直觉糊弄。来吧，你的第一手打算落哪里？',
      ja: '十九路盤は勘だけじゃ誤魔化せないわよ。さあ、初手はどこに打つ？',
      en: 'A 19x19 board will not let intuition bluff its way through. Well, where is your first stone going?',
    },
  ]),
  blunder: Object.freeze([
    {
      id: 'blunder-1',
      zh: '……等一下，这手是怎么想的？刚攒起来的实地和厚味全漏出去了。',
      ja: '……ちょっと待って、今のどういうつもり？せっかく築いた厚みが全部崩れてるじゃない。',
      en: 'Wait... what was that move? You just threw away the thickness you spent ten moves building.',
    },
    {
      id: 'blunder-2',
      zh: '胜率读数一口气掉这么陡，连看两眼都不用算就能看出漏洞了。',
      ja: '勝率の傾きがここまで落ちるなんて、深く読まなくても緩みが見えるわよ。',
      en: 'With a drop like that on the readout, you do not even need deep reading to spot the hole.',
    },
    {
      id: 'blunder-3',
      zh: '你是不是漏看这边断点了？谢谢，那这一块的先手我就不客气了。',
      ja: 'ここの切り、うっかり見落としたでしょ？ありがとう、それなら遠慮なくいただくわ。',
      en: 'Did you miss that cut? Thank you, then I will gladly take the initiative here.',
    },
    {
      id: 'blunder-4',
      zh: '刚才那手太冲动了。如果现在不发 D-Mail 退回去，后面可不太好收场。',
      ja: '今の少し焦りすぎ。Dメールで戻さないと、この先かなり苦しくなるわよ。',
      en: 'That was way too hasty. Unless you send a D-Mail back, cleaning this up will get ugly.',
    },
    {
      id: 'blunder-5',
      zh: '……我本来以为你会下得更稳一点。看来是我高估你这一手的冷静程度了。',
      ja: '……もう少し堅実に打ってくると思ってたのに。少し見込み違いだったかしら。',
      en: 'I expected something steadier there. Seems I overestimated how calm you were staying.',
    },
  ]),
  brilliant: Object.freeze([
    {
      id: 'brilliant-1',
      zh: '哼……这一手居然真被你踩在点上了，连计算曲线都往你那边抬了一截。',
      ja: 'ふん……今のところ、ちゃんと急所を突いてくるじゃない。評価値まで上がってるし。',
      en: 'Hmph... you actually hit the vital point. Even the evaluation curve ticked up in your favor.',
    },
    {
      id: 'brilliant-2',
      zh: '不得不承认，这步棋有点东西。先别得意，后面的应对我还没走完。',
      ja: '認めざるを得ないわね、今の一手は悪くない。……調子に乗るのはまだ早いわよ。',
      en: 'I have to admit, that was sharp. Do not celebrate yet though, the sequence is far from over.',
    },
    {
      id: 'brilliant-3',
      zh: '居然忍住没随手跟着应，而是先手抢到这儿……你刚才认真在算了吧。',
      ja: '受けずにこっちへ先着してくるなんて……さっきから本気で読んでたのね。',
      en: 'You ignored the local follow-up and seized the bigger point first... you were reading seriously, huh.',
    },
    {
      id: 'brilliant-4',
      zh: '这一步的效率确实漂亮。行，那我这边也该认真拆一下后面的变化了。',
      ja: 'この効率は素直に綺麗ね。いいわ、こっちも本気で変化を読み切ることにする。',
      en: 'The efficiency on that stone is genuinely clean. Fine, then I will read out the variations seriously too.',
    },
  ]),
  black_capture: Object.freeze([
    {
      id: 'bcap-1',
      zh: '区区几颗弃子就让你这么开心？先看清外围的气紧不紧再说。',
      ja: 'その程度の捨て石を取ったくらいで満足？外側のダメ詰まりをよく見ておきなさい。',
      en: 'Happy over a couple of sacrifice stones? Check how short your outside liberties are first.',
    },
    {
      id: 'bcap-2',
      zh: '拿去吧，那两颗本来就是留着做转换的试应手。',
      ja: 'ほらどうぞ、そのくらいは振り替わり用の利かしみたいなものよ。',
      en: 'Go ahead and take them, those were practically probes for a trade anyway.',
    },
    {
      id: 'bcap-3',
      zh: '提子倒是挺干脆。不过这几手之后，主动权可未必还在你手里。',
      ja: '抜き方は綺麗ね。でもそのあと主導権まで握れるかは別問題よ。',
      en: 'Clean capture. Whether you actually keep the initiative afterward is another question.',
    },
  ]),
  black_big_capture: Object.freeze([
    {
      id: 'bbig-1',
      zh: '慢着……一整块居然真的被你吃掉了？那块的气我明明算过才对！',
      ja: 'ちょっと待って……一団丸ごと本当に取られたの！？ダメは数えてたはずなのに！',
      en: 'Hold on... you actually captured that entire group? I was sure I counted the liberties!',
    },
    {
      id: 'bbig-2',
      zh: '切，刚才那一手退让埋的伏笔全被你连上了。这笔账我记着。',
      ja: 'ちっ、さっきの揺さぶりが全部繋がったか。……この借り、後半で返すから。',
      en: 'Tch, that quiet setup you played earlier connected right through. I am remembering that.',
    },
    {
      id: 'bbig-3',
      zh: '整串子被拔光的感觉可真不爽……算你厉害，我重整外势。',
      ja: 'ごっそり抜かれるとさすがに癪ね……。認めるわ、外勢から組み直しよ。',
      en: 'Having a whole string swept off the board stings... well played. Time to rebuild from the outside.',
    },
  ]),
  white_capture: Object.freeze([
    {
      id: 'wcap-1',
      zh: '这里没气了，这些子我先收下了。',
      ja: 'ここはもうダメが詰まってるわ。この石は先にいただくわね。',
      en: 'Out of liberties here. I will be taking these stones.',
    },
    {
      id: 'wcap-2',
      zh: '刚才不补一手的结果就是这样，别说我没给过警告。',
      ja: 'さっき手を入れておかなかったツケよ。警告しなかったとは言わせないわ。',
      en: 'This is what skipping the reinforcement gets you. Do not say I never warned you.',
    },
    {
      id: 'wcap-3',
      zh: '提掉了。你的连接比看起来脆得多嘛。',
      ja: '抜いたわよ。あなたの連絡、見た目よりずっと脆いのね。',
      en: 'Captured. Your connections are a lot more fragile than they look.',
    },
  ]),
  white_big_capture: Object.freeze([
    {
      id: 'wbig-1',
      zh: '一整块全没气了——从三手前开始，这块棋就一直在我的算路里。',
      ja: '一団丸ごとアタリから逃げ切れないわ。三手前からもう読み筋に入っていたのよ。',
      en: 'The entire group is out of liberties—this has been inside my reading since three moves ago.',
    },
    {
      id: 'wbig-2',
      zh: '胜负手直接把大龙提穿了。这下你还要硬撑着不补吗？',
      ja: '勝負手で大石が抜けたわ。これでもまだ受けずに強行する気？',
      en: 'Clean through the whole dragon. Still planning to push without defending?',
    },
    {
      id: 'wbig-3',
      zh: '抱歉，但实验里无效的假设本来就该这样一口气清理掉。',
      ja: '悪いけど、実験で破綻した仮説はこうして一気に片づけるものよ。',
      en: 'Sorry, but a broken hypothesis in an experiment gets swept cleanly off the table.',
    },
  ]),
  undo: Object.freeze([
    {
      id: 'undo-1',
      zh: '喂……又用 D-Mail 悔棋了？算了，下不为例，把刚才那步重走吧。',
      ja: 'ちょっと……また Dメールで待った？今回だけよ、さっさと打ち直しなさい。',
      en: 'Hey... using a D-Mail to take back a move again? Fine, just this once. Replay it.',
    },
    {
      id: 'undo-2',
      zh: '改变过去重新读档可不算公平竞争啊……不过看在你发现漏洞的份上，我陪你重算。',
      ja: '過去を書き換えてやり直すなんてフェアじゃないわよ……でも気づいたなら付き合ってあげる。',
      en: 'Rewriting the past for a do-over is hardly fair play... still, if you spotted the flaw, go ahead.',
    },
    {
      id: 'undo-3',
      zh: 'World Line 已修正。这次总能看清后面的变化了吧？',
      ja: '世界線、再設定完了。今度こそ先の変化まで見えているんでしょうね？',
      en: 'World line adjusted. You actually see the follow-up this time, right?',
    },
  ]),
  dispute: Object.freeze([
    {
      id: 'dispute-1',
      zh: '等等，这几颗我可没死净。要数子之前，先把局部下清楚再说。',
      ja: '待って、その石はまだ死にきってないわよ。整地する前に白黒はっきりさせましょう。',
      en: 'Hold on, those stones are not dead yet. Play out the local life-and-death before counting.',
    },
    {
      id: 'dispute-2',
      zh: '想趁数子把活棋直接算成死棋？我可没同意，继续下棋验证！',
      ja: '整地に紛れて生き石まで死石扱いにする気？認めないわ、打ち継いで証明する！',
      en: 'Trying to mark living stones dead at scoring? Not happening—resume play and prove it.',
    },
  ]),
  black_win: Object.freeze([
    {
      id: 'bwin-1',
      zh: '……行吧，数据摆在这里，这局是你赢了。下次可不会再让你这么轻松拿到主导权。',
      ja: '……仕方ないわね、数字が示してる以上あなたの勝ちよ。次はこんなに簡単に主導権は渡さないから。',
      en: '...Fine, the numbers are right there—you win this game. I will not hand over the initiative so easily next time.',
    },
    {
      id: 'bwin-2',
      zh: '收官阶段让你稳稳把优势守住了呢。干得不错，虽然稍微有点不甘心。',
      ja: 'ヨセまできっちりリードを守り切ったわね。……少し悔しいけど、お見事。',
      en: 'You held your lead cleanly all the way through endgame. Well played, even if it stings a little.',
    },
    {
      id: 'bwin-3',
      zh: '这一局你的后半盘比我想象的更冷静。再来一盘的话，我一定把这一城扳回来。',
      ja: 'この一局、後半の落ち着きは想像以上だったわ。もう一局打つなら、次は必ず取り返すから。',
      en: 'Your endgame composure was sharper than I gave you credit for. Play me again and I am taking that point back.',
    },
  ]),
  white_win: Object.freeze([
    {
      id: 'wwin-1',
      zh: '盘面目数已经拉开了。看来这局是我这边的算路稍微更严密一点呢。',
      ja: '盤面の地合いはもう決まったわね。この一局は私の読みの方が少し厳密だったみたい。',
      en: 'The count has settled cleanly. Looks like my calculations held up a bit tighter this game.',
    },
    {
      id: 'wwin-2',
      zh: '承让了。不过中盘那几步拼得不错，复盘时我们可以再推演一次变化。',
      ja: '勝負ありね。でも中盤の攻防は悪くなかったわ。あとで棋譜を一緒に見直しましょう。',
      en: 'Game over. Your middle-game fight was solid though—we should review the record together.',
    },
    {
      id: 'wwin-3',
      zh: '结果收敛了。要是觉得哪手不甘心，点开复盘看看推荐点就行。',
      ja: '結果は収束したわ。納得いかない手があるなら、棋譜再生で候補手を確かめてみなさい。',
      en: 'The result has converged. If a move still bugs you, pull up the replay and check the variations.',
    },
  ]),
  resign: Object.freeze([
    {
      id: 'resign-1',
      zh: '就这么直接投子了？虽然确实已经很难挽回，但提前止损倒也算冷静。',
      ja: 'もう投了するの？確かに覆すのは難しいけど、引き際の見極めだけは冷静ね。',
      en: 'Resigning right here? It was getting hard to turn around, though cutting your losses early is rational enough.',
    },
    {
      id: 'resign-2',
      zh: '好吧，我收下这局了。想翻盘的话，点开复盘找找刚刚到底坏在哪一手吧。',
      ja: 'わかった、この局はいただくわ。悔しいなら再生を開いて、どこで崩れたか検証することね。',
      en: 'Alright, I accept the resignation. If you want a rematch, open the replay and find where things drifted.',
    },
    {
      id: 'resign-3',
      zh: '承认局势劣势也是一种判断力。休息一下，或者我们立刻重开一盘？',
      ja: '劣勢を認めるのも一つの判断力よ。一息つく？それともすぐ次の局を始める？',
      en: 'Recognizing a lost position is its own kind of judgment. Take a breather, or shall we start the next game?',
    },
  ]),
});

export function resolveGoVoiceLanguage(voiceLanguage, displayLocale = 'zh-CN') {
  if (voiceLanguage === 'ja' || voiceLanguage === 'en') return voiceLanguage;
  if (voiceLanguage === 'zh-CN' || voiceLanguage === 'zh') return 'zh';
  const loc = String(displayLocale || '').toLowerCase();
  if (loc.startsWith('ja')) return 'ja';
  if (loc.startsWith('en')) return 'en';
  return 'zh';
}

export function selectGoSpeech(entry, voiceLanguage = 'follow', displayLocale = 'zh-CN') {
  const loc = String(displayLocale || '').toLowerCase();
  const displayKey = loc.startsWith('ja') ? 'ja' : loc.startsWith('en') ? 'en' : 'zh';
  const language = resolveGoVoiceLanguage(voiceLanguage, displayLocale);
  return {
    id: entry.id,
    text: entry[displayKey] || entry.zh,
    speech: entry[language] || entry.zh,
    language,
  };
}

const COOLDOWN_RULES = {
  opening: { immediate: true },
  dispute: { immediate: true },
  black_win: { immediate: true },
  white_win: { immediate: true },
  resign: { immediate: true },
  blunder: { minMoveGap: 2, minMs: 10_000 },
  black_big_capture: { minMoveGap: 2, minMs: 10_000 },
  white_big_capture: { minMoveGap: 2, minMs: 10_000 },
  undo: { minMoveGap: 2, minMs: 10_000 },
  brilliant: { minMoveGap: 4, minMs: 20_000 },
  black_capture: { minMoveGap: 4, minMs: 20_000 },
  white_capture: { minMoveGap: 4, minMs: 20_000 },
};

export function createGoCommentary({ now = () => Date.now() } = {}) {
  const cursors = new Map();
  let lastSpokenAt = 0;
  let lastSpokenMove = -999;

  function pickLine(category) {
    const bank = GO_COMMENTARY_LINES[category];
    if (!bank?.length) return null;
    const index = cursors.get(category) || 0;
    cursors.set(category, (index + 1) % bank.length);
    return bank[index];
  }

  function trigger(category, moveCount = 0) {
    const rule = COOLDOWN_RULES[category] || { minMoveGap: 4, minMs: 20_000 };
    const ts = now();
    if (!rule.immediate) {
      if (moveCount - lastSpokenMove < rule.minMoveGap) return null;
      if (lastSpokenAt > 0 && ts - lastSpokenAt < rule.minMs) return null;
    }
    const entry = pickLine(category);
    if (!entry) return null;
    if (category !== 'opening') {
      lastSpokenAt = ts;
      lastSpokenMove = moveCount;
    }
    return { category, entry };
  }

  return {
    reset() {
      lastSpokenAt = 0;
      lastSpokenMove = -999;
    },
    onOpening() {
      return trigger('opening', 0);
    },
    onUndo(moveCount = 0) {
      lastSpokenMove = Math.min(lastSpokenMove, moveCount - 2);
      return trigger('undo', moveCount);
    },
    onDispute() {
      return trigger('dispute', 0);
    },
    onBlackEvaluated({ prevWinRate, nextWinRate, captured = 0, moveCount = 0, playedTopHint = false, isPass = false } = {}) {
      const delta = Number.isFinite(prevWinRate) && Number.isFinite(nextWinRate) ? nextWinRate - prevWinRate : null;
      const live = Number.isFinite(prevWinRate) && prevWinRate >= 12 && prevWinRate <= 88;
      let category = null;
      if (delta !== null && (delta <= -12 || (live && delta <= -8))) category = 'blunder';
      else if (captured >= 3) category = 'black_big_capture';
      else if (delta !== null && live && delta >= 8) category = 'brilliant';
      else if (captured >= 1) category = 'black_capture';
      else if (!isPass && playedTopHint && moveCount >= 12 && live && (delta === null || delta >= -1.5)) category = 'brilliant';
      return category ? trigger(category, moveCount) : null;
    },
    onWhiteMove({ captured = 0, moveCount = 0 } = {}) {
      if (captured >= 3) return trigger('white_big_capture', moveCount);
      if (captured >= 1) return trigger('white_capture', moveCount);
      return null;
    },
    onGameEnd({ reason, winner } = {}) {
      if (reason === 'resign') return trigger('resign', 0);
      return trigger(winner === BLACK ? 'black_win' : 'white_win', 0);
    },
  };
}
