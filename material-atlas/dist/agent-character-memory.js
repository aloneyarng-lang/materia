// Personal memories are references into the current library's conversation history.
export const KURISU_ID = 'makise-kurisu';
export const REZE_ID = 'chainsawman-reze';
export const GANYU_ID='genshin-ganyu';
export const CHARACTER_MEMORY_IDS=Object.freeze([KURISU_ID,REZE_ID,GANYU_ID]);
export const REPLY_LANGUAGES = Object.freeze({'zh-CN':'简体中文',en:'English',ja:'日本語'});
export const cleanReplyLanguage = value => Object.hasOwn(REPLY_LANGUAGES,value) ? value : 'zh-CN';

export function characterIdFor(character) {
  if(character?.actorId==='reze')return REZE_ID;
  if(character?.actorId==='ganyu')return GANYU_ID;
  return character && (character.actorId || 'amadeus') === 'amadeus' &&
    typeof character.name === 'string' && /amadeus|红莉栖|紅莉栖|kurisu/i.test(character.name)
    ? KURISU_ID : null;
}

export function legacyMemorySeeds(value) {
  return Array.isArray(value) ? [...new Set(value
    .filter(text=>typeof text==='string')
    .map(text=>text.trim().slice(0,180))
    .filter(Boolean))].slice(0,16) : [];
}

function turnKind(text) {
  if(/^[\s]*(?:我叫|叫我|我的名字是|my name is\b|call me\b|私の名前は)/iu.test(text)&&!/[？?]/u.test(text))return 'name';
  if(/^[\s]*(?:我(?:更)?喜欢|我不喜欢|我习惯|i (?:prefer|like|dislike)\b|私は.{0,22}が好き)/iu.test(text)&&!/[？?]/u.test(text))return 'preference';
  return 'exchange';
}

function indexCompletedTurns(entries) {
  const pairs=[];
  let userIndex=-1;
  for(const [index,entry] of entries.entries()){
    if(entry.role==='user')userIndex=index;
    else if(entry.role==='error')userIndex=-1;
    else if(entry.role==='assistant'&&!entry.automatic&&userIndex>=0){
      const text=entries[userIndex].content.trim();
      if(text&&entry.content.trim())pairs.push([userIndex,index,turnKind(text)]);
      userIndex=-1;
    }
  }
  return pairs;
}

export function cleanMemoryEdits(value){
  const edits={};
  for(const [key,row] of Object.entries(value||{}).slice(0,5000)){
    if(!/^[a-z0-9_-]{1,120}:\d{1,4}$/i.test(key)||!row||typeof row!=='object')continue;
    edits[key]={...(typeof row.text==='string'?{text:row.text.trim().slice(0,4000)}:{}),
      ...(typeof row.reply==='string'?{reply:row.reply.trim().slice(0,4000)}:{}),deleted:row.deleted===true,
      updatedAt:Number.isFinite(row.updatedAt)?row.updatedAt:0};
  }return edits;
}
export function cleanMemoryNotes(value){
  return (Array.isArray(value)?value:[]).slice(0,1000).filter(n=>n&&typeof n.id==='string'&&/^note-[a-z0-9-]{1,80}$/i.test(n.id)&&typeof n.text==='string'&&n.text.trim())
    .map(n=>({id:n.id,text:n.text.trim().slice(0,4000),reply:typeof n.reply==='string'?n.reply.trim().slice(0,4000):'',deleted:n.deleted===true,updatedAt:Number.isFinite(n.updatedAt)?n.updatedAt:0}));
}
export function indexCharacterMemory(conversations, prior, legacy) {
  const roles={};
  for(const id of CHARACTER_MEMORY_IDS){
    const previous=prior?.version===1?prior.roles?.[id]:undefined;
    const replyLanguage=cleanReplyLanguage(previous?.replyLanguage);
    const migrated=id===KURISU_ID?legacyMemorySeeds(previous?.migrated??legacy?.facts):[];
    const episodes=[];
    for(const chat of conversations){
      if(characterIdFor(chat.character)!==id)continue;
      const turns=indexCompletedTurns(chat.entries);
      if(turns.length)episodes.push({chatId:chat.id,turns});
    }
    const memoryEdits=cleanMemoryEdits(previous?.memoryEdits),notes=cleanMemoryNotes(previous?.notes);
    if(episodes.length||migrated.length||notes.length||Object.keys(memoryEdits).length||replyLanguage!=='zh-CN')roles[id]={replyLanguage,episodes,...(migrated.length?{migrated}:{}),...(Object.keys(memoryEdits).length?{memoryEdits}:{}),...(notes.length?{notes}:{})};
  }
  return {version:1,roles};
}

export function profileFor(state, characterId=KURISU_ID) {
  return state?.characterMemory?.version===1 ? state.characterMemory.roles?.[characterId] : undefined;
}

const STOP_WORDS=new Set(['我说','记得','还记','上次','我们','你说','之前','这个','那个','什么','还有','可以','怎么','如果','是不','不是','你能','一下','能不','关于','继续','the','and','about','you','was','have','this','that','with','remember','last','time']);

export function memoryTerms(text) {
  const chunks=String(text??'').slice(0,1600).normalize('NFKC').toLowerCase()
    .match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+|[a-z0-9]{2,}/gu)||[];
  const tokens=new Set();
  for(const chunk of chunks){
    if(/^[a-z0-9]/.test(chunk)){
      if(!STOP_WORDS.has(chunk))tokens.add(chunk);
    }else for(let i=0;i<chunk.length-1;i++){
      const pair=chunk.slice(i,i+2);
      if(!STOP_WORDS.has(pair))tokens.add(pair);
    }
  }
  return tokens;
}

function sharedTerms(query, text) {
  let count=0;
  for(const term of memoryTerms(text))if(query.has(term))count++;
  return count;
}

export function recallCharacterMemory({state, character, activeId, scopeIds=null, question=''}) {
  const id=characterIdFor(character);
  if(!id)return undefined;
  const profile=profileFor(state,id);
  const replyLanguage=cleanReplyLanguage(profile?.replyLanguage);
  const query=memoryTerms(question);
  const scopeKey=ids=>ids==null?null:JSON.stringify([...ids].sort());
  const currentScope=scopeKey(scopeIds);
  const chats=new Map((state?.conversations||[]).map(chat=>[chat.id,chat]));
  const recent=[];
  let name;
  for(const episode of (profile?.episodes||[]).slice(0,48)){
    const chat=chats.get(episode.chatId);
    if(!chat||characterIdFor(chat.character)!==id||scopeKey(chat.scopeIds)!==currentScope)continue;
    if(!name){
      const latestName=episode.turns.findLast(([, ,kind])=>kind==='name');
      if(latestName){const edit=profile?.memoryEdits?.[chat.id+':'+latestName[0]];if(!edit?.deleted)name=(edit?.text??chat.entries[latestName[0]]?.content)?.trim().slice(0,140);}
    }
    for(const [userIndex,assistantIndex] of episode.turns.slice(-32).reverse()){
      if(chat.id===activeId&&userIndex>=chat.entries.length-12)continue;
      const user=chat.entries[userIndex],assistant=chat.entries[assistantIndex];
      if(user?.role!=='user'||assistant?.role!=='assistant'||assistant.automatic)continue;
      const edit=profile?.memoryEdits?.[chat.id+':'+userIndex];if(edit?.deleted)continue;
      const text=(edit?.text??user.content).trim().slice(0,240);
      if(!text||text===question.trim())continue;
      recent.push({text,reply:(edit?.reply??assistant.content).trim().slice(0,200),where:chat.id===activeId?'本次对话':'之前的对话',
        score:sharedTerms(query,text)});
    }
  }
  for(const note of profile?.notes||[]){if(!note.deleted)recent.push({text:note.text.slice(0,240),reply:note.reply.slice(0,200),where:'手动补充的记忆',score:sharedTerms(query,note.text)});}
  const explicit=/还记得|你记得|上次|do you remember|last time|覚えて/i.test(question);
  const lastTopic=/上次.{0,7}(聊|谈|说).{0,6}(什么|哪些)|what.{0,25}(discuss|talk about).{0,20}last time|前回.{0,8}何を話/i.test(question);
  const ranked=recent.filter(row=>row.score>=2||explicit&&row.score>=1).sort((a,b)=>b.score-a.score);
  if(!ranked.length&&lastTopic){
    const latest=recent.find(row=>row.where==='之前的对话');
    if(latest)ranked.push(latest);
  }
  const unique=new Map();
  for(const {text,reply,where} of ranked)if(!unique.has(text))unique.set(text,{text,reply,where});
  const migrated=legacyMemorySeeds(profile?.migrated)
    .filter(fact=>sharedTerms(query,fact)>0||/^(称呼|名字|叫我|name\b)/i.test(fact))
    .slice(0,4);
  return {replyLanguage,episodic:[...unique.values()].slice(0,3),migrated,...(name?{name}:{})};
}

