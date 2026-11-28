const api = window.materiaDesktop;
const hall = document.createElement('dialog');
hall.className = 'exhibition-hall';
hall.setAttribute('aria-label','展览馆');
hall.innerHTML = `<header><h1>展览馆</h1><nav aria-label="作品导入"><button data-import="file">导入 HTML</button><button data-import="directory" title="连同图片、样式和脚本一起导入">导入文件夹</button></nav><button data-close aria-label="关闭展览馆">关闭 ×</button></header>
<p class="ex-status" role="status"></p><section class="ex-wall"><div class="ex-stage"></div><footer><div><small></small><h2></h2></div><button data-enter>进入作品 ↗</button></footer></section><section class="ex-index" aria-label="展览目录"></section><button class="ex-return">← 返回展厅</button>`;
document.body.append(hall);
const find = selector => hall.querySelector(selector);
const stage = find('.ex-stage');
const index = find('.ex-index');
const status = find('.ex-status');
let works = [], active = 0;
function select(position) {
  active = position;
  const work = works[active];
  const frame = document.createElement('iframe');
  frame.title = work.name;
  frame.setAttribute('sandbox','allow-scripts');
  frame.src = 'materia-exhibition://'+work.id+'/'+encodeURIComponent(work.entry);
  frame.tabIndex = -1;
  stage.replaceChildren(frame);
  find('h2').textContent = work.name;
  find('small').textContent = String(active+1).padStart(2,'0')+' / '+String(works.length).padStart(2,'0');
  Array.from(index.children).forEach((row,i)=>row.setAttribute('aria-current',String(i===active)));
}
async function refresh(name) {
  works = await api.exhibitionList();
  index.replaceChildren(...works.map((work,i)=>{
    const row = document.createElement('button');
    row.textContent = work.name;
    row.onclick = ()=>select(i);
    return row;
  }));
  find('.ex-wall').hidden = !works.length;
  if (works.length) select(Math.max(0,works.findIndex(item=>item.name===name)));
  status.textContent = works.length ? '' : '导入第一个网页开始布展。有配套资源的作品请选择整个文件夹。';
}
document.querySelector('#exhibition-open').onclick = async ()=>{
  hall.showModal();
  if (!api?.exhibitionList) {
    status.textContent = '请从 Materia 桌面端打开本地展览库。';
    find('.ex-wall').hidden = true;
    find('nav').hidden = true;
    return;
  }
  try { await refresh(); } catch(e) { status.textContent=e.message; }
};
for (const button of hall.querySelectorAll('[data-import]')) button.onclick = async ()=>{
  const buttons = hall.querySelectorAll('[data-import]');
  buttons.forEach(b=>b.disabled=true);
  try {
    const name = await api.exhibitionAdd(button.dataset.import);
    if(name) await refresh(name);
  } catch(e) { status.textContent=e.message; }
  finally { buttons.forEach(b=>b.disabled=false); }
};
function viewing(on) {
  hall.classList.toggle('ex-viewing',on);
  stage.firstElementChild.tabIndex = on ? 0 : -1;
  find(on ? '.ex-return' : '[data-enter]').focus();
}
find('[data-enter]').onclick = ()=>viewing(true);
find('.ex-return').onclick = ()=>viewing(false);
find('[data-close]').onclick = ()=>hall.close();
hall.oncancel = event=>{
  if(hall.classList.contains('ex-viewing')) { event.preventDefault(); viewing(false); }
};
hall.onclose = ()=>{ hall.classList.remove('ex-viewing'); stage.replaceChildren(); };
