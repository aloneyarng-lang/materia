import katex from './vendor/katex/katex.mjs';

export function dollarEnd(text, from, marker) {
  let end = from;
  while ((end = text.indexOf(marker, end)) !== -1) {
    let slash = end;
    while (slash > 0 && text[slash-1] === '\\') slash--;
    if ((end-slash)%2 === 0) return end;
    end += marker.length;
  }
  return -1;
}

export function renderMath(markdown, raw, env, options = {}) {
  env.formulas = (env.formulas || 0) + 1;
  if (raw.length > 4000 || env.formulas > 300) {
    return `<code class="note-math-error">${markdown.utils.escapeHtml(raw)}</code>`;
  }
  return katex.renderToString(raw, {
    throwOnError:false, trust:false, strict:'ignore', maxSize:20, maxExpand:300, ...options,
  });
}

export function inlineMath(markdown, options) {
  markdown.inline.ruler.before('escape', 'math_inline', (state, silent) => {
    const start = state.pos, src = state.src;
    if (src[start] !== '$' || src[start-1] === '$' || src[start+1] === '$' || /\s/.test(src[start+1] || ' ')) return false;
    const end = dollarEnd(src, start+1, '$');
    if (end <= start+1 || end >= state.posMax || src[end+1] === '$' ||
        /\s/.test(src[end-1]) || /\d/.test(src[end+1] || '')) return false;
    const formula = src.slice(start+1,end);
    if (/[\n`]/.test(formula)) return false;
    if (!silent) state.push('math_inline', '', 0).content = formula;
    state.pos = end+1;
    return true;
  });
  markdown.renderer.rules.math_inline = (tokens, index, _options, env) =>
    renderMath(markdown, tokens[index].content, env, options);
}
