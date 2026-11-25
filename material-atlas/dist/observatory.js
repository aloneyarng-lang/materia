import {getLocale,html,t} from './i18n.js';
import {icon} from './icons.js';

export function observatorySettingsHTML(theme) {
  return html`
    <div class="settings-card">
      <div><strong>彩蛋主题</strong><p>切换研究工作区的首页布局。</p></div>
      <select id="easter-theme" aria-label="彩蛋主题">
        <option value="" ${theme !== 'observatory' ? 'selected' : ''}>经典布局</option>
        <option value="observatory" ${theme === 'observatory' ? 'selected' : ''}>星图大厅</option>
      </select>
    </div>`;
}

function shortcut(attributes, image, label) {
  return `<button type="button" ${attributes}>${icon(image)}<span>${t(label)}</span></button>`;
}

function libraryCount(filter, image, count, label) {
  return `<button type="button" data-lobby-nav="${filter}">${icon(image)}<span><strong>${count}</strong>${t(label)}</span></button>`;
}

export function createObservatory(shell) {
  const lobby=document.createElement('main');
  lobby.id='observatory';
  lobby.hidden=true;
  shell.before(lobby);

  const returnButton=document.createElement('button');
  returnButton.type='button';
  returnButton.className='ribbon-button';
  returnButton.dataset.action='open-observatory';
  returnButton.innerHTML=icon('home');
  const returnAnchor=shell.querySelector('.ribbon-spacer');
  let previousContent='';

  function sync({enabled,open,views,papers,showAgent,canStudy}) {
    if(enabled){
      if(!returnButton.isConnected)returnAnchor.after(returnButton);
      returnButton.title=t('星图大厅');
      returnButton.setAttribute('aria-label',returnButton.title);
    }else returnButton.remove();
    const visible=Boolean(enabled&&open);
    lobby.hidden=!visible;
    shell.hidden=visible;
    if(!visible)return;

    const favoriteCount=papers.filter(paper=>paper.favorite).length;
    const contentKey=JSON.stringify([getLocale(),views.map(view=>view.id),papers.length,favoriteCount,showAgent,canStudy]);
    if(contentKey===previousContent)return;
    previousContent=contentKey;
    const number=new Intl.NumberFormat(getLocale());
    const dockViews=views.filter(view=>view.navigation==='ribbon'&&view.ribbonGroup!=='bottom'&&view.id!=='notes');
    lobby.innerHTML=html`
      <header class="observatory-header">
        <h1 tabindex="-1"><img src="./favicon.svg" width="48" height="48" alt=""><span><small>MATERIA</small><b>星图大厅</b></span></h1>
        <nav class="observatory-tools" aria-label="常用操作">
          ${shortcut('data-action="observatory-search"','search','快速操作')}
          ${shortcut('data-action="settings"','settings','设置')}
        </nav>
      </header>
      <nav class="observatory-library" aria-label="文献库">
        <h2>文献库</h2>
        ${libraryCount('library','library',number.format(papers.length),'全部文献')}
        ${libraryCount('favorites','star',number.format(favoriteCount),'星标文献')}
        ${shortcut('data-lobby-nav="recent"','clock','最近添加')}
      </nav>
      <nav class="observatory-tools-rail" aria-label="研究工具">
        ${shortcut('data-action="import"','upload','导入文献')}
        ${showAgent ? shortcut('class="observatory-assistant" data-action="ai-agent"','assistant','AI 研究助手') : ''}
      </nav>
      <nav class="observatory-primary" aria-label="文献探索">
        ${views.some(view=>view.id==='notes') ? shortcut('class="observatory-wing observatory-wing-left" data-lobby-view="notes"','notebook','笔记') : ''}
        <div class="observatory-console">
          ${shortcut('data-lobby-view="graph"','orbit','星图')}
          ${shortcut('data-lobby-view="list"','list','文献')}
          <span class="observatory-crystal" aria-hidden="true"></span>
        </div>
        ${shortcut('class="observatory-wing observatory-wing-right" data-action="research-canvas"','network','研究画布')}
      </nav>
      <nav class="observatory-dock" aria-label="工作区">
        ${dockViews.map(view=>view.id==='research'&&canStudy
          ? shortcut('data-lobby-view="literature-workbench"','files','逐图研读')
          : shortcut('data-lobby-view="'+view.id+'"',view.icon,view.label)).join('')}
        ${shortcut('data-action="resume-workspace"','panel-left','返回工作区')}
      </nav>`;
  }

  return {
    sync,
    focus:()=>lobby.querySelector('h1')?.focus(),
    focusReturn:()=>(returnButton.isConnected?returnButton:shell.querySelector('[data-menu-toggle="workspace-menu"]'))?.focus()
  };
}
