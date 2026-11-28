// Materia AI Assistant -> Flow Achievements System
// - Research and companion milestones across four tracks
// - Integrates with the AI assistant Flow menu
// - Reads local focus stats and listens to custom 'materia:achievement-event' triggers
// - Shows tiered holographic collector's unlock plaque with spark bursts, 3D hover tilt & chimes

const STORAGE_KEY = 'materia.flow.achievements.v1';

const LEGENDARY_IDS = new Set([
  'hundred-papers',
  'r2-master',
  'citation-weaver',
  'streak-7',
  'deep-flow-4h',
  'all-companions',
  'trusted-partner',
  'orbit-reversal-20',
  'montage-master',
  'worldline-observer',
  'singularity-weaver',
]);

const SPARK_SEEDS = [
  { x: -58, y: -38, rot: -48, delay: 0.02, size: 7, kind: 'star' },
  { x: 54, y: -44, rot: 36, delay: 0.05, size: 6, kind: 'dot' },
  { x: -64, y: 12, rot: -70, delay: 0.04, size: 8, kind: 'ribbon' },
  { x: 62, y: 18, rot: 65, delay: 0.07, size: 7, kind: 'star' },
  { x: -42, y: -56, rot: 22, delay: 0.09, size: 5, kind: 'dot' },
  { x: 40, y: -58, rot: -32, delay: 0.03, size: 8, kind: 'ribbon' },
  { x: -48, y: 46, rot: 54, delay: 0.08, size: 6, kind: 'star' },
  { x: 46, y: 48, rot: -52, delay: 0.06, size: 6, kind: 'dot' },
  { x: 0, y: -62, rot: 12, delay: 0.01, size: 8, kind: 'star' },
  { x: 6, y: 58, rot: 85, delay: 0.1, size: 7, kind: 'ribbon' },
  { x: -72, y: -14, rot: -82, delay: 0.06, size: 5, kind: 'dot' },
  { x: 74, y: -12, rot: 78, delay: 0.04, size: 6, kind: 'star' },
  { x: -24, y: -52, rot: 40, delay: 0.11, size: 6, kind: 'ribbon' },
  { x: 26, y: -50, rot: -42, delay: 0.12, size: 5, kind: 'dot' },
  { x: -22, y: 54, rot: -26, delay: 0.09, size: 6, kind: 'dot' },
  { x: 24, y: 52, rot: 34, delay: 0.05, size: 7, kind: 'star' },
];

export function achievementTier(ach) {
  if (!ach) return 'milestone';
  if (ach.category === 'daily') return 'daily';
  if (LEGENDARY_IDS.has(ach.id)) return 'legendary';
  return 'milestone';
}

export function companionDisplayName(role) {
  if (role === 'makise-kurisu') return '牧濑红莉栖';
  if (role === 'chainsawman-reze') return '蕾塞';
  if (role === 'genshin-ganyu') return '甘雨';
  return '心流伴侣';
}

function playAchievementChime(tier) {
  try {
    const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const now = ctx.currentTime;
    const specs = tier === 'legendary'
      ? [[523.25, 0], [659.25, 0.08], [783.99, 0.16], [987.77, 0.25], [1046.5, 0.35]]
      : tier === 'milestone'
        ? [[587.33, 0], [739.99, 0.09], [880, 0.18], [1174.66, 0.29]]
        : [[523.25, 0], [783.99, 0.12]];
    const decay = tier === 'legendary' ? 0.95 : tier === 'milestone' ? 0.72 : 0.55;
    const peak = tier === 'legendary' ? 0.075 : 0.065;
    specs.forEach(([freq, offset]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(peak, now + offset + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + decay);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + decay + 0.06);
    });
    const maxOffset = specs.reduce((m, [, offset]) => Math.max(m, offset), 0);
    setTimeout(() => ctx.close().catch(() => {}), Math.round((maxOffset + decay + 0.4) * 1000));
  } catch {}
}

function medalRingSVG() {
  const ticks = Array.from({ length: 8 }, (_, i) => {
    const a = (i * 45 * Math.PI) / 180;
    const x1 = (34 + 26.5 * Math.cos(a)).toFixed(1);
    const y1 = (34 + 26.5 * Math.sin(a)).toFixed(1);
    const x2 = (34 + 30.5 * Math.cos(a)).toFixed(1);
    const y2 = (34 + 30.5 * Math.sin(a)).toFixed(1);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }).join('');
  return `
    <svg class="ach-medal-svg" viewBox="0 0 68 68" aria-hidden="true">
      <circle class="ach-medal-outer" cx="34" cy="34" r="31"/>
      <g class="ach-medal-filigree">
        <circle class="ach-medal-dashed" cx="34" cy="34" r="27"/>
        <g class="ach-medal-ticks">${ticks}</g>
      </g>
      <circle class="ach-medal-inner" cx="34" cy="34" r="22.5"/>
    </svg>
  `;
}

function sparkBurstHTML(count = 16) {
  return Array.from({ length: count }, (_, i) => {
    const s = SPARK_SEEDS[i % SPARK_SEEDS.length];
    return `<span class="ach-spark is-${s.kind}" style="--sx:${s.x}px;--sy:${s.y}px;--srot:${s.rot}deg;--sdelay:${s.delay}s;--ssize:${s.size}px" aria-hidden="true"></span>`;
  }).join('');
}

function openToastLayer(el, ownerDialog) {
  if (!el) return;
  const targetHost = ownerDialog?.open ? ownerDialog : document.body;
  if (targetHost && el.parentElement !== targetHost) {
    targetHost.append(el);
  }
  el.hidden = false;
  try {
    if (typeof el.showPopover === 'function' && !el.matches(':popover-open')) {
      el.showPopover();
    }
  } catch {}
}

function closeToastLayer(el) {
  if (!el) return;
  try {
    if (typeof el.hidePopover === 'function' && el.matches(':popover-open')) {
      el.hidePopover();
    }
  } catch {}
  el.hidden = true;
}

export const ACHIEVEMENT_CATEGORIES = [
  { id: 'all', label: '全部' },
  { id: 'daily', label: '每日成就' },
  { id: 'reading', label: '研读星图' },
  { id: 'chrono', label: '番茄节律' },
  { id: 'lab', label: '建模绘图' },
  { id: 'flow', label: '心流陪伴' },
];

const DAILY_ACHIEVEMENTS = [
  {
    id: 'daily-deep-read',
    icon: '✦',
    title: '精读一篇',
    desc: '今日将一篇文献的阅读状态设为「精读」。',
    target: 1,
    unit: '篇',
    metric: 'dailyDeepReads',
    quote: '今天又读透了一篇，记下最值得回看的发现吧。',
  },
  {
    id: 'daily-focus',
    icon: '◎',
    title: '每日专注',
    desc: '今日累计有效专注 60 分钟。',
    target: 60,
    unit: '分钟',
    metric: 'focusMinutes',
    quote: '今天已经专注了一小时，起来活动一下吧。',
  },
  {
    id: 'daily-pomodoro',
    icon: '◔',
    title: '一颗番茄',
    desc: '今日完成一个番茄钟倒计时。',
    target: 1,
    unit: '个',
    metric: 'pomodoros',
    quote: '今天的第一个番茄钟结束啦，休息一下吧。',
  },
  {
    id: 'daily-companion',
    icon: '❋',
    title: '每日会面',
    desc: '今日收到一次 AI 科研伴侣的回复。',
    target: 1,
    unit: '轮',
    metric: 'companionReplies',
    quote: '今天也见面了，有什么发现就随时一起聊吧。',
  },
  {
    id: 'daily-board-game',
    icon: '♞',
    title: '落子有时',
    desc: '今日完成一局心流国际象棋或围棋。',
    target: 1,
    unit: '局',
    metric: 'flowGamesFinished',
    quote: '今天的棋局结束了，下次再来一局。',
  },
].map(achievement => ({ ...achievement, category: 'daily' }));

const DAILY_EVENT_METRICS = new Set(['dailyDeepReads', 'companionReplies', 'flowGamesFinished']);

const ORBIT_ACHIEVEMENTS = [
  [1, '初见逆行', '刚刚有一颗星球掉头了。'],
  [5, '逆行观测者', '已经记录到五次轨道反转。'],
  [10, '逆行追踪者', '第十次掉头也被你捕捉到了。'],
  [20, '逆行星图', '星图已经记下了二十次逆行。'],
].map(([target, title, quote]) => ({
  id: 'orbit-reversal-' + target,
  category: 'flow',
  icon: '↶',
  title,
  desc: '在星图中累计观测到 ' + target + ' 次星球反转。',
  target,
  unit: '次',
  metric: 'orbitReversals',
  quote,
}));

export const ACHIEVEMENTS = [
  // 1. 研读与星图
  {
    id: 'first-deep-read',
    category: 'reading',
    icon: '✦',
    title: '初入星海',
    desc: '将第一篇文献标记为「精读」状态。',
    target: 1,
    unit: '篇',
    metric: 'deepReadCount',
    quotes: {
      'makise-kurisu': '这才只是第一篇而已，别这么快就得意忘形了……不过干得不错。',
      'chainsawman-reze': '第一篇读完啦，节奏很舒服呢。',
      'genshin-ganyu': '万事开头难，您已经迈出了很稳的一步。',
      default: '星海漫长，第一颗星已经点亮。',
    },
  },
  {
    id: 'hundred-papers',
    category: 'reading',
    icon: '◈',
    title: '百篇斩',
    desc: '累计精读文献达到 100 篇。',
    target: 100,
    unit: '篇',
    metric: 'deepReadCount',
    quotes: {
      'makise-kurisu': '一百篇精读？你的脑容量居然还没溢出，真有点刮目相看了。',
      'chainsawman-reze': '一百篇诶，感觉你已经把这一块翻了个底朝天。',
      'genshin-ganyu': '百篇精读的积累非常扎实，请务必注意护眼休息。',
      default: '百篇精读达成，你的知识星图已成气候。',
    },
  },
  {
    id: 'heavy-annotator',
    category: 'reading',
    icon: '✎',
    title: '划重点狂魔',
    desc: '单篇 PDF 文献累计批注与高亮达到 20 条。',
    target: 20,
    unit: '条',
    metric: 'maxAnnotationsPerPaper',
    quotes: {
      'makise-kurisu': '整页都是批注，这篇论文怕不是被你拆解到分子级别了吧。',
      'chainsawman-reze': '画了这么多重点，看来这篇真的很合你胃口。',
      'genshin-ganyu': '细致入微的批注会在写论文时帮上大忙的。',
      default: '单篇批注破二十，真正的精读选手。',
    },
  },
  {
    id: 'citation-weaver',
    category: 'reading',
    icon: '✧',
    title: '引文织网者',
    desc: '在真实引文星图中建立至少 50 条有向引用连线。',
    target: 50,
    unit: '条连线',
    metric: 'citationEdgeCount',
    quotes: {
      'makise-kurisu': '因果链条终于连成网络了——这才是研究该有的全局视角。',
      'chainsawman-reze': '这些连线像星空里的丝线一样漂亮呢。',
      'genshin-ganyu': '脉络清晰之后，找前沿缺口也会轻松许多。',
      default: '五十条真实引文连线，学术脉络尽收眼底。',
    },
  },

  // 2. 番茄钟与节律
  {
    id: 'streak-7',
    category: 'chrono',
    icon: '◔',
    title: '连击七日',
    desc: '番茄钟科研热力图连续 7 天保持记录。',
    target: 7,
    unit: '天',
    metric: 'chronoStreakDays',
    quotes: {
      'makise-kurisu': '连续七天没有断档，自律得简直不像平时那个你。',
      'chainsawman-reze': '连续一周都在认真推进呢，奖励自己喝杯好的吧。',
      'genshin-ganyu': '持之以恒是最难得的品质，辛苦您了。',
      default: '连续七日保持科研节律，热力图正在发光。',
    },
  },
  {
    id: 'deep-flow-4h',
    category: 'chrono',
    icon: '◎',
    title: '深度心流',
    desc: '单日累计有效科研专注时长达到 4 小时。',
    target: 240,
    unit: '分钟',
    metric: 'maxDailyFocusMinutes',
    quotes: {
      'makise-kurisu': '四小时高强度专注……喂，去喝口水活动下颈椎，这是科学建议。',
      'chainsawman-reze': '整整四个小时没停过，今天效率超高啊。',
      'genshin-ganyu': '专注固然可贵，也请记得适时小憩片刻。',
      default: '单日专注突破 4 小时，进入深度心流区。',
    },
  },
  {
    id: 'night-owl',
    category: 'chrono',
    icon: '☽',
    title: '守夜人',
    desc: '在凌晨 01:00 至 05:00 之间仍有科研记录。',
    target: 1,
    unit: '次',
    metric: 'lateNightSessions',
    quotes: {
      'makise-kurisu': '凌晨还在看文献？小心明天实验数据全算错，快去睡觉！',
      'chainsawman-reze': '这么晚还亮着灯啊……别太勉强自己哦。',
      'genshin-ganyu': '夜深露重，科研虽急，身体才是长久之本。',
      default: '深夜的灯火，见证过无数灵光一闪。',
    },
  },
  {
    id: 'reimu-prayer',
    category: 'chrono',
    icon: '⛩',
    title: '少女祈愿',
    desc: '首次触发 5 分钟失焦灵梦休眠帘并点击返回继续。',
    target: 1,
    unit: '次',
    metric: 'reimuVeilReturns',
    quotes: {
      'makise-kurisu': '摸鱼超过五分钟被灵梦抓包了吧？回来就赶紧继续干活。',
      'chainsawman-reze': '欢迎回来，灵梦刚才一直在帮你守着屏幕呢。',
      'genshin-ganyu': '短暂离席休整后，思路往往会更清晰哦。',
      default: '少女祈愿完毕，欢迎回到研究工作区。',
    },
  },

  // 3. 建模与绘图
  {
    id: 'first-ml-model',
    category: 'lab',
    icon: '⚙',
    title: '炼丹初成',
    desc: '完成一次材料 ML 嵌套交叉验证并获得可用模型。',
    target: 1,
    unit: '次',
    metric: 'usableModelsCount',
    quotes: {
      'makise-kurisu': '没有数据泄漏、过了嵌套验证——嗯，这个流程够严谨。',
      'chainsawman-reze': '第一个模型跑出来啦，试试预测新配方吧。',
      'genshin-ganyu': '模型已经通过验证，可以作为配方筛选的参考了。',
      default: '首个可用材料预测模型训练完成。',
    },
  },
  {
    id: 'r2-master',
    category: 'lab',
    icon: '◈',
    title: '拟合之神',
    desc: '训练出折外 R² ≥ 0.90 的高精度材料回归模型。',
    target: 90,
    unit: '% R²',
    metric: 'bestModelR2Pct',
    quotes: {
      'makise-kurisu': '折外 R² 破 0.90？！等等，先让我复查一遍分组防泄漏……好吧，确实漂亮。',
      'chainsawman-reze': '哇，这条拟合线贴得也太准了吧。',
      'genshin-ganyu': '如此高的折外精度，说明您的数据整理非常扎实。',
      default: '折外 R² ≥ 0.90，极佳的模型泛化表现。',
    },
  },
  {
    id: 'montage-master',
    category: 'lab',
    icon: '⊞',
    title: '拼版大师',
    desc: '在 Figura 论文蒙太奇中拼合导出 4 张及以上子图。',
    target: 4,
    unit: '子图',
    metric: 'maxMontagePanels',
    quotes: {
      'makise-kurisu': '子图对齐、矢量无损，审稿人看到这张图至少会少挑一半刺。',
      'chainsawman-reze': '拼完像真的顶刊插图一样整齐呢。',
      'genshin-ganyu': '排版疏密有度，投稿时一定非常省心。',
      default: '多图蒙太奇拼版达成，直奔发表级插图。',
    },
  },
  {
    id: 'custom-scheme-fun',
    category: 'lab',
    icon: '✿',
    title: '整活天才',
    desc: '使用自定义 Figura 绘图方案（如袜筒柱状图）导出一次图稿。',
    target: 1,
    unit: '次',
    metric: 'customSchemeExports',
    quotes: {
      'makise-kurisu': '……你在科研软件里画的这是什么奇怪统计图啊！（别投到正刊里去！）',
      'chainsawman-reze': '哈哈，这张图放到组会 PPT 里大家肯定瞬间清醒。',
      'genshin-ganyu': '偶尔用轻松的方式展示数据，也很能调动气氛呢。',
      default: '自定义方案导出成功，科研也要保持幽默感。',
    },
  },

  // 4. 心流对弈与陪伴
  {
    id: 'first-board-game',
    category: 'flow',
    icon: '♞',
    title: '手谈一局',
    desc: '在心流系统中完成一局国际象棋或围棋对弈。',
    target: 1,
    unit: '局',
    metric: 'flowGamesFinished',
    quotes: {
      'makise-kurisu': '科研间隙下一盘换换脑子倒不错——下次我可不会让着你了。',
      'chainsawman-reze': '棋下完了，脑子是不是清爽很多？',
      'genshin-ganyu': '劳逸结合，方能行稳致远。',
      default: '心流对弈达成，换个频道继续前行。',
    },
  },
  {
    id: 'trusted-partner',
    category: 'flow',
    icon: '❋',
    title: '默契搭档',
    desc: '与同一位 AI 科研伴侣累计互动达到 50 轮。',
    target: 50,
    unit: '轮',
    metric: 'maxCompanionTurns',
    quotes: {
      'makise-kurisu': '不知不觉聊了这么多轮啊……哼，有我帮忙是你运气好。',
      'chainsawman-reze': '和你一起看论文的时间过得挺快的呢。',
      'genshin-ganyu': '能一直陪伴您推进课题，是我的荣幸。',
      default: '五十轮深度对话，默契渐成。',
    },
  },
  {
    id: 'voice-immersion',
    category: 'flow',
    icon: '♫',
    title: '声临其境',
    desc: '累计使用本地 GPT-SoVITS 语音导读或回复达到 20 次。',
    target: 20,
    unit: '次',
    metric: 'voicePlayCount',
    quotes: {
      'makise-kurisu': '老是让我念论文给你听，至少把显卡风扇擦干净啊。',
      'chainsawman-reze': '听着声音读文献，是不是没那么容易犯困了？',
      'genshin-ganyu': '若声音能让枯燥的文献温和几分，便再好不过了。',
      default: '二十次本地语音陪伴，科研更有温度。',
    },
  },
  {
    id: 'all-companions',
    category: 'flow',
    icon: '★',
    title: '全员集结',
    desc: '体验过全部 3 位内置角色伴侣（红莉栖 / 蕾塞 / 甘雨）。',
    target: 3,
    unit: '位',
    metric: 'companionsTriedCount',
    quotes: {
      'makise-kurisu': '喂，你居然还轮流找别人陪读？算了，各自擅长领域不同嘛。',
      'chainsawman-reze': '大家都认识一遍啦，今天想让谁陪你？',
      'genshin-ganyu': '各位伙伴各有风格，按心情切换也很不错呢。',
      default: '全员伴侣集结完毕，心流小队满编。',
    },
  },
  ...ORBIT_ACHIEVEMENTS,

  // 5. 隐藏彩蛋成就
  {
    id: 'worldline-observer',
    category: 'flow',
    hidden: true,
    icon: 'Ψ',
    title: '世界线观测者',
    desc: '在搜索框输入命运石之门秘密暗号，观测到 1.048596% 世界线收敛。',
    target: 1,
    unit: '次',
    metric: 'worldlineTriggers',
    quotes: {
      'makise-kurisu': '哼……你竟然真的念出了那个羞耻的暗号？不过世界线数值确实稳在 1.048596% 了。',
      'chainsawman-reze': '那个橙色灯管闪起来的时候，还真有点神秘实验的氛围呢。',
      'genshin-ganyu': '无论位于哪一条世界线，您的研究积累都不会白费的。',
      default: 'El Psy Kongroo——世界线已收敛于此。',
    },
  },
  {
    id: 'singularity-weaver',
    category: 'reading',
    hidden: true,
    icon: '◉',
    title: '奇点召唤师',
    desc: '在文献星图或聚焦轨道的深空中召唤过引力黑洞奇点。',
    target: 1,
    unit: '次',
    metric: 'blackHoleSummons',
    quotes: {
      'makise-kurisu': '在星图里凭空造出克尔黑洞事件视界？！还好只是纯光学引力透镜，坐标一点没乱。',
      'chainsawman-reze': '哇，群星被卷过去又弹回来的样子，像一场微型烟火呢。',
      'genshin-ganyu': '深空虽有奇点牵引，您的文献星图依旧秩序井然。',
      default: '事件视界已蒸发，群星完好归位。',
    },
  },
  {
    id: 'solar-flare-conductor',
    category: 'reading',
    hidden: true,
    icon: '✹',
    title: '恒星拨弦手',
    desc: '在聚焦星球视图中拨动中心恒星耀斑，推动卫星群加速共舞。',
    target: 1,
    unit: '次',
    metric: 'solarFlares',
    quotes: {
      'makise-kurisu': '角动量骤增导致轨道彗尾拉长了——你把中心论文当成恒星引擎在玩吧？',
      'chainsawman-reze': '轻轻一按，周围的星球一下子都欢快地冲出去了呢。',
      'genshin-ganyu': '星轨如弦，偶尔轻拨一下也别有雅趣。',
      default: '日冕耀斑掠过，群星留下一道金色长尾。',
    },
  },
];

function todayStr(ts = Date.now()) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      version: 1,
      unlocked: parsed?.unlocked && typeof parsed.unlocked === 'object' ? parsed.unlocked : {},
      counters: parsed?.counters && typeof parsed.counters === 'object' ? parsed.counters : {},
      roles: Array.isArray(parsed?.roles) ? parsed.roles.filter(role => typeof role === 'string') : [],
      dailyProgress: parsed?.dailyProgress || {},
      dailyCompletions: parsed?.dailyCompletions || {},
    };
  } catch {
    return { version: 1, unlocked: {}, counters: {}, roles: [], dailyProgress: {}, dailyCompletions: {} };
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

function readPomodoroMetrics(today) {
  try {
    const raw = localStorage.getItem('materia.pomodoro.v1');
    if (!raw) return { chronoStreakDays: 0, maxDailyFocusMinutes: 0 };
    const store = JSON.parse(raw);
    const days = store?.days || {};
    let maxSecs = 0;
    for (const entry of Object.values(days)) {
      if ((entry?.seconds || 0) > maxSecs) maxSecs = entry.seconds;
    }
    let streak = 0;
    let cursor = new Date();
    for (let i = 0; i < 366; i++) {
      const k = todayStr(cursor.getTime());
      if ((days[k]?.seconds || 0) > 0) {
        streak += 1;
        cursor = new Date(cursor.getTime() - 86400000);
      } else if (i === 0) {
        cursor = new Date(cursor.getTime() - 86400000);
      } else {
        break;
      }
    }
    return {
      chronoStreakDays: streak,
      maxDailyFocusMinutes: Math.floor(maxSecs / 60),
      lateNightSessions: Object.values(days).filter(entry => entry?.lateNight).length,
      focusMinutes: Math.floor((days[today]?.seconds || 0) / 60),
      pomodoros: days[today]?.pomodoros || 0,
    };
  } catch {
    return { chronoStreakDays: 0, maxDailyFocusMinutes: 0 };
  }
}

export function createFlowAchievements(panel = document.body, options = {}) {
  const {
    getActiveRole = () => document.querySelector('[data-agent-role]')?.dataset.agentRole || 'makise-kurisu',
    onCompanionSpeak = null,
  } = options;

  const state = loadState();
  let activeCategory = 'all';
  let toastTimer = 0;
  let toastHideTimer = 0;
  let toastDurationMs = 5400;
  let toastRemainingMs = 0;
  let toastStartedAt = 0;
  let toastPaused = false;
  let previewCursor = 0;
  let dayTimer = 0;

  // Create modal dialog matching flow-chess / flow-go conventions
  const dialog = document.createElement('dialog');
  dialog.className = 'flow-achievements';
  dialog.setAttribute('aria-label', 'Flow 心流 · 科研成就');
  dialog.innerHTML = `
    <header class="flow-heading">
      <div><small>FLOW · AMADEUS</small><h2>心流 · 科研成就</h2></div>
      <div class="flow-heading-actions">
        <button type="button" class="outline-button flow-ach-preview-btn" data-flow="preview-toast">试看解锁特效</button>
        <button type="button" class="icon-button" data-flow="close" aria-label="关闭成就面板" title="关闭">✕</button>
      </div>
    </header>
    <div class="flow-ach-summary">
      <div class="flow-ach-tabs" role="tablist" aria-label="成就分类">
        ${ACHIEVEMENT_CATEGORIES.map(c => `<button type="button" class="flow-ach-tab" role="tab" data-cat="${c.id}" aria-selected="${c.id === 'all'}">${c.label}</button>`).join('')}
      </div>
      <span class="flow-ach-counter" data-ach-counter>已解锁 <strong>0</strong> / ${ACHIEVEMENTS.length}</span>
    </div>
    <div class="flow-ach-grid" data-ach-grid></div>
  `;
  (panel || document.body).append(dialog);

  // Create holographic collector's unlock toast (popover="manual" lifts into Top Layer cleanly)
  const toast = document.createElement('div');
  toast.id = 'flow-achievement-toast';
  toast.className = 'flow-ach-toast';
  toast.setAttribute('popover', 'manual');
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.hidden = true;
  toast.innerHTML = `
    <div class="ach-toast-sparks" aria-hidden="true">${sparkBurstHTML(16)}</div>
    <div class="ach-toast-surface">
      <div class="ach-toast-foil" aria-hidden="true">
        <span class="ach-foil-sweep"></span>
      </div>
      <div class="ach-toast-medal-wrap" aria-hidden="true">
        <span class="ach-pulse-ring is-one"></span>
        <span class="ach-pulse-ring is-two"></span>
        ${medalRingSVG()}
        <div class="flow-ach-toast-badge" data-toast-icon>✦</div>
      </div>
      <div class="flow-ach-toast-text">
        <div class="ach-toast-meta">
          <small data-toast-label></small>
          <span class="ach-toast-serial" data-toast-serial></span>
          <span class="ach-toast-speaker" data-toast-speaker></span>
        </div>
        <div class="ach-toast-title-line">
          <strong data-toast-title></strong>
          <span class="ach-toast-extra" data-toast-extra hidden></span>
        </div>
        <p data-toast-quote></p>
        <span class="ach-toast-foot">点击查看成就墙 · 悬停可暂停</span>
      </div>
      <button type="button" class="ach-toast-close" data-toast-dismiss aria-label="关闭通知">✕</button>
      <span class="ach-toast-timer" aria-hidden="true"><i data-toast-progress></i></span>
    </div>
  `;
  document.body.append(toast);

  const gridEl = dialog.querySelector('[data-ach-grid]');
  const counterEl = dialog.querySelector('[data-ach-counter]');
  const reducedMotion = typeof matchMedia === 'function'
    ? matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };

  function currentMetrics(pomo) {
    const c = state.counters;
    const lateNight = Math.max(c.lateNightSessions || 0, pomo.lateNightSessions || 0);
    return {
      deepReadCount: c.deepReadCount || 0,
      maxAnnotationsPerPaper: c.maxAnnotationsPerPaper || 0,
      citationEdgeCount: c.citationEdgeCount || 0,
      orbitReversals: c.orbitReversals || 0,
      chronoStreakDays: Math.max(c.chronoStreakDays || 0, pomo.chronoStreakDays),
      maxDailyFocusMinutes: Math.max(c.maxDailyFocusMinutes || 0, pomo.maxDailyFocusMinutes),
      lateNightSessions: lateNight,
      reimuVeilReturns: c.reimuVeilReturns || 0,
      usableModelsCount: c.usableModelsCount || 0,
      bestModelR2Pct: c.bestModelR2Pct || 0,
      maxMontagePanels: c.maxMontagePanels || 0,
      customSchemeExports: c.customSchemeExports || 0,
      flowGamesFinished: c.flowGamesFinished || 0,
      maxCompanionTurns: c.maxCompanionTurns || 0,
      voicePlayCount: c.voicePlayCount || 0,
      companionsTriedCount: c.companionsTriedCount || 0,
      worldlineTriggers: c.worldlineTriggers || 0,
      blackHoleSummons: c.blackHoleSummons || 0,
      solarFlares: c.solarFlares || 0,
    };
  }

  function hideToast(immediate = false) {
    clearTimeout(toastTimer);
    clearTimeout(toastHideTimer);
    toastTimer = 0;
    toastPaused = false;
    toastRemainingMs = 0;
    toast.classList.remove('is-visible', 'is-bursting', 'is-paused');
    toast.style.removeProperty('--rx');
    toast.style.removeProperty('--ry');
    if (immediate || reducedMotion.matches) {
      closeToastLayer(toast);
    } else {
      toastHideTimer = setTimeout(() => {
        if (!toast.classList.contains('is-visible')) closeToastLayer(toast);
      }, 280);
    }
  }

  function scheduleToastDismiss(delayMs) {
    clearTimeout(toastTimer);
    toastRemainingMs = Math.max(400, delayMs);
    toastStartedAt = Date.now();
    toastTimer = setTimeout(() => hideToast(false), toastRemainingMs);
  }

  function showToast(achievements, { isReplay = false } = {}) {
    if (!achievements?.length) return;
    const [ach] = achievements;
    const tier = achievementTier(ach);
    const role = getActiveRole();
    const quote = ach.quote || ach.quotes?.[role] || ach.quotes?.default || ach.desc;
    const isDaily = achievements.every(item => item.category === 'daily');

    toastDurationMs = tier === 'legendary' ? 6200 : tier === 'milestone' ? 5400 : 4800;
    toast.dataset.tier = tier;
    toast.dataset.category = ach.category || 'milestone';
    toast.style.setProperty('--toast-dur', `${toastDurationMs}ms`);

    const labelText = tier === 'legendary'
      ? '典藏里程碑达成'
      : isDaily
        ? '每日节律达成'
        : '心流成就达成';
    const achIndex = ACHIEVEMENTS.findIndex(item => item.id === ach.id);
    const serialText = isReplay
      ? 'REPLAY'
      : isDaily
        ? todayStr().slice(5)
        : `NO.${String(Math.max(1, achIndex + 1)).padStart(2, '0')}`;

    toast.querySelector('[data-toast-label]').textContent = labelText;
    toast.querySelector('[data-toast-serial]').textContent = serialText;
    toast.querySelector('[data-toast-speaker]').textContent = `· ${companionDisplayName(role)}`;
    toast.querySelector('[data-toast-icon]').textContent = ach.icon || '✦';
    toast.querySelector('[data-toast-title]').textContent = ach.title;
    const extraEl = toast.querySelector('[data-toast-extra]');
    if (achievements.length > 1) {
      extraEl.textContent = `+${achievements.length - 1}`;
      extraEl.hidden = false;
    } else {
      extraEl.hidden = true;
    }
    toast.querySelector('[data-toast-quote]').textContent = `“${quote}”`;

    clearTimeout(toastTimer);
    clearTimeout(toastHideTimer);
    toastPaused = false;
    toast.classList.remove('is-visible', 'is-bursting', 'is-paused');
    openToastLayer(toast, dialog);
    void toast.offsetWidth;
    toast.classList.add('is-visible', 'is-bursting');

    playAchievementChime(tier);
    scheduleToastDismiss(toastDurationMs);
    if (!isReplay) {
      onCompanionSpeak?.({ achievement: ach, role, line: quote });
    }
  }

  function previewToast(targetId = null) {
    const showcaseIds = ['r2-master', 'first-deep-read', 'daily-deep-read'];
    let targetAch = null;
    if (targetId) {
      targetAch = [...DAILY_ACHIEVEMENTS, ...ACHIEVEMENTS].find(a => a.id === targetId) || null;
    }
    if (!targetAch) {
      const id = showcaseIds[previewCursor % showcaseIds.length];
      previewCursor += 1;
      targetAch = [...DAILY_ACHIEVEMENTS, ...ACHIEVEMENTS].find(a => a.id === id) || ACHIEVEMENTS[0];
    }
    showToast([targetAch], { isReplay: true });
    return targetAch;
  }

  function evaluate({ silent = false, metricsChanged = false } = {}) {
    const today = todayStr();
    const pomo = readPomodoroMetrics(today);
    const metrics = currentMetrics(pomo);
    const newlyUnlocked = [];
    for (const ach of ACHIEVEMENTS) {
      if (state.unlocked[ach.id]) continue;
      const val = Number(metrics[ach.metric]) || 0;
      if (val >= ach.target) {
        state.unlocked[ach.id] = { at: today, role: getActiveRole() };
        newlyUnlocked.push(ach);
      }
    }
    const dailyMetrics = dailyMetricsFor(today, pomo);
    for (const ach of DAILY_ACHIEVEMENTS) {
      if (dailyMetrics[ach.metric] < ach.target) continue;
      const dates = state.dailyCompletions[ach.id] ??= {};
      if (dates[today]) continue;
      dates[today] = true;
      newlyUnlocked.push(ach);
    }
    if (metricsChanged || newlyUnlocked.length) saveState(state);
    if (newlyUnlocked.length && !silent) showToast(newlyUnlocked);
    if (dialog.open) render();
    return newlyUnlocked;
  }

  function dailyMetricsFor(today, pomo) {
    const progress = state.dailyProgress.date === today ? state.dailyProgress : {};
    return {
      focusMinutes: pomo.focusMinutes || 0,
      pomodoros: pomo.pomodoros || 0,
      flowGamesFinished: progress.flowGamesFinished || 0,
      companionReplies: progress.companionReplies || 0,
      dailyDeepReads: progress.dailyDeepReads || 0,
    };
  }

  function recordMetric(metric, value, mode = 'max') {
    let changed = false;
    if (mode === 'add' && value > 0 && DAILY_EVENT_METRICS.has(metric)) {
      const date = todayStr();
      if (state.dailyProgress.date !== date) state.dailyProgress = { date };
      state.dailyProgress[metric] = (state.dailyProgress[metric] || 0) + value;
      changed = true;
    }
    if (ACHIEVEMENTS.some(achievement => achievement.metric === metric)) {
      const prev = Number(state.counters[metric]) || 0;
      const next = mode === 'add' ? prev + value : Math.max(prev, value);
      if (next !== prev) {
        state.counters[metric] = next;
        changed = true;
      }
    }
    if (changed) evaluate({ metricsChanged: true });
  }

  function render() {
    const today = todayStr();
    const pomo = readPomodoroMetrics(today);
    const metrics = currentMetrics(pomo);
    const dailyMetrics = dailyMetricsFor(today, pomo);
    const unlockedCount = Object.keys(state.unlocked).length;
    const dailyCompleted = DAILY_ACHIEVEMENTS.filter(ach => state.dailyCompletions[ach.id]?.[today]).length;
    counterEl.innerHTML = activeCategory === 'daily'
      ? `今日完成 <strong>${dailyCompleted}</strong> / ${DAILY_ACHIEVEMENTS.length}`
      : `里程碑已解锁 <strong>${unlockedCount}</strong> / ${ACHIEVEMENTS.length}`;

    const list = activeCategory === 'all'
      ? [...DAILY_ACHIEVEMENTS, ...ACHIEVEMENTS]
      : activeCategory === 'daily' ? DAILY_ACHIEVEMENTS : ACHIEVEMENTS.filter(a => a.category === activeCategory);

    const role = getActiveRole();
    gridEl.innerHTML = list.map(ach => {
      const unlockInfo = state.unlocked[ach.id];
      const daily = ach.category === 'daily';
      const tier = achievementTier(ach);
      const completedDates = state.dailyCompletions[ach.id] || {};
      const unlocked = daily ? Boolean(completedDates[today]) : Boolean(unlockInfo);
      const val = Math.min(ach.target, Number((daily ? dailyMetrics : metrics)[ach.metric]) || 0);
      const pct = Math.round((val / ach.target) * 100);
      const isSecretLocked = Boolean(ach.hidden && !unlocked);
      const quote = ach.quote || ach.quotes[unlockInfo?.role || role] || ach.quotes.default;
      const status = daily
        ? (unlocked ? '今日已完成' : '今日未完成')
        : isSecretLocked
          ? '未发现'
          : (unlocked ? (String(unlockInfo.at).match(/^\d{4}-\d{2}-\d{2}$/)?.[0] || '已解锁') : '未解锁');

      const displayIcon = isSecretLocked ? '?' : ach.icon;
      const displayTitle = isSecretLocked ? '??? · 隐藏彩蛋' : ach.title;
      const displayDesc = isSecretLocked ? '尚未发现的星海秘境彩蛋，探索搜索框或星图深空试试看。' : ach.desc;

      return `
        <article class="flow-ach-card" data-unlocked="${unlocked}" data-tier="${tier}"${isSecretLocked ? ' data-secret="true"' : ''}>
          <div class="flow-ach-emblem" aria-hidden="true">${displayIcon}</div>
          <div class="flow-ach-body">
            <div class="flow-ach-title-row">
              <strong>${displayTitle}</strong>
              <span class="flow-ach-card-right">
                ${unlocked ? `<button type="button" class="flow-ach-replay" data-ach-replay="${ach.id}" title="重温解锁特效">重温</button>` : ''}
                <span class="flow-ach-date">${status}</span>
              </span>
            </div>
            <p class="flow-ach-desc">${displayDesc}</p>
            ${daily ? `<p class="flow-ach-desc">累计完成 ${Object.keys(completedDates).length} 次</p>` : ''}
            ${unlocked
              ? `<p class="flow-ach-quote">“${quote}”</p>`
              : isSecretLocked
                ? `<div class="flow-ach-secret-hint">秘境线索 · 触发后自动显现</div>`
                : `<div class="flow-ach-progress">
                     <div class="flow-ach-progress-meta"><span>${daily ? '今日进度' : '进度'}</span><span>${val} / ${ach.target} ${ach.unit}</span></div>
                     <div class="flow-ach-bar"><i style="width:${pct}%"></i></div>
                   </div>`}
          </div>
        </article>
      `;
    }).join('');
  }

  dialog.addEventListener('click', e => {
    const closeBtn = e.target.closest('[data-flow="close"]');
    if (closeBtn) { dialog.close(); return; }
    if (e.target.closest('[data-flow="preview-toast"]')) {
      previewToast();
      return;
    }
    const replayBtn = e.target.closest('[data-ach-replay]');
    if (replayBtn) {
      previewToast(replayBtn.dataset.achReplay);
      return;
    }
    const tab = e.target.closest('.flow-ach-tab');
    if (tab) {
      activeCategory = tab.dataset.cat;
      dialog.querySelectorAll('.flow-ach-tab').forEach(btn => {
        btn.setAttribute('aria-selected', String(btn.dataset.cat === activeCategory));
      });
      render();
    }
  });

  toast.addEventListener('mouseenter', () => {
    if (toast.hidden || toastPaused) return;
    toastPaused = true;
    const elapsed = Date.now() - toastStartedAt;
    toastRemainingMs = Math.max(400, toastRemainingMs - elapsed);
    clearTimeout(toastTimer);
    toast.classList.add('is-paused');
  });

  toast.addEventListener('mouseleave', () => {
    toast.style.removeProperty('--rx');
    toast.style.removeProperty('--ry');
    if (toast.hidden || !toastPaused) return;
    toastPaused = false;
    toast.classList.remove('is-paused');
    scheduleToastDismiss(toastRemainingMs);
  });

  toast.addEventListener('pointermove', e => {
    if (reducedMotion.matches || toast.hidden) return;
    const rect = toast.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const nx = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width - 0.5) * 2));
    const ny = Math.max(-1, Math.min(1, ((e.clientY - rect.top) / rect.height - 0.5) * 2));
    toast.style.setProperty('--rx', `${(-ny * 5.2).toFixed(2)}deg`);
    toast.style.setProperty('--ry', `${(nx * 5.5).toFixed(2)}deg`);
    toast.style.setProperty('--mx', `${(((nx + 1) / 2) * 100).toFixed(1)}%`);
    toast.style.setProperty('--my', `${(((ny + 1) / 2) * 100).toFixed(1)}%`);
  });

  toast.addEventListener('click', e => {
    if (e.target.closest('[data-toast-dismiss]')) {
      e.stopPropagation();
      hideToast(false);
      return;
    }
    hideToast(true);
    show();
  });

  // Listen for cross-module custom achievement events
  window.addEventListener('materia:achievement-event', e => {
    const { metric, value = 1, mode = 'add' } = e.detail || {};
    if ((DAILY_EVENT_METRICS.has(metric) || ACHIEVEMENTS.some(achievement => achievement.metric === metric))
      && Number.isFinite(value) && value >= 0) {
      recordMetric(metric, value, mode);
    }
  });

  window.addEventListener('materia:focus-recorded', () => evaluate());

  function scheduleDayRefresh() {
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    dayTimer = setTimeout(() => {
      if (!dialog.open) return;
      evaluate({ silent: true });
      scheduleDayRefresh();
    }, midnight.getTime() - Date.now());
  }

  dialog.addEventListener('close', () => {
    if (!dialog.open) {
      clearTimeout(dayTimer);
      if (toast.parentElement === dialog) {
        const wasOpen = !toast.hidden;
        document.body.append(toast);
        if (wasOpen) openToastLayer(toast, dialog);
      }
    }
  });

  function show() {
    evaluate({ silent: true });
    if (dialog.open) return;
    render();
    dialog.showModal();
    if (!toast.hidden) openToastLayer(toast, dialog);
    clearTimeout(dayTimer);
    scheduleDayRefresh();
  }

  // Initial silent check
  evaluate({ silent: true });

  function recordRole(role) {
    if (state.roles.includes(role)) return;
    state.roles.push(role);
    saveState(state);
    recordMetric('companionsTriedCount', state.roles.length);
  }

  return { show, recordRole, previewToast, dialog };
}

export function reportAchievement(metric, value, mode = 'max') {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('materia:achievement-event', { detail: { metric, value, mode } }));
  }
}
