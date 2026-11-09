import {REPLY_LANGUAGES} from './agent-character-memory.js';

export function voiceInstructions(language, companion=false) {
  if (!Object.hasOwn(REPLY_LANGUAGES,language)) return '';
  const format=companion
    ? '在原有 JSON 中增加 speech 数组，与 lines 严格逐项对应。'
    : '最终回答正文使用 JSON 对象 {"segments":[{"text":"屏幕台词","speech":"朗读台词"}]}。text 保持回复语言，可以保留 Markdown 和有效文献引用。需要选项时增加 choices 数组。工具调用仍遵循外层接口。';
  return '\n【配音格式】'+format+'speech 使用 '+REPLY_LANGUAGES[language]+'，忠实表达对应屏幕台词的内容，只包含说出口的话。每句 speech 最多 180 字。第一句用简短自然的回应直接切入，speech 尽量在 20 字以内，其余内容继续展开。禁止用没有信息的套话凑第一句。';
}

export function readVoiceObject(content) {
  try {return JSON.parse(content.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i,'$1'));}
  catch {return null;}
}

export function alignedVoice(texts, speech, language) {
  if (!Object.hasOwn(REPLY_LANGUAGES,language) || !Array.isArray(speech) || speech.length!==texts.length ||
      speech.some(line=>typeof line!=='string'||!line.trim()||[...line.trim()].length>180)) return undefined;
  return {language,segments:texts.map((text,index)=>({text,speech:speech[index].trim()}))};
}

export function readVoiceReply(content, language) {
  if (!Object.hasOwn(REPLY_LANGUAGES,language)) return null;
  const parsed=readVoiceObject(content),rows=parsed?.segments;
  if (!Array.isArray(rows)||!rows.length||rows.length>200||
      rows.some(row=>typeof row?.text!=='string'||!row.text.trim()||row.text.length>4000)) return null;
  const texts=rows.map(row=>row.text.trim());
  const voice=alignedVoice(texts,rows.map(row=>row.speech),language);
  const answer=texts.join('\n\n');
  if (answer.length>60000) return null;
  return {answer,voice,choices:parsed.choices};
}
