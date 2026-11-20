import MarkdownIt from './vendor/markdown-it.mjs';

const markdown = new MarkdownIt({ html: false, breaks: true, linkify: false });
const escape = markdown.utils.escapeHtml;
const validateLink = markdown.validateLink;
markdown.validateLink = value => {
  if (!validateLink(value)) return false;
  try { return ['https:', 'http:'].includes(new URL(value).protocol); } catch { return false; }
};
// Images remain readable without loading URLs embedded in model output.
markdown.renderer.rules.image = (tokens, index) => `<span class="agent-image-alt">[图片：${escape(tokens[index].content)}]</span>`;
const linkOpen = markdown.renderer.rules.link_open || ((tokens,index,options,env,self) => self.renderToken(tokens,index,options));
markdown.renderer.rules.link_open = (tokens,index,options,env,self) => {
  tokens[index].attrSet('target','_blank');
  tokens[index].attrSet('rel','noopener noreferrer');
  return linkOpen(tokens,index,options,env,self);
};
markdown.renderer.rules.table_open = () => '<div class="agent-table-scroll"><table>\n';
markdown.renderer.rules.table_close = () => '</table></div>\n';

// Resolve citations during inline parsing so code blocks, code spans and links
// retain their literal content. Only references retrieved for this answer qualify.
markdown.inline.ruler.before('link','paper_citation',(state,silent) => {
  if (state.src[state.pos] !== '[' || state.linkLevel > 0) return false;
  const match = state.src.slice(state.pos,state.posMax).match(/^\[([^\]\n]{1,160})\]/);
  if (!match || state.src[state.pos+match[0].length] === '(') return false;
  const source = state.env.paperReferences?.get(match[1]);
  if (!source) return false;
  if (!silent) { const token=state.push('paper_citation','',0); token.meta=source; }
  state.pos += match[0].length;
  return true;
});
markdown.renderer.rules.paper_citation = (tokens,index) => {
  const source=tokens[index].meta;
  return `<button type="button" class="agent-citation" data-agent-source="${escape(String(source.id))}">[${escape(String(source.title))}]</button>`;
};

export function renderChatMarkdown(content, sources = []) {
  return markdown.render(String(content ?? ''), { paperReferences: new Map(sources.map(source => [source.id,source])) });
}
