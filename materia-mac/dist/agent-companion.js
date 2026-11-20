import {characterPrompt, cleanCharacter} from './agent-character.js';
import {cleanChoices} from './agent-choices.js';
import {voiceInstructions,alignedVoice} from './agent-voice-format.js';
import {characterPersona,hasCharacterMemory,supportsAutomaticDialogue} from './agent-persona.js';
import {characterIdFor,cleanReplyLanguage,KURISU_ID,REPLY_LANGUAGES} from './agent-character-memory.js';

const topics = [
  '做研究时怎样判断一次失败的尝试值不值得保留',
  '虚构 AI 角色如何理解人类喜欢给物件起名字',
];
const kurisuOpenings = [
  '简单打个招呼，问问对方今天想聊什么',
  '轻松聊一句甜食口味，给对方留接话的位置',
  '问问对方想说说今天的事，还是就安静待一会儿',
  '从一件容易聊的小偏好开口，比如平常喜欢听什么',
  '给对方一个简短的招呼，语气像熟人碰面',
  '聊一句读到半截就舍不得放下的书是什么感觉',
];
export const COMPANION_RECAP_LIMIT = 900;
const MAX_LINES = 12;

function parseTurn(content, recap, limit) {
  const plain=String(content??'').trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i,'$1').trim();
  let result;
  try { result=JSON.parse(plain); }
  catch { if(!plain.startsWith('{'))result={lines:plain.split(/\n+/),recap}; }
  const unique=[...new Set((Array.isArray(result?.lines)?result.lines:[])
    .filter(line=>typeof line==='string').map(line=>line.trim().slice(0,320)).filter(Boolean))];
  const lines=unique.slice(0,limit);
  return {lines,recap:typeof result?.recap==='string'?result.recap.trim().slice(0,COMPANION_RECAP_LIMIT):recap,
    choices:unique.length<=limit?result?.choices:undefined,
    speech:lines.map(line=>result?.speech?.[(result?.lines||[]).findIndex(original=>typeof original==='string'&&original.trim().slice(0,320)===line)])};
}

export async function runCompanionTurn({chatId='', character, history, companion, kurisuContext, findCanon, voiceLanguage, complete, signal}) {
  if (!supportsAutomaticDialogue(cleanCharacter(character))) throw Error('当前角色暂不支持自动对话。');
  const turns=(Array.isArray(history)?history:[]).slice(-12)
    .filter(entry=>['user','assistant'].includes(entry?.role)&&typeof entry.content==='string');
  const userIndex=turns.findLastIndex(entry=>entry.role==='user');
  const latestUser=userIndex<0?'':turns[userIndex].content.slice(-1400);
  const characterId=characterIdFor(character);
  const kurisu=characterId===KURISU_ID;
  const opening=kurisu&&!latestUser;
  const anchored=kurisu?turns.filter((entry,index)=>index<=userIndex||entry.automatic!==true):turns;
  const recent=anchored.map(({role,content})=>({role,content:content.slice(-1400)}));
  const limit=opening?2:kurisu?4:MAX_LINES;
  const locale=cleanReplyLanguage(kurisuContext?.replyLanguage??companion.locale);
  const references=hasCharacterMemory(character)&&latestUser&&findCanon ? (await findCanon({characterId,query:latestUser,locale})).matches : [];
  const persona=characterPersona(character,{topic:latestUser,memory:kurisuContext??{replyLanguage:locale},automatic:true,references});
  const recap = !opening&&anchored.length===turns.length&&typeof companion.recap === 'string' ? companion.recap.slice(0,COMPANION_RECAP_LIMIT) : '';
  const candidates=kurisu?kurisuOpenings:characterId==='chainsawman-reze'?['雨停之后，走熟悉的路还是拐进没走过的小巷','关店前给自己留一杯咖啡，顺便聊一个看走眼的小插曲','如果今天的时间全由自己决定，想去哪里','从教人游泳的一件小事聊起，讲讲会做和敢做的区别']:topics;
  const seed=Number.isInteger(companion.seed)?Math.abs(companion.seed):0;
  const chatOffset=opening?[...String(chatId).slice(0,100)].reduce((sum,ch)=>sum+ch.charCodeAt(0),0):0;
  const topic=kurisu&&!opening?undefined:candidates[(seed+chatOffset)%candidates.length];
  const language = REPLY_LANGUAGES[locale];
  const format = companion.offerChoice === true
    ? '最后一句以一个贴合当前话题的问题结尾，并在 JSON 中加入 "choices" 数组。给出三条自然、具体、方向不同的用户回复，每条最多 120 字。'
    : 'JSON 只包含 lines 和 recap。';
  const system = `这是 Materia 的 Galgame 自动对话。角色可以主动说话，用户随时插话。
${characterPrompt(character)}${persona}
用${language}接着说一小段，通常 1 到 4 句。lines 每项是一句自然台词，短答也可以独立成句。已经说够了就停下来，让对方接话。沿着当前仍有话可说的细节，补一句没有说过的话；不要重复刚才的答复或代替用户表态。没有可接的话题时，可从候选话题挑一个具体角度。
${opening?'这是一次独立的闲聊开场。用一到两句，说完等对方。没有用户发言，摘要返回空字符串。':''}
只返回 JSON 对象，包含 "lines"（台词数组）和 "recap"（供续聊使用的摘要）。摘要只写已经发生的对话，保留具体分歧、纠正、仍未解决的问题和实际说过的承诺。没有根据的情绪或意图可以留空。最近的原话优先于旧摘要。不要收录这次待播放的台词。最多 900 字。${format}${voiceInstructions(voiceLanguage,true)}`;
  const messages=[{role:'system',content:system},{role:'user',content:JSON.stringify({recap,recent:opening?[]:recent,topic})}];
  signal?.throwIfAborted();
  let reply=await complete({messages,tools:[],signal});
  signal?.throwIfAborted();
  let turn=parseTurn(reply?.content,recap,limit);
  if(!turn.lines.length){
    messages.push({role:'assistant',content:String(reply?.content??'').slice(0,6000)},
      {role:'user',content:'请重新返回 JSON 对象，lines 至少包含一句有效台词。'});
    reply=await complete({messages,tools:[],signal});
    signal?.throwIfAborted();
    turn=parseTurn(reply?.content,recap,limit);
  }
  if(!turn.lines.length)throw Error('模型未返回有效台词，请重试。');
  const voice=alignedVoice(turn.lines,turn.speech,voiceLanguage);
  const output={lines:turn.lines,recap:opening?'':turn.recap,...(voice?{voice}:{})};
  if(companion.offerChoice===true&&/[？?][」』”’"']*$/.test(turn.lines.at(-1))){
    try { output.choices=cleanChoices(turn.choices); } catch { /* Invalid options do not block the dialogue. */ }
  }
  return output;
}

