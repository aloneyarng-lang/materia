import MarkdownIt from './vendor/markdown-it.mjs';
import katex from './vendor/katex/katex.mjs';
import {noteName} from './notes-vault-model.js';

const markdown=new MarkdownIt({html:false,linkify:false});
const escape=markdown.utils.escapeHtml;
const key=value=>String(value).normalize('NFC').toLocaleLowerCase();
const external=url=>/^https?:\/\//i.test(url);
const relative=url=>!/^([a-z][\w+.-]*:|\/\/)/i.test(url);
const validate=markdown.validateLink;
markdown.validateLink=url=>validate(url)&&(relative(url)||external(url));
function imageMarkup(url,alt){
  return relative(url)?`<img data-note-image="${escape(url)}" alt="${escape(alt)}">`:`<span class="note-image-alt">${escape(alt)}</span>`;
}
markdown.renderer.rules.image=(tokens,index)=>imageMarkup(tokens[index].attrGet('src')||'',tokens[index].content);
markdown.renderer.rules.table_open=()=>'<div class="notes-table-scroll"><table>';
markdown.renderer.rules.table_close=()=>'</table></div>';
markdown.renderer.rules.link_open=(tokens,index)=>{
  const href=tokens[index].attrGet('href')||'';
  if(external(href))return `<a href="${escape(href)}" target="_blank" rel="noopener noreferrer">`;
  return `<a href="#" data-note-link="${escape(href)}">`;
};

markdown.inline.ruler.before('link','note_wiki',(state,silent)=>{
  if(state.linkLevel||!['[','!'].includes(state.src[state.pos]))return false;
  const match=/^(!?)\[\[([^\]\n]{1,300})\]\]/.exec(state.src.slice(state.pos,state.posMax));
  if(!match)return false;
  const [target,label]=match[2].split('|',2);
  if(!target.trim())return false;
  const embed=Boolean(match[1]);
  if(embed&&!/\.(png|jpe?g|gif|webp)$/i.test(target.trim()))return false;
  if(!silent)state.push(embed?'note_wiki_image':'note_wiki','',0).meta={target:target.trim(),label:label?.trim()||target.trim()};
  state.pos+=match[0].length;
  return true;
});
markdown.renderer.rules.note_wiki=(tokens,index)=>{
  const {target,label}=tokens[index].meta;
  return `<a href="#" data-note-link="${escape(target)}" data-note-wiki>${escape(label)}</a>`;
};
markdown.renderer.rules.note_wiki_image=(tokens,index)=>imageMarkup(tokens[index].meta.target,tokens[index].meta.label);

function dollarEnd(text,from,marker){
  let end=from;
  while((end=text.indexOf(marker,end))!==-1){
    let slash=end;
    while(slash>0&&text[slash-1]==='\\')slash--;
    if((end-slash)%2===0)return end;
    end+=marker.length;
  }
  return -1;
}
markdown.inline.ruler.before('escape','note_math_inline',(state,silent)=>{
  const start=state.pos,src=state.src;
  if(src[start]!=='$'||src[start+1]==='$'||/\s/.test(src[start+1]||' '))return false;
  const end=dollarEnd(src,start+1,'$');
  if(end<=start+1||end>=state.posMax||src.slice(start,end).includes('\n')||/\s/.test(src[end-1])||/\d/.test(src[end+1]||''))return false;
  if(!silent)state.push('note_math_inline','',0).content=src.slice(start+1,end);
  state.pos=end+1;
  return true;
});
markdown.block.ruler.before('fence','note_math_block',(state,start,end,silent)=>{
  if(state.sCount[start]-state.blkIndent>=4)return false;
  const line=index=>state.src.slice(state.bMarks[index]+state.tShift[index],state.eMarks[index]);
  const first=line(start);
  if(!first.startsWith('$$'))return false;
  const lines=[first.slice(2)];
  let cursor=start,close=dollarEnd(lines[0],0,'$$');
  while(close<0&&++cursor<end){
    const text=line(cursor);
    lines.push(text);
    close=dollarEnd(text,0,'$$');
  }
  if(close<0||lines.at(-1).slice(close+2).trim())return false;
  if(silent)return true;
  lines[lines.length-1]=lines.at(-1).slice(0,close);
  const token=state.push('note_math_block','',0);
  token.content=lines.join('\n').trim();
  token.map=[start,cursor+1];
  state.line=cursor+1;
  return true;
},{alt:['paragraph','reference','blockquote','list']});

function math(tokens,index,_options,env){
  const token=tokens[index],block=token.type==='note_math_block',raw=token.content;
  env.formulas=(env.formulas||0)+1;
  if(raw.length>4000||env.formulas>300)return `<code class="note-math-error">${escape(raw)}</code>`;
  return katex.renderToString(raw,{displayMode:block,throwOnError:false,trust:false,strict:'ignore',maxSize:20,maxExpand:300});
}
markdown.renderer.rules.note_math_inline=math;
markdown.renderer.rules.note_math_block=math;

function parsed(body){
  const env={};
  const text=String(body||'').replace(/^\uFEFF/,'').replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/,'');
  return {env,tokens:markdown.parse(text,env)};
}

export function renderNoteMarkdown(body){
  const {env,tokens}=parsed(body),outline=[];
  for(let i=0;i<tokens.length;i++){
    const token=tokens[i];
    if(token.type==='heading_open'){
      const id='notes-heading-'+outline.length,inline=tokens[i+1];
      const label=inline?.children?.map(child=>child.meta?.label||child.content||(child.type==='softbreak'?' ':'')).join('')||inline?.content||'';
      token.attrSet('id',id);
      outline.push({id,label,depth:Number(token.tag[1])});
    }
    if(token.type==='list_item_open'){
      const inline=tokens[i+2];
      const first=inline?.type==='inline'&&inline.children?.[0];
      const check=first?.type==='text'&&/^\[([ xX])\]\s+/.exec(first.content);
      if(check){
        first.content=first.content.slice(check[0].length);
        token.attrJoin('class','note-task');
        token.meta={checked:check[1].toLowerCase()==='x'};
      }
    }
  }
  return {markup:markdown.renderer.render(tokens,markdown.options,env),outline};
}
markdown.renderer.rules.list_item_open=(tokens,index,options,_env,self)=>{
  const rendered=self.renderToken(tokens,index,options);
  if(!tokens[index].meta)return rendered;
  return rendered+`<input type="checkbox" tabindex="-1" disabled ${tokens[index].meta.checked?'checked':''}>`;
};

export function noteReferences(body){
  const {tokens}=parsed(body),links=[];
  for(const block of tokens){
    for(const token of block.children||[]){
      if(token.type==='note_wiki')links.push({target:token.meta.target,wiki:true});
      if(token.type==='link_open'&&relative(token.attrGet('href')||''))links.push({target:token.attrGet('href'),wiki:false});
    }
  }
  return links;
}

export function resolveNoteLink(target,source,notes,wiki=true){
  const [file,section='']=target.split('#',2);
  let decoded,heading;
  try{decoded=wiki?file:decodeURIComponent(file);heading=wiki?section:decodeURIComponent(section);}catch{return null;}
  if(!decoded)return heading?{id:source,heading}:null;
  if(!relative(decoded)||decoded.includes('\\')||decoded.startsWith('/')||(!wiki&&/\.[a-z\d]+$/i.test(decoded)&&!/\.md$/i.test(decoded)))return null;
  const withExt=/\.md$/i.test(decoded)?decoded:decoded+'.md';
  const normalize=parts=>{
    const out=[];
    for(const part of parts){
      if(part==='..'){if(!out.length)return '';out.pop();}
      else if(part&&part!=='.')out.push(part);
    }
    return out.join('/');
  };
  const direct=normalize(withExt.split('/')),near=normalize([...source.split('/').slice(0,-1),...withExt.split('/')]);
  const ordered=wiki&&withExt.includes('/')?[direct,near]:[near,direct];
  for(const value of ordered){
    const match=value&&notes.find(note=>key(note.id)===key(value));
    if(match)return {id:match.id,heading};
  }
  if(wiki&&!decoded.includes('/')){
    const matches=notes.filter(note=>key(noteName(note.id))===key(noteName(withExt)));
    if(matches.length===1)return {id:matches[0].id,heading};
  }
  return null;
}
