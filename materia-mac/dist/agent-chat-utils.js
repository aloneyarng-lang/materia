// Failed questions remain visible but are excluded from model follow-up context.
export function completedChatContext(entries = []) {
  const result=[];let question=null;
  for(const entry of entries){
    if(entry.role==='user')question=entry;
    else if(entry.role==='error')question=null;
    else if(entry.role==='assistant'&&question){result.push({role:'user',content:question.content},{role:'assistant',content:entry.content});question=null;}
  }
  return result;
}
export function retryQuestion(entries,index){
  if(entries[index]?.role!=='error')return '';
  for(let i=index-1;i>=0;i--){if(entries[i].role==='user')return entries[i].content;if(entries[i].role==='assistant')break;}
  return '';
}
const markdownText = value => String(value??'').replace(/[\\`*_\[\]<>]/g,'\\$&').replace(/[\r\n]+/g,' ');
export function chatMarkdown(chat){
  const rows=[`# ${markdownText(chat.title||'研究对话')}`,'',`> 文献范围：${chat.scopeIds===null?'整个文献库':`${chat.scopeIds.length} 篇文献`}`,''];
  const sources=new Map();
  for(const entry of chat.entries||[]){
    const label={user:'你',assistant:'AI 研究助手',error:'请求未完成'}[entry.role];if(!label)continue;
    rows.push(`## ${label}`,'',entry.content,'');for(const source of entry.sources||[])sources.set(source.id,source);
  }
  if(sources.size){
    rows.push('## 文献来源','');
    for(const source of sources.values()){
      const meta=[source.title,source.year,source.journal].filter(Boolean).map(markdownText).join(' · ');
      const doi=/^10\.\d{4,9}\/\S+$/i.test(source.doi||'')?` [DOI](https://doi.org/${source.doi.split('/').map(encodeURIComponent).join('/')})`:'';
      rows.push(`- **${markdownText(source.id)}**：${meta}${doi}`);
    }
    rows.push('');
  }
  return rows.join('\n');
}
