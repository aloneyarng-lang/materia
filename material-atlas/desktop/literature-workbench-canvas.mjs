// Bridge between Literature Workbench ("研读") and Research Canvas ("研究画布").
// Generates strict mcanvas mindmap rules via the configured AI service, validates & lays them out
// with Materia's native research-canvas-model.js, and atomically persists to research-canvases.json
// using standardized naming: "研读 · <年份> · <文献精简标题>".

import {createHash,randomUUID} from 'node:crypto';
import {
  arrangeCanvas,
  cleanCanvas,
  cleanCanvasStore,
  newCanvas,
  parseCanvasRules,
  serializeCanvasRules,
} from '../dist/research-canvas-model.js';

export function standardCanvasName({ paperTitle = '', year = '' } = {}) {
  const cleanTitle = String(paperTitle || '未命名文献')
    .replace(/\.pdf$/i, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const shortTitle = cleanTitle.length > 34 ? cleanTitle.slice(0, 33).trim() + '…' : cleanTitle;
  const yearMatch = String(year || '').match(/\b(19|20)\d{2}\b/) || cleanTitle.match(/\b(19|20)\d{2}\b/);
  return yearMatch ? `研读 · ${yearMatch[0]} · ${shortTitle}` : `研读 · ${shortTitle}`;
}

export function buildPaperCanvasPrompt({
  paperId = '',
  paperTitle = '',
  year = '',
  outlineText = '',
  figuresText = '',
  canvasName = '',
} = {}) {
  const name = canvasName || standardCanvasName({ paperTitle, year });
  const excerptOutline = String(outlineText || '').trim().slice(0, 9000);
  const excerptFigures = String(figuresText || '').trim().slice(0, 6000);
  const linkLine = paperId ? `link root paper="${paperId.replaceAll('"', '')}"` : '';

  return [
    '你是材料与理工科科研知识图谱架构师。请根据下方论文研读内容，直接生成一份严格符合 Materia Research Canvas (`mcanvas`) 语法的思维导图规则代码。',
    '',
    '严格语法要求（只输出单个 ```mcanvas 代码块，不要输出额外解释）：',
    `1. 首三行固定为：`,
    `canvas "${name.replaceAll('"', '\\"')}"`,
    'layout mindmap',
    'direction right',
    '示例语句：node root "研究主题"、node method "方法"、root -> method、style method shape=roundrect color=blue。每条语句单独一行。',
    '2. 节点 ID 必须唯一、仅用英文字母/数字/下划线/短横线且以字母开头（如 root、bg_1、method_1、fig_1、limit_1）。',
    '3. 所有节点文字、关系说明、note、group 名称必须使用双引号 JSON 字符串（内部引号用 \\" 转义，换行用 \\n）。',
    '4. 节点总数控制在 12–22 个，层次清晰，包含 4–5 个一级分支：研究背景与痛点、核心方法与工艺、微观结构与机理、关键图表证据、主要结论与局限。',
    '5. 使用形状区分语义：root 用 pill+accent，工艺/方法用 roundrect+blue，微观结构/机理用 hexagon+purple，图表定量证据用 document+gold，局限/待验证用 octagon+red。',
    '6. 为关键节点补充简明 `note id "..."` 和至少 2 个 `group "分组名" [id1, id2]`。',
    linkLine ? `7. 必须包含文献关联行：${linkLine}` : '',
    '',
    `论文标题：${paperTitle || '当前文献'}`,
    year ? `发表年份：${year}` : '',
    excerptOutline ? `\n【研究速览与正文摘录】\n${excerptOutline}` : '',
    excerptFigures ? `\n【逐图证据摘录】\n${excerptFigures}` : '',
  ].filter(Boolean).join('\n');
}

export function extractMcanvasBlock(rawText = '') {
  const text = String(rawText || '').trim();
  const fenced = text.match(/```(?:mcanvas|materia-canvas|text)?\s*\n([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

export function findExistingPaperCanvas(store, { paperId = '', canvasName = '' } = {}) {
  const boards = Array.isArray(store?.boards) ? store.boards : [];
  if (!paperId) return null;
  return boards.find(board => board.id === paperBoardId(paperId)) || null;
}

function paperBoardId(id) {
  return 'study-' + createHash('sha256').update(id).digest('hex').slice(0, 32);
}

export async function upsertPaperCanvas({
  canvasStore,
  paperId = '',
  paperTitle = '',
  year = '',
  rulesSource = '',
  createNewCopy = false,
} = {}) {
  if (!canvasStore) throw new Error('当前环境未连接研究画布存储（canvasStore）。');
  const name = standardCanvasName({ paperTitle, year });
  const cleanedRules = extractMcanvasBlock(rulesSource);
  if (!cleanedRules) throw new Error('AI 未返回有效的研究画布规则代码。');

  const store = cleanCanvasStore(await canvasStore.load());
  const existing = createNewCopy ? null : findExistingPaperCanvas(store, { paperId, canvasName: name });
  const baseBoard = existing || newCanvas(createNewCopy ? randomUUID() : paperBoardId(paperId), name, Date.now());

  const parsed = parseCanvasRules(cleanedRules, baseBoard, { allowUpdate: false });
  const root = parsed.nodes.find(node => node.id === 'root') || parsed.nodes[0];
  if (!root) throw Error('生成的画布没有节点。');
  root.paperId = paperId;
  const nextBoard = cleanCanvas({
    ...baseBoard,
    ...parsed,
    id: baseBoard.id,
    name: createNewCopy && existing ? `${name} (副本)` : name,
    updatedAt: Date.now(),
  });
  const arranged = cleanCanvas(arrangeCanvas(nextBoard, { compact: true, aspect: 1.55 }));

  const idx = store.boards.findIndex(b => b.id === arranged.id);
  if (idx >= 0) store.boards[idx] = arranged;
  else store.boards.unshift(arranged);
  store.selected = arranged.id;

  await canvasStore.save(store);
  return {
    board: arranged,
    rules: serializeCanvasRules(arranged),
    name: arranged.name,
    created: idx < 0,
  };
}
