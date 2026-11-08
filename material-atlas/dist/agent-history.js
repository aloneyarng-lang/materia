export const HISTORY_FORMAT = 'materia-agent-history';
import {cleanCharacter} from './agent-character.js';
import {cleanChoices} from './agent-choices.js';
export const HISTORY_MAX_BYTES = 20 * 1024 * 1024;
const idOf = value => {
  if (typeof value !== 'string' || !/^[a-z\d_-]{1,120}$/i.test(value)) throw new Error('聊天记录 ID 无效。');
  return value;
};
const bounded = (value,max) => {
  if (typeof value !== 'string' || value.length > max) throw new Error('聊天记录内容过长或格式无效。');
  return value;
};
export const emptyAgentHistory = () => ({format:HISTORY_FORMAT,version:1,activeId:'',conversations:[]});

// Project only message fields: provider credentials and request settings never persist here.
export function cleanAgentHistory(value) {
  if (!value || value.format!==HISTORY_FORMAT || value.version!==1 || !Array.isArray(value.conversations)) throw new Error('聊天历史格式无效，原文件已保留。');
  if (value.conversations.length>200) throw new Error('聊天历史已满（最多 200 个对话），请先删除不需要的对话。');
  const ids=new Set();
  const conversations=value.conversations.map(chat=>{
    const id=idOf(chat.id);if(ids.has(id))throw new Error('聊天记录 ID 重复。');ids.add(id);
    const scopeIds=chat.scopeIds===null?null:Array.isArray(chat.scopeIds)?[...new Set(chat.scopeIds.map(idOf))]:undefined;
    if(scopeIds===undefined||scopeIds?.length>10000)throw new Error('聊天文献范围无效。');
    if(!Array.isArray(chat.entries)||chat.entries.length>1000)throw new Error('单个对话最多保存 1000 条消息，请另开新对话。');
    const entries=chat.entries.map(entry=>{
      if(!['user','assistant','error'].includes(entry?.role))throw new Error('聊天消息类型无效。');
      const sources=Array.isArray(entry.sources)?entry.sources.map(source=>({id:idOf(source.id),title:bounded(source.title,1000),year:String(source.year||'').slice(0,4),journal:String(source.journal||'').slice(0,300),doi:String(source.doi||'').slice(0,1000)})):[];
      if(sources.length>500)throw new Error('单条消息来源过多。');
      return {role:entry.role,content:bounded(entry.content,60000),...(sources.length?{sources}: {}),
        ...(entry.role==='assistant'&&entry.choices?{choices:cleanChoices(entry.choices)}:{})};
    });
    if(!Number.isFinite(chat.createdAt)||!Number.isFinite(chat.updatedAt))throw new Error('聊天时间格式无效。');
    return {id,title:bounded(chat.title,120),scopeIds,createdAt:chat.createdAt,updatedAt:chat.updatedAt,entries,
      ...(chat.character?{character:{...cleanCharacter(chat.character),image:''}}:{})};
  }).sort((a,b)=>b.updatedAt-a.updatedAt);
  const activeId=value.activeId?idOf(value.activeId):'';
  if(activeId&&!ids.has(activeId))throw new Error('当前聊天记录不存在。');
  const result={format:HISTORY_FORMAT,version:1,activeId,conversations};
  if(new TextEncoder().encode(JSON.stringify(result)).byteLength>HISTORY_MAX_BYTES)throw new Error('聊天历史已满（20 MB），请先删除不需要的对话。');
  return result;
}

export function chatTitle(entries) {
  return (entries.find(entry=>entry.role==='user')?.content||'新对话').replace(/[#*_`>\[\]]/g,'').replace(/\s+/g,' ').trim().slice(0,64)||'新对话';
}
