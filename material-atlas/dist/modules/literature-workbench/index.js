const themeTokens = {
  ink:'ink', muted:'muted', line:'line', paper:'paper', pane:'panel', accent:'teal',
  surface:'surface', tint:'canvas', 'on-accent':'on-accent', sans:'sans', serif:'serif',
  'font-size':'font-size', 'line-height':'line-height', 'button-radius':'button-radius',
  'card-radius':'card-radius', 'menu-radius':'menu-radius', 'border-width':'border-width',
  'ui-font-scale':'ui-font-scale', 'font-weight':'font-weight', 'heading-weight':'heading-weight',
  'icon-stroke':'icon-stroke', 'icon-size':'icon-size',
};
const studioOrigin = 'materia-workbench://local';

const STUDIO_PROFILES = {
  'literature-workbench': {
    num: '01',
    kicker: 'FIGURE-BY-FIGURE STUDIO',
    title: '逐图研读工作台',
    desc: '按图逐页解析文献实验证据，自动构建研究速览、交互式结构导图，并支持就任意图表展开深度追问。',
    chips: ['逐图拆解', '交互导图', '报告追问', 'ZIP 导出'],
    art: `<svg viewBox="0 0 180 120" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
      <rect x="14" y="14" width="66" height="92" rx="8" opacity=".32"/>
      <line x1="25" y1="30" x2="68" y2="30" opacity=".6"/>
      <line x1="25" y1="42" x2="62" y2="42" opacity=".4"/>
      <rect x="25" y="54" width="44" height="36" rx="5" stroke-dasharray="4 3" opacity=".82"/>
      <rect x="92" y="14" width="74" height="58" rx="8" fill="currentColor" fill-opacity=".08"/>
      <path d="M104 58 L118 39 L132 50 L144 33 L156 58" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="92" y="80" width="74" height="26" rx="7" opacity=".5"/>
      <line x1="103" y1="93" x2="152" y2="93" stroke-linecap="round"/>
    </svg>`,
  },
  'takeaway-card': {
    num: '02',
    kicker: '30S BRIEFING CARD',
    title: '三十秒速记卡工坊',
    desc: '从每篇文献报告中提炼「核心痛点 / 关键手段 / 最硬核证据 / 一句话局限」，生成可复制 Markdown 与幻灯片矢量卡片。',
    chips: ['四维凝练', '本地记忆', 'Markdown 复制', 'SVG 卡片'],
    art: `<svg viewBox="0 0 180 120" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
      <rect x="16" y="16" width="68" height="40" rx="8" fill="currentColor" fill-opacity=".09"/>
      <rect x="96" y="16" width="68" height="40" rx="8" opacity=".5"/>
      <rect x="16" y="64" width="68" height="40" rx="8" opacity=".5"/>
      <rect x="96" y="64" width="68" height="40" rx="8" fill="currentColor" fill-opacity=".09"/>
      <circle cx="30" cy="30" r="3" fill="currentColor"/>
      <line x1="40" y1="30" x2="72" y2="30" stroke-linecap="round"/>
      <line x1="28" y1="44" x2="64" y2="44" stroke-linecap="round" opacity=".55"/>
      <line x1="108" y1="84" x2="150" y2="84" stroke-linecap="round" opacity=".82"/>
    </svg>`,
  },
  'paper-canvas': {
    num: '03',
    kicker: 'VISUAL MINDMAP BRIDGE',
    title: '文献研究画布工坊',
    desc: '调用已配置的 AI 服务一键提炼论文论证结构为严谨 mcanvas 思维导图，支持缩放漫游与双向同步至研究画布库。',
    chips: ['一键导图', '矢量拓扑', '双向持久化', '自由漫游'],
    art: `<svg viewBox="0 0 180 120" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
      <rect x="16" y="42" width="46" height="36" rx="18" fill="currentColor" fill-opacity=".1"/>
      <path d="M62 60 C84 60 84 28 106 28" opacity=".75"/>
      <path d="M62 60 C84 60 84 92 106 92" opacity=".75"/>
      <rect x="106" y="14" width="58" height="28" rx="8" opacity=".82"/>
      <rect x="106" y="48" width="58" height="24" rx="8" stroke-dasharray="4 3" opacity=".5"/>
      <rect x="106" y="78" width="58" height="28" rx="8" opacity=".82"/>
      <circle cx="39" cy="60" r="4" fill="currentColor"/>
    </svg>`,
  },
};

export const literatureWorkbenchModule = {
  id: 'literature-workbench',
  label: '研读',
  title: '研读',
  icon: 'files',
  panelId: 'literature-workbench',
  navigation: 'ribbon',
  styles: [new URL('./workspace.css', import.meta.url).href],
  create({host, signal, setCount, on, getPapers, openAISettings, workbenchFilterResults, openWorkbenchFilters}) {
    const profile = STUDIO_PROFILES[host.id] || STUDIO_PROFILES['literature-workbench'];
    const shell = document.createElement('div');
    shell.className = 'lw-studio-shell';
    const pdfCount = getPapers().filter(p => p.file || p.pdfPath).length;
    shell.innerHTML = `
      <article class="lw-studio-card">
        <div class="lw-studio-top">
          <span class="lw-studio-index">${profile.num}</span>
          <span class="lw-studio-kicker">${profile.kicker}</span>
          <span class="lw-studio-pill">${pdfCount} 篇本地 PDF</span>
        </div>
        <div class="lw-studio-body">
          <div class="lw-studio-copy">
            <h2>${profile.title}</h2>
            <p>${profile.desc}</p>
            <div class="lw-studio-chips">${profile.chips.map(c => `<span>${c}</span>`).join('')}</div>
          </div>
          <div class="lw-studio-art">${profile.art}</div>
        </div>
        <footer class="lw-studio-foot">
          <p class="lw-studio-status" role="status"></p>
          <button type="button" class="outline-button lw-studio-retry" hidden>重试</button>
        </footer>
      </article>
    `;
    const status = shell.querySelector('.lw-studio-status');
    const retry = shell.querySelector('.lw-studio-retry');
    host.append(shell);

    const desktop = globalThis.materiaDesktop;
    const root = document.documentElement;
    let starting;
    let frame;
    let papers = [];
    let librarySnapshot = '';
    let libraryVersion = 0;
    let ready = false;

    function send(message, transfer = []) {
      if (ready) frame.contentWindow.postMessage(message, studioOrigin, transfer);
    }
    function syncTheme() {
      if (!ready) return;
      const style = getComputedStyle(root);
      const tokens = Object.fromEntries(Object.entries(themeTokens)
        .map(([key, source]) => [key, style.getPropertyValue('--' + source).trim()]));
      send({type:'studio-theme', tokens, mode: root.dataset.themeMode});
    }
    function syncLibrary() {
      if (!ready) return;
      papers = getPapers().filter(paper => paper.file?.desktop).map(({id, title, filename, size, journal, year, authors, doi}) =>
        ({id, title, filename, size, journal, year, authors, doi}));
      const {ids, count} = workbenchFilterResults();
      const payload = {papers, matchingIds:count ? ids : null, filterCount:count};
      const snapshot = JSON.stringify(payload);
      if (snapshot === librarySnapshot) return;
      librarySnapshot = snapshot;
      send({type:'studio-library', ...payload, version:libraryVersion});
    }
    const observer = new MutationObserver(syncTheme);
    observer.observe(root, {attributes:true, attributeFilter:['style', 'data-theme-mode', 'data-theme-fonts']});
    on(window, 'materia-ai-service-changed', () => send({type:'studio-service-changed'}));
    on(window, 'message', async event => {
      if (event.origin !== studioOrigin || event.source !== frame?.contentWindow || !event.data) return;
      if (event.data.type === 'studio-open-settings') openAISettings();
      if (event.data.type === 'studio-open-paper-filters' && !host.hidden) {
        const dialog = openWorkbenchFilters();
        if (!dialog) return;
        send({type:'studio-paper-filters-state', open:true});
        on(dialog, 'close', () => {
          send({type:'studio-paper-filters-state', open:false, restoreFocus:!host.hidden});
        }, {once:true});
        return;
      }
      if (event.data.type === 'studio-ready') {
        ready = true;
        librarySnapshot = '';
        syncTheme();
        syncLibrary();
      }
      if (event.data.type !== 'studio-read-pdf' || event.data.version !== libraryVersion) return;
      const {id, request, version} = event.data;
      const paper = papers.find(item => item.id === id);
      if (!paper || !Number.isSafeInteger(request)) return;
      try {
        if (paper.size > 140 * 1024 * 1024) throw Error('PDF 超过 140 MB。');
        const bytes = await desktop.readPdf(id);
        if (version !== libraryVersion || signal.aborted) return;
        const data = Uint8Array.from(bytes);
        send({type:'studio-pdf', request, version, data}, [data.buffer]);
      } catch (error) {
        if (version === libraryVersion && !signal.aborted) {
          send({type:'studio-pdf', request, version, error:error.message});
        }
      }
    });

    async function load() {
      if (frame || starting) return;
      if (!desktop?.openLiteratureWorkbench) {
        status.textContent = '请在 Materia 桌面版打开研读。';
        return;
      }
      starting = true;
      retry.hidden = true;
      status.textContent = '正在打开研读…';
      try {
        const url = await desktop.openLiteratureWorkbench();
        if (signal.aborted) return;
        frame = document.createElement('iframe');
        frame.title = host.getAttribute('aria-label') || ({'takeaway-card':'速记卡','paper-canvas':'研究画布'}[host.id] || '逐图研读');
        frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-downloads');
        frame.src = host.id === 'literature-workbench' ? url : new URL('/' + host.id, url).href;
        host.append(frame);
        shell.hidden = true;
      } catch (error) {
        status.textContent = error.message;
        retry.hidden = false;
      } finally {
        starting = false;
      }
    }
    on(retry, 'click', load);
    return {
      render() { setCount(''); syncLibrary(); return load(); },
      reset() {
        libraryVersion++;
        librarySnapshot = '';
        papers = [];
        send({type:'studio-library', papers, matchingIds:null, filterCount:0, version:libraryVersion});
      },
      dispose() { libraryVersion++; ready = false; observer.disconnect(); },
    };
  },
};
