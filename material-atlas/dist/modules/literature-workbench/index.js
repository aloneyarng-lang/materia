const themeTokens = {
  ink:'ink', muted:'muted', line:'line', paper:'paper', pane:'panel', accent:'teal',
  surface:'surface', tint:'canvas', 'on-accent':'on-accent', sans:'sans', serif:'serif',
  'font-size':'font-size', 'line-height':'line-height', 'button-radius':'button-radius',
  'card-radius':'card-radius', 'menu-radius':'menu-radius', 'border-width':'border-width',
  'ui-font-scale':'ui-font-scale', 'font-weight':'font-weight', 'heading-weight':'heading-weight',
  'icon-stroke':'icon-stroke', 'icon-size':'icon-size',
};
const studioOrigin = 'materia-workbench://local';

export const literatureWorkbenchModule = {
  id: 'literature-workbench',
  label: '研读',
  title: '研读',
  icon: 'files',
  panelId: 'literature-workbench',
  navigation: 'ribbon',
  styles: [new URL('./workspace.css', import.meta.url).href],
  create({host, signal, setCount, on, getPapers, openAISettings, workbenchFilterResults, openWorkbenchFilters}) {
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'outline-button';
    retry.textContent = '重试';
    retry.hidden = true;
    host.append(status, retry);

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
        status.hidden = true;
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
