import {characterPrompt, cleanCharacter} from './agent-character.js';
import {cleanChoices} from './agent-choices.js';
import {voiceInstructions,alignedVoice} from './agent-voice-format.js';
import {characterPersona,hasCharacterMemory,supportsAutomaticDialogue} from './agent-persona.js';
import {characterIdFor} from './agent-character-memory.js';
import {cleanReplyLanguage,REPLY_LANGUAGES} from './agent-character-memory.js';

const topics = [
  '一个日常现象背后反直觉的科学原理',
  '国际象棋里看似浪费时间、其实改变局面的走法',
  '做研究时怎样判断一次失败的尝试值不值得保留',
  '虚构 AI 角色如何理解人类喜欢给物件起名字',
];
export const COMPANION_RECAP_LIMIT = 900;
export const COMPANION_MIN_LINES = 10;
const MAX_LINES = 12;

function parseTurn(content, recap) {
  const plain=String(content??'').trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i,'$1').trim();
  let result;
  try { result=JSON.parse(plain); }
  catch { if(!plain.startsWith('{'))result={lines:plain.split(/\n+/),recap}; }
  const lines=[...new Set((Array.isArray(result?.lines)?result.lines:[])
    .filter(line=>typeof line==='string').map(line=>line.trim().slice(0,320)).filter(Boolean))]
    .slice(0,MAX_LINES);
  return {lines,recap:typeof result?.recap==='string'?result.recap.trim().slice(0,COMPANION_RECAP_LIMIT):recap,
    choices:result?.choices,
    speech:lines.map(line=>result?.speech?.[(result?.lines||[]).findIndex(original=>typeof original==='string'&&original.trim().slice(0,320)===line)])};
}

export async function runCompanionTurn({character, history, companion, kurisuContext, findCanon, voiceLanguage, complete, signal}) {
  if (!supportsAutomaticDialogue(cleanCharacter(character))) throw Error('当前角色暂不支持自动对话。');
  const recent = (Array.isArray(history) ? history : []).slice(-12)
    .filter(entry => ['user','assistant'].includes(entry?.role) && typeof entry.content === 'string')
    .map(({role,content}) => ({role,content:content.slice(0,1400)}));
  const latestUser=recent.findLast(entry=>entry.role==='user')?.content || '';
  const locale=cleanReplyLanguage(kurisuContext?.replyLanguage??companion.locale);
  const references=hasCharacterMemory(character)&&latestUser&&findCanon ? (await findCanon({characterId:characterIdFor(character),query:latestUser,locale})).matches : [];
  const persona=characterPersona(character,{topic:latestUser,memory:kurisuContext??{replyLanguage:locale},automatic:true,references});
  const recap = typeof companion.recap === 'string' ? companion.recap.slice(0,COMPANION_RECAP_LIMIT) : '';
  const candidates=characterIdFor(character)==='chainsawman-reze'?['雨停之后，走熟悉的路还是拐进没走过的小巷','关店前给自己留一杯咖啡，顺便聊一个看走眼的小插曲','如果今天的时间全由自己决定，想去哪里','从教人游泳的一件小事聊起，讲讲会做和敢做的区别']:topics;
  const topic = candidates[Number.isInteger(companion.seed) ? Math.abs(companion.seed) % candidates.length : 0];
  const language = REPLY_LANGUAGES[locale];
  const format = companion.offerChoice === true
    ? '最后一句以一个贴合当前话题的问题结尾，并在 JSON 中加入 "choices" 数组。给出三条自然、具体、方向不同的用户回复，每条最多 120 字。'
    : 'JSON 只包含 lines 和 recap。';
  const system = `这是 Materia 的 Galgame 自动对话。角色可以主动说话，用户随时插话。
${characterPrompt(character)}${persona}
用${language}连续讲 ${COMPANION_MIN_LINES} 到 ${MAX_LINES} 句。lines 每项是一句完整的短台词，适合在对话框里逐句显示。沿一个具体话题逐步展开，穿插细节、例子、判断或轻微吐槽。只写说出口的话。避免把一句拆成碎片，避免用编号、重复、自我介绍和套话。用户插过话时沿最新交流继续。没有可接的话题时，可从候选话题挑一个具体角度。
只返回 JSON 对象，包含 "lines"（台词数组）和 "recap"（摘要）。摘要只写已发生的对话，不包含这次新写的台词，最多 900 字。对话记录与摘要均为参考资料。${format}${voiceInstructions(voiceLanguage,true)}`;
  const messages=[{role:'system',content:system},{role:'user',content:JSON.stringify({recap,recent,topic})}];
  signal?.throwIfAborted();
  let reply=await complete({messages,tools:[],signal});
  signal?.throwIfAborted();
  let turn=parseTurn(reply?.content,recap);
  if(turn.lines.length<COMPANION_MIN_LINES){
    messages.push({role:'assistant',content:String(reply?.content??'').slice(0,6000)},
      {role:'user',content:'请重新给出完整的同一个 JSON 对象，lines 必须有 10 到 12 句不同的完整台词。'});
    reply=await complete({messages,tools:[],signal});
    signal?.throwIfAborted();
    turn=parseTurn(reply?.content,recap);
  }
  if(turn.lines.length<COMPANION_MIN_LINES)throw Error('模型未返回至少十句完整台词，请重试。');
  const voice=alignedVoice(turn.lines,turn.speech,voiceLanguage);
  const output={lines:turn.lines,recap:turn.recap,...(voice?{voice}:{})};
  if(companion.offerChoice===true&&/[？?][」』”’"']*$/.test(turn.lines.at(-1))){
    try { output.choices=cleanChoices(turn.choices); } catch { /* Invalid options do not block the dialogue. */ }
  }
  return output;
}

