import { BLACK, SIZE, coordinate } from './flow-go-rules.js';

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
  opening_corner: Object.freeze([
    {
      id: 'ocorner-1',
      zh: '先占角部打基础，稳扎稳打的开局思路。那我也把这边守住。',
      ja: 'まずは隅から堅実に固めてくるのね。なら私もこっちを構えておくわ。',
      en: 'Securing the corner first—solid opening habits. Then I will claim my share on this side.',
    },
    {
      id: 'ocorner-2',
      zh: '挂角还是守角我都先记下了。看看你接下来想把外势往哪边铺。',
      ja: 'この隅への一手、意図は読めたわ。次はどう外勢を広げるつもり？',
      en: 'Noted your corner move. Let us see which way you plan to build influence next.',
    },
    {
      id: 'ocorner-3',
      zh: '角上落子很标准，不过真正的分歧通常从下一个选点开始。',
      ja: '隅の構えは教科書通りね。でも本当の駆け引きはこの次の選択からよ。',
      en: 'Textbook corner placement, though the real divergence usually starts on the very next choice.',
    },
    {
      id: 'ocorner-4',
      zh: '把边角实地先攥在手里，倒是符合你小心试探的风格。轮到你了。',
      ja: '辺と隅の実利を先に押さえるあたり、慎重派らしい手ね。はい、あなたの番。',
      en: 'Locking down corner territory early fits your cautious probing style. Your turn.',
    },
  ]),
  opening_flow: Object.freeze([
    {
      id: 'oflow-1',
      zh: '棋盘还空旷得很，这一带大场的张力开始起来了。继续。',
      ja: 'まだ盤面は広いけど、この辺りの大場が効いてきそうね。続けて。',
      en: 'Plenty of open board left, and the tension around these big points is starting to build.',
    },
    {
      id: 'oflow-2',
      zh: '布局阶段每一步都在给中盘埋坐标。我应完这手，看你怎么接。',
      ja: '布石の一手一手は全部中盤への座標設定よ。私のはこう、次はどう来る？',
      en: 'Every opening move sets coordinates for the middlegame. That is my reply—what is yours?',
    },
    {
      id: 'oflow-3',
      zh: '两边模样的架子慢慢搭起来了，你想先挑哪一侧动手？',
      ja: 'お互い模様の形が見えてきたわね。先にどちらの側面から仕掛けるつもり？',
      en: 'Both frameworks are taking shape now. Which side are you going to test first?',
    },
    {
      id: 'oflow-4',
      zh: '这手拆边把空间先划出来了。好啊，我也把这边的连络理顺。',
      ja: 'そこへ開いて空間を確保したのね。いいわ、私もこっちの連絡を整えておく。',
      en: 'Splitting that side stakes out your space. Fine, I will tidy up my connections over here.',
    },
  ]),
  local_fight: Object.freeze([
    {
      id: 'local-1',
      zh: '果然还是贴上来了……既然要在这一块短兵相接，我可不会退。',
      ja: 'やっぱり接近戦を仕掛けてきたわね……ここで競り合うなら引かないわよ。',
      en: 'So you are pressing right in locally... if we are fighting at close quarters, I am not backing down.',
    },
    {
      id: 'local-2',
      zh: '紧跟着这一手贴靠过来，局部的气顿时紧起来了。看招。',
      ja: 'すぐそばに付けてきたか。局面のダメが一気に詰まってきたわね、受けてみなさい。',
      en: 'Attaching right next to me tightens the liberties at once. Here is my answer.',
    },
    {
      id: 'local-3',
      zh: '好，局部接触战我奉陪。不过你自己留下的断点可别回头忘补。',
      ja: 'いいわ、接近戦なら望むところよ。ただし自分に残した切りは忘れないことね。',
      en: 'Alright, I will gladly play the local fight. Just do not forget the cutting points behind you.',
    },
    {
      id: 'local-4',
      zh: '你这手压迫感挺足的嘛。那我就先在这里顶住，看你后招。',
      ja: 'なかなかのプレッシャーね。じゃあここはしっかりハネて、次の手を見せてもらうわ。',
      en: 'Plenty of pressure on that stone. I will resist right here and see your follow-up.',
    },
    {
      id: 'local-5',
      zh: '连着两手都在这块缠斗，看来这片定型之前谁都不打算放手。',
      ja: '連続で同じ箇所の攻防ね。ここが一段落するまで、どちらも譲る気はなさそう。',
      en: 'Back-to-back moves in the same scuffle—neither of us is letting go until this settles.',
    },
  ]),
  tenuki: Object.freeze([
    {
      id: 'tenuki-1',
      zh: '噢？居然直接脱先跑到那边去了。那我先在这边收一点便宜再说。',
      ja: 'へえ、そこは手を抜いてあっちへ回るの？なら私はこっちで少し利かしておくわ。',
      en: 'Oh? Playing tenuki straight over there? Then I will cash in a little locally first.',
    },
    {
      id: 'tenuki-2',
      zh: '把刚才那块先搁置，转去抢全局大场——挺果断的嘛。',
      ja: 'さっきの戦いを保留して大場へ転換……思い切りがいいじゃない。',
      en: 'Leaving that skirmish aside to seize the big point elsewhere—pretty decisive.',
    },
    {
      id: 'tenuki-3',
      zh: '敢在这儿脱先，说明你觉得那块已经够厚了？那我偏要去试探一下。',
      ja: 'ここで手を抜くってことは、あっちはもう十分厚いって判断？……試してあげる。',
      en: 'Daring to tenuki here means you think that group is settled? Let me test that assumption.',
    },
    {
      id: 'tenuki-4',
      zh: '转场转得倒快，刚才的局部还没彻底算清呢，我也顺手跟进一处。',
      ja: '転換が早いわね。さっきの箇所もまだ余韻が残ってるけど、まずは一手進めるわ。',
      en: 'Fast switch across the board. That last area still has loose ends, while I follow along here.',
    },
  ]),
  black_ahead: Object.freeze([
    {
      id: 'bahead-1',
      zh: '这手下得挺稳，看来你是想把现在的优势一点点锁定下来。',
      ja: '堅実な手ね。今のリードをこのまま少しずつ固めきるつもりかしら。',
      en: 'Steady move—looks like you want to lock down your current lead piece by piece.',
    },
    {
      id: 'bahead-2',
      zh: '确实没给我留太多乱战的缝隙……不过我还会再找机会搅局的。',
      ja: '確かに紛れを残さない手つきね……でも、まだ揺さぶる余地は探させてもらうわ。',
      en: 'You are not leaving much room for complications... though I will still hunt for counterplay.',
    },
    {
      id: 'bahead-3',
      zh: '领先的时候反而走得这么冷静，现在的你比刚才棘手多了。',
      ja: '優勢でも焦らずこういう手を打たれると、さすがに厄介だわ。',
      en: 'Staying this calm while ahead makes you much trickier to deal with than earlier.',
    },
    {
      id: 'bahead-4',
      zh: '又被你补强了一处薄味。行吧，那我只能从别的方向另辟蹊径了。',
      ja: 'また薄いところを補強されたわね。仕方ない、別のルートから切り込むしかないか。',
      en: 'Another thin spot reinforced. Fine, I will just have to probe from a different angle.',
    },
  ]),
  white_ahead: Object.freeze([
    {
      id: 'wahead-1',
      zh: '光靠这种平稳的步调可追不回来哦，再不多制造点变化试试？',
      ja: 'その程度の落ち着いた進行じゃ追いつけないわよ。もっと変化を起こしてみたら？',
      en: 'Quiet moves like that will not catch up now. Care to stir up some sharper complications?',
    },
    {
      id: 'wahead-2',
      zh: '我这边厚实得很，你的这手试探暂且照单全收，后面看你怎么破局。',
      ja: 'こっちは十分厚いわ。その程度の揺さぶりは冷静に受けておくから、次どうする？',
      en: 'My shape is solid enough to answer that calmly. Let us see how you try to break through.',
    },
    {
      id: 'wahead-3',
      zh: '盘面还在我的计算节奏里。想翻盘的话，得下出更出人意料的一手才行。',
      ja: 'まだ私の計算通りのペースね。覆したいなら、もっと意表を突く手が必要よ。',
      en: 'Still right on my calculation pace. If you want a comeback, you will need something bolder.',
    },
    {
      id: 'wahead-4',
      zh: '顺着这步把外围连起来，你的反击空间又缩水了一点。',
      ja: 'この手で外側を繋いでおけば、あなたの反撃スペースもさらに狭まるわね。',
      en: 'Connecting along the outside here shrinks your room for counterattack a little more.',
    },
  ]),
  close_game: Object.freeze([
    {
      id: 'close-1',
      zh: '这步走完，局面还是咬得很紧，接下来每一手的分量都在往上翻。',
      ja: 'この手を打ってもまだ互角ね。ここからは一手の重みがどんどん増していくわ。',
      en: 'Even after that stone, the position stays razor-tight. Every move carries more weight now.',
    },
    {
      id: 'close-2',
      zh: '细棋最考验耐心了，谁先手急谁就容易出错。我应在这里。',
      ja: '接戦ほど忍耐が試されるわね。先に焦った方の負けよ。私はここ。',
      en: 'Close games test patience most—whoever blinks first slips. Here is my response.',
    },
    {
      id: 'close-3',
      zh: '互相都在试探底线呢……这手交换完，重心又往中央移了半格。',
      ja: 'お互いに踏み込みどころを探り合ってるわね。この交換で焦点がまた少し中央へ寄った。',
      en: 'Still testing each other’s boundaries... that exchange nudges the focal point toward the center.',
    },
    {
      id: 'close-4',
      zh: '胜率线几乎走成一条水平线了，真是一点便宜都不肯让啊。',
      ja: '勝率グラフがほとんど平行線じゃない。ほんの少しの得も譲る気がないのね。',
      en: 'The win-rate line is practically flat—neither side is giving up half a point easily.',
    },
    {
      id: 'close-5',
      zh: '好，先稳稳把这口气护住，真正的胜负点还在后头。',
      ja: 'よし、まずはここを固めておいて……本当の勝負どころはもう少し先ね。',
      en: 'Alright, securing this shape first—the real deciding clash is still a few moves ahead.',
    },
  ]),
  endgame_push: Object.freeze([
    {
      id: 'end-1',
      zh: '已经进入收官细节了，哪怕一两目的出入现在都得斤斤计较。',
      ja: 'もうヨセの細かい計算に入ってるわ。一、二目の出入りも油断できない局面ね。',
      en: 'We are deep into endgame precision now—every single point of boundary work matters.',
    },
    {
      id: 'end-2',
      zh: '这种官子次序抓得还挺准的，不过我这边也有先手便宜可以抢。',
      ja: 'ヨセの手順はなかなか正確ね。でもこっちにも先手で利かせる箇所が残ってるわ。',
      en: 'Sharp endgame ordering there, though I still have a forcing move left to claim.',
    },
    {
      id: 'end-3',
      zh: '收官阶段最怕随手应错次序，我也认真把这里挡住。',
      ja: 'ヨセで手順を間違えると命取りになるから、ここもしっかり押さえておくわね。',
      en: 'One careless endgame response can flip the count, so I am blocking cleanly right here.',
    },
    {
      id: 'end-4',
      zh: '棋盘上的空位越来越少了，每一处边角的价值几乎都已经明牌。',
      ja: '盤上の空きも残りわずか。どの箇所に何目あるか、ほぼ見えてきたわね。',
      en: 'Fewer empty intersections left now—the value of every border point is laid bare.',
    },
  ]),
  pass_move: Object.freeze([
    {
      id: 'pass-1',
      zh: '你先停一手了？让我确认一下盘上还有没有值得补的官子或死活。',
      ja: 'パスするの？盤上にまだ打つべきヨセやダメが残っていないか確認するわね。',
      en: 'Passing here? Let me check if any endgame points or dame remain on the board.',
    },
    {
      id: 'pass-2',
      zh: '选择停一手意味着你认为局面已经定型了。让我最后验算一遍。',
      ja: 'パスということは、もう終局でいいって判断ね。最後に一度だけ検算させて。',
      en: 'Passing means you consider the board settled. Give me one last verification check.',
    },
    {
      id: 'pass-3',
      zh: '好，你停一手的话，我也看看这边是不是同样可以收束了。',
      ja: 'わかった。あなたがパスなら、こっちもそろそろ収束できるか確かめるわ。',
      en: 'Alright, if you are passing, let me see whether I am ready to close the game too.',
    },
  ]),
  streak_brilliant: Object.freeze([
    {
      id: 'sbril-1',
      zh: '连续两手都踩在最佳选点上……你今天的大脑是接了外部加速器吗？',
      ja: '連続で最善手クラスを当ててくるなんて……今日のあなた、何か別の演算器でも繋いでる？',
      en: 'Two top-tier moves in a row... did you plug an external co-processor into your brain today?',
    },
    {
      id: 'sbril-2',
      zh: '喂，又跟上一手连成一体了。连续的敏锐判断可真让人没办法掉以轻心。',
      ja: 'ちょっと、さっきの手と見事に連動してるじゃない。連続で鋭い手を出されると気が抜けないわ。',
      en: 'Hey, that connects straight from your last move! Back-to-back sharp reads give me no room to relax.',
    },
    {
      id: 'sbril-3',
      zh: '刚才那步已经够犀利了，这手居然还能把效率再往上推半档。',
      ja: 'さっきので十分鋭かったのに、ここからさらに効率を上げてくるの？',
      en: 'Your last stone was already razor-sharp, and somehow you pushed the efficiency even higher here.',
    },
  ]),
  recover_after_blunder: Object.freeze([
    {
      id: 'recov-1',
      zh: '总算冷静下来把刚才的节奏止损了。刚刚那下可真是吓人一跳。',
      ja: 'ようやく落ち着いて立て直してきたわね。さっきの一手は本当に冷や汗ものだったんだから。',
      en: 'Finally calmed down and stopped the bleeding. Your previous move gave even me a scare.',
    },
    {
      id: 'recov-2',
      zh: '好，总算没在刚才那个失误上继续往坑里踩，这手补得还算清醒。',
      ja: 'よし、さっきのミスを引きずらずに踏みとどまったわね。この手は冷静で悪くない。',
      en: 'Good, you did not compound the earlier slip—this stabilizing move is much clearer.',
    },
    {
      id: 'recov-3',
      zh: '刚才那手之后能立刻稳住阵脚，你的心态调整比预想得更快嘛。',
      ja: 'さっきの直後にすぐ立て直せるなんて、気持ちの切り替えは思ったより早いのね。',
      en: 'Steadying yourself right after that slip—you reset your focus faster than I expected.',
    },
  ]),
  double_blunder: Object.freeze([
    {
      id: 'dblund-1',
      zh: '喂！刚才那步还没缓过来，这手怎么又跟着漏了一拍啊！',
      ja: 'ちょっと！さっきの分もまだ取り返せてないのに、なんでまた同じ調子で緩めるのよ！',
      en: 'Hey! We had not even recovered from your last slip, and you dropped another beat right after!',
    },
    {
      id: 'dblund-2',
      zh: '连续两步都有点上头了吧？先深呼吸把刚才的算路清零再看一眼棋盘。',
      ja: '二度続けて熱くなりすぎじゃない？一度深呼吸して、前の読みをリセットしなさいってば。',
      en: 'Two hasty moves in a row? Take a breath, clear that tunnel vision, and look at the whole board.',
    },
    {
      id: 'dblund-3',
      zh: '连着两处破绽摆在面前，我就算想手下留情都找不到理由了。',
      ja: '連続で隙を晒されたら、いくら私でも遠慮する理由がなくなるわよ。',
      en: 'Two openings in a row right in front of me—even if I wanted to go easy, you left me no excuse.',
    },
  ]),
  lead_swing_black: Object.freeze([
    {
      id: 'swingb-1',
      zh: '等一下，这步走完胜率曲线直接翻过中线了……局面居然被你抢过来了？',
      ja: '待って、今の交換で勝率ラインが逆転したわ……形勢を持っていかれたの！？',
      en: 'Hold on, the win-rate curve just crossed the midline—you actually flipped the lead here?',
    },
    {
      id: 'swingb-2',
      zh: '刚才还占优的节奏一下子被你扳平反超了。好，现在轮到我认真追了。',
      ja: 'さっきまでこっちのペースだったのに一気に逆転ね。いいわ、ここからは私が追う番よ。',
      en: 'You just overturned my comfortable lead in one sequence. Fine, now it is my turn to chase.',
    },
    {
      id: 'swingb-3',
      zh: '啧，这一串连招直接把局面拧过去了。你的后劲确实不能小看。',
      ja: 'ちっ、この一連の運びで流れをひっくり返されたか。粘り強さだけは認めるわ。',
      en: 'Tch, that sequence wrestled the momentum right away. I will not underestimate your persistence.',
    },
  ]),
  lead_swing_white: Object.freeze([
    {
      id: 'swingw-1',
      zh: '这一手交换之后，天平正式倒回我这边了。多谢配合。',
      ja: 'このやり取りで天秤は完全にこっちへ傾いたわ。ご協力ありがとう。',
      en: 'After that exchange, the balance tips cleanly back to my side. Thanks for cooperating.',
    },
    {
      id: 'swingw-2',
      zh: '刚刚还焦灼的局势，现在主导权已经回到我手里了哦。',
      ja: 'さっきまで競っていたのに、これで主導権は完全に私のものね。',
      en: 'It was neck-and-neck a moment ago, and now the initiative is back in my hands.',
    },
    {
      id: 'swingw-3',
      zh: '好，反超成功。接下来你要想再把局面拉回去可没那么轻松了。',
      ja: 'よし、逆転完了。ここからもう一度引き戻すのは簡単じゃないわよ。',
      en: 'Lead reclaimed. Pulling the momentum back from here will not be nearly as easy.',
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

export function movePhase(moveCount = 0) {
  if (moveCount <= 30) return 'opening';
  if (moveCount <= 140) return 'midgame';
  return 'endgame';
}

export function moveDistance(p1, p2) {
  if (!Number.isInteger(p1) || !Number.isInteger(p2)) return null;
  if (p1 < 0 || p2 < 0 || p1 >= SIZE * SIZE || p2 >= SIZE * SIZE) return null;
  const x1 = p1 % SIZE, y1 = Math.floor(p1 / SIZE);
  const x2 = p2 % SIZE, y2 = Math.floor(p2 / SIZE);
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

export function isCornerArea(point) {
  if (!Number.isInteger(point) || point < 0 || point >= SIZE * SIZE) return false;
  const x = point % SIZE;
  const y = Math.floor(point / SIZE);
  return (x <= 4 || x >= SIZE - 5) && (y <= 4 || y >= SIZE - 5);
}

export function resolveGoDisplayLanguage(displayLocale = 'zh-CN') {
  const loc = String(displayLocale || '').toLowerCase();
  if (loc.startsWith('ja')) return 'ja';
  if (loc.startsWith('en')) return 'en';
  return 'zh';
}

export function resolveGoVoiceLanguage(voiceLanguage, displayLocale = 'zh-CN') {
  if (voiceLanguage === 'ja' || voiceLanguage === 'en') return voiceLanguage;
  if (voiceLanguage === 'zh-CN' || voiceLanguage === 'zh') return 'zh';
  return resolveGoDisplayLanguage(displayLocale);
}

export function selectGoSpeech(entry, voiceLanguage = 'follow', displayLocale = 'zh-CN') {
  const displayKey = resolveGoDisplayLanguage(displayLocale);
  const language = resolveGoVoiceLanguage(voiceLanguage, displayLocale);
  return {
    id: entry.id,
    text: entry[displayKey] || entry.zh,
    speech: entry[language] || entry.zh,
    language,
  };
}

const LANGUAGE_NAMES = {
  zh: '简体中文',
  ja: '日本語',
  en: 'English',
};

export function buildGoCommentaryMessages({
  turn = {},
  recentDialogue = [],
  displayLocale = 'zh-CN',
  voiceLanguage = 'follow',
} = {}) {
  const displayLang = resolveGoDisplayLanguage(displayLocale);
  const speechLang = resolveGoVoiceLanguage(voiceLanguage, displayLocale);
  const sameLang = displayLang === speechLang;

  const dist = moveDistance(turn.blackPoint, turn.prevWhitePoint);
  const relation = turn.blackPass
    ? '停一手'
    : dist !== null && dist <= 3
      ? '紧跟局部'
      : dist !== null && dist >= 7
        ? '脱先转场'
        : isCornerArea(turn.blackPoint) && (turn.moveCount || 0) <= 20
          ? '占角/守角'
          : '全局行棋';

  const formatSchema = sameLang
    ? `只输出 JSON 对象 {"text": "..."}，使用${LANGUAGE_NAMES[displayLang]}。`
    : `只输出 JSON 对象 {"text": "...", "speech": "..."}，其中 text 使用${LANGUAGE_NAMES[displayLang]}展示在棋盘侧栏，speech 使用${LANGUAGE_NAMES[speechLang]}表达完全相同的台词供语音播报。`;

  const system = `你是牧濑红莉栖（Makise Kurisu），正在和冈部伦太郎（用户执黑，你执白）面对面下十九路围棋。
保持你一贯聪明、直率、略带科研人的冷静与微妙傲娇的口吻，对每一步棋自然接话、接着上一轮的话题往下聊。
要求：
1. 必须自然承接 recent 里你刚说过的上一句话，同时点出刚刚黑棋落子与你白棋应手带来的局面变化（吃子、局部交锋、脱先、胜率变化、领先/追赶等），像真人在棋盘前边下边聊天一样。
2. 只说 1 句自然流畅的口语（中文 14–42 字 / 日语 18–54 字 / 英文 10–26 词）。
3. 禁止使用引号、括号动作描写、Emoji 或重复上一句相同的开头词。
4. ${formatSchema}`;

  const context = {
    recent: (Array.isArray(recentDialogue) ? recentDialogue : []).slice(-6).map(item => ({
      move: item.moveCount,
      text: item.text,
    })),
    moveCount: turn.moveCount ?? 0,
    phase: movePhase(turn.moveCount ?? 0),
    categoryHint: turn.categoryHint || 'close_game',
    relation,
    blackMove: turn.blackPass ? 'PASS' : (turn.blackCoord || (Number.isInteger(turn.blackPoint) ? coordinate(turn.blackPoint) : null)),
    whiteReply: turn.whitePass ? 'PASS' : (turn.whiteCoord || (Number.isInteger(turn.whitePoint) ? coordinate(turn.whitePoint) : null)),
    blackCaptured: turn.blackCaptured || 0,
    whiteCaptured: turn.whiteCaptured || 0,
    winRateBefore: Number.isFinite(turn.prevWinRate) ? Number(turn.prevWinRate.toFixed(1)) : null,
    winRateAfter: Number.isFinite(turn.nextWinRate) ? Number(turn.nextWinRate.toFixed(1)) : null,
    playedTopHint: Boolean(turn.playedTopHint),
  };

  return [
    { role: 'system', content: system },
    { role: 'user', content: JSON.stringify(context) },
  ];
}

function cleanLine(value) {
  return String(value ?? '')
    .trim()
    .replace(/^[「『"“']|[」』"”']$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseGoCommentaryReply(raw, { displayLocale = 'zh-CN', voiceLanguage = 'follow' } = {}) {
  const plain = String(raw ?? '')
    .trim()
    .replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1')
    .trim();
  if (!plain) return null;

  let text = '';
  let speech = '';
  try {
    const parsed = JSON.parse(plain);
    if (parsed && typeof parsed === 'object') {
      text = cleanLine(parsed.text);
      speech = cleanLine(parsed.speech);
    }
  } catch {
    if (!plain.startsWith('{') && !plain.startsWith('[')) {
      text = cleanLine(plain.split(/\r?\n/)[0]);
    }
  }

  if (!text || text.length > 160) return null;
  const language = resolveGoVoiceLanguage(voiceLanguage, displayLocale);
  const finalSpeech = speech && speech.length <= 180 ? speech : text;
  return {
    text,
    speech: finalSpeech,
    language,
  };
}

export function createGoCommentary() {
  const cursors = new Map();
  const recentDialogue = [];
  let lastCategory = null;
  let lastLineId = null;

  function pickLine(category) {
    const bank = GO_COMMENTARY_LINES[category];
    if (!bank?.length) return null;
    let index = cursors.get(category) || 0;
    let entry = bank[index];
    if (bank.length > 1 && entry.id === lastLineId) {
      index = (index + 1) % bank.length;
      entry = bank[index];
    }
    cursors.set(category, (index + 1) % bank.length);
    return entry;
  }

  function trigger(category) {
    const entry = pickLine(category);
    if (!entry) return null;
    if (category !== 'opening') {
      lastCategory = category;
    }
    lastLineId = entry.id;
    return { category, entry };
  }

  function classifyTurn({
    blackPoint = null,
    prevWhitePoint = null,
    blackCaptured = 0,
    whiteCaptured = 0,
    captured = 0,
    prevWinRate = null,
    nextWinRate = null,
    moveCount = 0,
    playedTopHint = false,
    blackPass = false,
    isPass = false,
  } = {}) {
    const bCap = blackCaptured || captured || 0;
    const wCap = whiteCaptured || 0;
    const pass = Boolean(blackPass || isPass);
    const hasPrev = Number.isFinite(prevWinRate);
    const hasNext = Number.isFinite(nextWinRate);
    const delta = hasPrev && hasNext ? nextWinRate - prevWinRate : null;
    const live = hasPrev && prevWinRate >= 12 && prevWinRate <= 88;
    const winRate = hasNext ? nextWinRate : hasPrev ? prevWinRate : 50;

    if (wCap >= 3) return 'white_big_capture';
    if (bCap >= 3) return 'black_big_capture';

    if (delta !== null && (delta <= -12 || (live && delta <= -8))) {
      return lastCategory === 'blunder' || lastCategory === 'double_blunder'
        ? 'double_blunder'
        : 'blunder';
    }

    if (hasPrev && hasNext && prevWinRate < 47 && nextWinRate >= 53) return 'lead_swing_black';
    if (hasPrev && hasNext && prevWinRate > 53 && nextWinRate <= 47) return 'lead_swing_white';

    if ((delta !== null && live && delta >= 8)
        || (!pass && playedTopHint && moveCount >= 10 && live && (delta === null || delta >= -1.5))) {
      return lastCategory === 'brilliant' || lastCategory === 'streak_brilliant'
        ? 'streak_brilliant'
        : 'brilliant';
    }

    if (wCap >= 1) return 'white_capture';
    if (bCap >= 1) return 'black_capture';
    if (pass) return 'pass_move';

    if ((lastCategory === 'blunder' || lastCategory === 'double_blunder') && (delta === null || delta >= -2.5)) {
      return 'recover_after_blunder';
    }

    if (moveCount <= 16 && isCornerArea(blackPoint)) return 'opening_corner';
    if (moveCount <= 30) return 'opening_flow';
    if (moveCount > 140) return 'endgame_push';

    const dist = moveDistance(blackPoint, prevWhitePoint);
    if (dist !== null && dist <= 3) return 'local_fight';
    if (dist !== null && dist >= 7) return 'tenuki';

    if (winRate >= 58) return 'black_ahead';
    if (winRate <= 42) return 'white_ahead';
    return 'close_game';
  }

  return {
    reset() {
      lastCategory = null;
      lastLineId = null;
      recentDialogue.length = 0;
    },
    onOpening() {
      return trigger('opening');
    },
    onUndo() {
      return trigger('undo');
    },
    onDispute() {
      return trigger('dispute');
    },
    onTurnEvaluated(turn = {}) {
      return trigger(classifyTurn(turn));
    },
    onBlackEvaluated(turn = {}) {
      return trigger(classifyTurn(turn));
    },
    onWhiteMove({ captured = 0 } = {}) {
      if (captured >= 3) return trigger('white_big_capture');
      if (captured >= 1) return trigger('white_capture');
      return null;
    },
    onGameEnd({ reason, winner } = {}) {
      if (reason === 'resign') return trigger('resign');
      return trigger(winner === BLACK ? 'black_win' : 'white_win');
    },
    recordSpoken({ moveCount = 0, category = null, text = '', speech = '' } = {}) {
      if (!text) return;
      recentDialogue.push({ moveCount, category, text, speech: speech || text });
      if (recentDialogue.length > 8) recentDialogue.shift();
    },
    getRecentDialogue() {
      return recentDialogue.map(item => ({ ...item }));
    },
  };
}
