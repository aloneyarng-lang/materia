const get = id => document.getElementById(id);
let papers = [], version, request = 0, selected;
function draw() {
  const query = get('query').value.trim().toLowerCase();
  get('papers').replaceChildren(...papers.filter(p => (p.title || p.filename).toLowerCase().includes(query)).map(p => {
    const button = document.createElement('button');
    button.textContent = p.title || p.filename;
    button.setAttribute('aria-pressed', String(selected?.id === p.id));
    button.onclick = () => {
      selected = p;
      get('work').dataset.paperId = p.id;
      get('work').dataset.paperYear = p.year || '';
      get('work').dataset.sourceText = '';
      get('paper-title').textContent = button.textContent;
      get('work').hidden = false;
      get('tool-status').textContent = '正在读取文献正文…';
      draw();
      parent.postMessage({type:'studio-read-pdf', id:p.id, request:++request, version}, '*');
    };
    return button;
  }));
}
get('query').oninput = draw;
window.addEventListener('message', async event => {
  if (event.source !== parent) return;
  const m = event.data;
  if (m?.type === 'studio-theme') {
    for (const [key,value] of Object.entries(m.tokens)) document.documentElement.style.setProperty('--'+key,value);
    document.documentElement.dataset.themeMode = m.mode;
  }
  if (m?.type === 'studio-library') {
    papers = m.matchingIds ? m.papers.filter(p=>m.matchingIds.includes(p.id)) : m.papers;
    if (version !== m.version || !papers.some(p=>p.id===selected?.id)) {
      selected = null; request++; get('work').hidden = true; get('work').removeAttribute('data-paper-id');
      get('tool-status').textContent = papers.length ? '选择一篇文献' : '当前没有可选文献';
    }
    version = m.version; draw();
  }
  if (m?.type !== 'studio-pdf' || m.request !== request || m.version !== version) return;
  try {
    if (m.error) throw Error(m.error);
    const response = await fetch('/paper-text',{method:'POST', body:m.data, headers:{'Content-Type':'application/pdf','X-Workbench':document.querySelector('[name=workbench]').content}});
    const data = await response.json();
    if (!response.ok) throw Error(data.error || '读取正文失败');
    if (m.request !== request) return;
    get('work').dataset.sourceText = data.text;
    get('tool-status').textContent = data.text.trim() ? '' : '文献没有可提取的正文';
  } catch (e) { if (m.request === request) get('tool-status').textContent = e.message; }
});
parent.postMessage({type:'studio-ready'}, '*');
