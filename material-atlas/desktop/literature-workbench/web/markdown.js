import MarkdownIt from '../../../dist/vendor/markdown-it.mjs';
import {inlineMath} from '../../../dist/markdown-math.js';

const markdown = new MarkdownIt({html:false, breaks:true});
inlineMath(markdown, {output:'mathml'});
const escape = markdown.utils.escapeHtml;
const localFigure = /^figure-[0-9]{3,}\.png$/;
markdown.validateLink = value => localFigure.test(value) || /^https?:\/\//i.test(value);
markdown.renderer.rules.image = (tokens, index, options, env, renderer) => {
  const image = tokens[index];
  if (env.figures?.has(image.attrGet("src"))) {
    image.attrSet("alt", renderer.renderInlineAsText(image.children, options, env));
    return renderer.renderToken(tokens, index, options);
  }
  return escape(image.content);
};
markdown.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
  tokens[index].attrSet("target", "_blank");
  tokens[index].attrSet("rel", "noopener noreferrer");
  return renderer.renderToken(tokens, index, options);
};
markdown.renderer.rules.table_open = () => '<div class="table-scroll"><table>';
markdown.renderer.rules.table_close = () => '</table></div>\n';

export function unwrapMarkdown(value) {
  const text = String(value ?? "").trim();
  return text.match(/^```(?:markdown|md)[^\S\n]*\r?\n([\s\S]*?)\r?\n```$/i)?.[1] ?? text;
}

export function renderMarkdown(value, figures) {
  return markdown.render(unwrapMarkdown(value), {figures});
}

export function renderReport(title, source, figures, css) {
  const body = renderMarkdown(source.replace(/^<!-- materia:turn -->\r?\n/gm, ""), new Set(figures.filter(name => localFigure.test(name))));
  return `<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8">
<meta name="materia-report-math" content="1">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'self' file:; base-uri 'none'; form-action 'none'">
<title>${escape(title)}</title>
<style>
${css}
body{max-width:920px;margin:0 auto;padding:clamp(16px,5vw,56px);color:#1d2b27;background:#fff;font:16px/1.7 system-ui,sans-serif}
img{max-width:100%;height:auto} h1,h2,h3{line-height:1.35}
</style>
<main class="markdown">${body}</main>
</html>
`;
}
