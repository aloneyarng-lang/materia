import {KURISU_ID,REZE_ID,GANYU_ID,CHARACTER_MEMORY_IDS, cleanReplyLanguage, memoryTerms} from './agent-character-memory.js';
import {kurisuCanonAliases} from './agent-kurisu-canon.js';

const languages=['zh-CN','en','ja'];
const sourceMethods=new Set(['game_script_bytecode','authoritative_subtitle','manual_review','dual_asr_correction',
  'source_summary','secondary_plot_summary','authored_style_example','official_audio_excerpt','qwen_dual_asr','fan_vn_transcript','fan_vn_pair','anime_subtitle_window','local_scx_speaker_tag','game_text_metadata','wiki_voice_transcription','secondary_quote_transcription']);
const normalize=text=>text.normalize('NFKC').toLowerCase().trim();
const assets={
  [GANYU_ID]:new URL('./assets/characters/genshin-ganyu/corpus.json',import.meta.url),
  [KURISU_ID]:new URL('./assets/characters/makise-kurisu/corpus.json',import.meta.url),
  [REZE_ID]:new URL('./assets/characters/chainsawman-reze/corpus.json',import.meta.url),
};

export function validateCharacterCorpus(payload, id=KURISU_ID) {
  if(payload?.format!=='materia-character-corpus'||payload.version!==1||payload.characterId!==id||
    !languages.every(locale=>payload.languages?.includes(locale))||!Array.isArray(payload.records)||
    !payload.records.length||payload.records.length>60000)throw Error('角色语料库格式无效。');
  const ids=new Set();
  for(const record of payload.records){
    if(typeof record.id!=='string'||ids.has(record.id)||!sourceMethods.has(record.source?.method)||
      typeof record.work!=='string'||typeof record.sourceLanguage!=='string'||
      !Array.isArray(record.lines)||!record.lines.length||record.lines.length>30||
      record.lines.some(line=>!languages.every(locale=>typeof line?.texts?.[locale]==='string'&&line.texts[locale].trim())))
      throw Error('角色语料库含有无效或缺译的记录。');
    ids.add(record.id);
  }
  return payload;
}

function buildIndex(payload) {
  const postings=new Map();
  const docs=payload.records.map((record,index)=>{
    const bodies=languages.map(locale=>normalize(record.lines.map(line=>line.texts[locale]).join('\n')));
    const metadata=normalize([record.scene,...(record.tags??[])].filter(Boolean).join(' '));
    const terms=new Set([...bodies,metadata].flatMap(body=>[...memoryTerms(body)]));
    for(const token of terms){
      const list=postings.get(token);
      if(list)list.push(index);
      else postings.set(token,[index]);
    }
    return {record,bodies,metadata};
  });
  return {postings,docs,characterId:payload.characterId};
}

function rowFor(record,locale,phrases,browse) {
  const source=record.source;
  const sourceLocale=record.sourceLanguage==='zh'?'zh-CN':record.sourceLanguage;
  const original=line=>line.sourceText??line.texts[sourceLocale]??'';
  const matched=record.lines.findIndex(line=>phrases.some(phrase=>
    Object.values(line.texts).some(text=>normalize(text).includes(phrase))));
  const lines=browse?record.lines:record.lines.slice(Math.max(0,matched-1),Math.max(5,matched+4));
  const passage=lines.map(line=>({
    speaker:line.speaker??null,text:line.texts[locale].slice(0,240),
    ...(locale!==sourceLocale&&original(line)?{original:original(line).slice(0,200)}:{}),
  }));
  return {
    id:record.id,kind:record.kind,work:record.work,variant:record.variant,scene:record.scene??null,
    sourceLanguage:record.sourceLanguage,method:source.method,...(source.userEdited?{userEdited:true}:{}),
    ...(source.url?{sourceUrl:source.url}:{}),...(source.title?{sourceTitle:source.title}:{}),
    ...(source.evidence?{evidence:source.evidence}:{}),
    ...(source.primaryVerified===false?{primaryVerified:false}:{}),
    ...(source.gamePath?{gamePath:source.gamePath}:{}),
    ...(source.volume?{volume:source.volume}:{}),
    ...(source.chapter?{chapter:source.chapter}:{}),
    ...(source.locationNote?{locationNote:source.locationNote}:{}),
    translation:source.userEdited?'personal':record.kind==='authored_style_example'?'authored':record.kind==='canon_summary'?'summary':locale===sourceLocale?'source':record.lines.every(line=>line.officialLanguages?.includes(locale))?'official':record.lines.every(line=>line.transcribedLanguages?.includes(locale))?'transcription':record.lines.every(line=>line.translatedLanguages?.includes(locale))?'adapted':record.lines.some(line=>line.revisedLanguages?.includes(locale))?'revised':'machine',
    lines:passage,
  };
}

function find(index, query, locale, browse) {
  const cleaned=normalize(query).slice(0,140);
  const aliases=(index.characterId===KURISU_ID?kurisuCanonAliases(cleaned):index.characterId===GANYU_ID?ganyuAliases(cleaned):rezeAliases(cleaned)).map(normalize);
  const phrases=[cleaned,...aliases].filter(phrase=>phrase.length>=2);
  const tokens=[...new Set([...memoryTerms(cleaned),...aliases.flatMap(alias=>[...memoryTerms(alias)])])].slice(0,54);
  const explicitVariant=/阿玛迪斯|アマデウス|amadeus|命运石之门\s*0|steins.?gate\s*0/i.test(query);
  if(!tokens.length)return [];
  const matches=new Map();
  for(const token of tokens){
    const list=index.postings.get(token);
    if(!list||list.length>index.docs.length*0.35&&list.length>100)continue;
    const weight=Math.log1p(index.docs.length/list.length);
    for(const position of list){
      const row=matches.get(position);
      if(row){row.score+=weight;row.hits++;}
      else matches.set(position,{position,score:weight,hits:1});
    }
  }
  const ranked=[];
  for(const row of matches.values()){
    const {record,bodies,metadata}=index.docs[row.position];
    if(!browse&&record.variant==='amadeus'&&!explicitVariant)continue;
    if(!browse&&index.characterId===REZE_ID&&record.kind==='authored_style_example')continue;
    const exact=cleaned.length>=2&&bodies.some(text=>text.includes(cleaned));
    const metadataHit=phrases.some(phrase=>metadata.includes(phrase));
    const aliasHit=aliases.some(alias=>bodies.some(text=>text.includes(alias)));
    if(!exact&&!aliasHit&&!metadataHit&&row.hits<(tokens.length>=5?2:1))continue;
    if(!browse&&!exact&&!aliasHit&&!metadataHit&&row.hits<2&&tokens.length>2)continue;
    const original=record.work==='SG'||record.work==='Steins;Gate';
    const sourceBody=bodies[languages.indexOf(record.sourceLanguage==='zh'?'zh-CN':record.sourceLanguage)]||'';
    const verified=phrases.some(phrase=>sourceBody.includes(phrase));
    const confidence=record.kind==='authored_style_example'?-4:record.source.method==='secondary_plot_summary'?-2:record.kind==='fan_vn_pair'?-3:record.source.method==='qwen_dual_asr'?-1.2:0;
    ranked.push({...row,score:Math.min(15,row.score)+(exact?6:0)+(aliasHit?4:0)+(metadataHit?2:0)+(verified?4:0)+(original?1.1:0)+confidence+
      (record.source.method==='game_text_metadata'?2:record.source.method==='secondary_quote_transcription'?1:0)+
      (record.kind==='anime_subtitle_window'?2.5:record.kind==='fan_vn_pair'?0.2:0)});
  }
  ranked.sort((a,b)=>b.score-a.score||a.position-b.position);
  if(!browse){
    // Keep an actually matched source quote in the three prompt references.
    // Scene tags can connect a cafe query to dialogue that does not say "coffee".
    const isDialogue=match=>index.docs[match.position].record.kind==='dialogue';
    if(!ranked.slice(0,3).some(isDialogue)){
      const position=ranked.findIndex(match=>isDialogue(match)&&
        ['game_text_metadata','secondary_quote_transcription'].includes(index.docs[match.position].record.source.method));
      if(position>=3){const [quote]=ranked.splice(position,1);ranked.splice(1,0,quote);}
    }
  }
  const seen=new Set(), result=[];
  for(const match of ranked){
    const row=rowFor(index.docs[match.position].record,locale,phrases,browse);
    const identity=normalize(row.lines.map(line=>line.text).join(' '));
    if(seen.has(identity))continue;
    seen.add(identity);result.push(row);
    if(result.length>=(browse?10:3))break;
  }
  return result;
}

function rezeAliases(query){
  const groups=[['咖啡','咖啡店','二道','coffee','café','喫茶店','コーヒー'],
    ['电次','デンジ','denji'],['蕾塞','レゼ','reze'],['上田丽奈','上田麗奈','reina ueda'],
    ['学校','school','游泳','swim','泳ぎ'],['下雨','雨宿り','rain']];
  return groups.filter(words=>words.some(word=>query.includes(word))).flat();
}

function ganyuAliases(query){
  const groups=[['甘雨','ganyu'],['璃月','liyue','璃月港'],['七星','qixing'],
    ['秘书','secretary','秘書','月海亭','yuehai'],['契约','contract','契約'],
    ['休息','午觉','nap','rest','お昼寝'],['草地','聆听','grass','heartbeat','大地','鼓動'],
    ['凝光','ningguang','凝光さん'],['刻晴','keqing','刻晴さん'],['清心','qingxin'],
    ['留云','闲云','cloud retainer','xianyun','留雲'],['加班','overtime','残業']];
  return groups.filter(words=>words.some(word=>query.includes(word))).flat();
}

export function createCharacterCorpus(load) {
  const pending=new Map();
  return async ({characterId=KURISU_ID,query='',locale='zh-CN',browse=false}={})=>{
    if(!CHARACTER_MEMORY_IDS.includes(characterId))return {count:0,matches:[]};
    if(!pending.has(characterId))pending.set(characterId,Promise.resolve().then(()=>load(characterId)).then(payload=>{
      if(!payload)return null;
      return {data:validateCharacterCorpus(payload,characterId),index:null};
    }).catch(error=>{pending.delete(characterId);throw error;}));
    const corpus=await pending.get(characterId);
    if(!corpus)return {count:0,matches:[]};
    const count=corpus.data.records.length;
    if(typeof query!=='string'||!query.trim())return {count,matches:[]};
    corpus.index??=buildIndex(corpus.data);
    return {count,matches:find(corpus.index,query,cleanReplyLanguage(locale),browse)};
  };
}

export const browsePreviewCorpus=createCharacterCorpus(async characterId=>{
  const response=await fetch(assets[characterId]);
  if(response.status===404)return null;
  if(!response.ok)throw Error('无法读取本地角色语料。');
  return response.json();
});
