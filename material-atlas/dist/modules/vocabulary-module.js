import { html, msg, t } from '../i18n.js';
import { createVocabularyView, vocabularyShell } from '../vocabulary-ui.js';
import { createOfflineDictionaryView, offlineDictionaryShell } from '../offline-dictionary-ui.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[ch]));

export const vocabularyModule = {
  id: 'vocabulary',
  label: '词典与生词本',
  title: '词典与生词本',
  icon: 'dictionary',
  panelId: 'vocabulary-workspace',
  navigation: 'ribbon',
  styles: [new URL('../vocabulary-page.css', import.meta.url).href],
  create(context) {
    const { host, on, setCount, saveText, toast, openStudySource } = context;
    let activeSection = 'library';
    let initialized = false;
    let vocabView = null;
    let offlineView = null;

    function syncCount(stats) {
      if (!stats) return;
      setCount(msg`${stats.total} 词条 · ${stats.due} 待复习`);
    }

    function mount() {
      if (initialized) return;
      initialized = true;
      host.innerHTML = html`
        <div class="vp-atelier">
          <header class="vp-header">
            <div class="vp-header-copy">
              <span class="vp-eyebrow">LEXICON STUDIO // 词典与生词本</span>
              <h1 class="vp-title">词典与生词工坊<span>.</span></h1>
              <p class="vp-subtitle">离线多语词典极速检索、SRS 间隔重复记忆与自定义学术术语词卡库。</p>
            </div>
            <div class="vp-top-tabs" role="tablist" aria-label="工作台视图">
              <button type="button" role="tab" data-vp-section="library" aria-selected="true">生词词库</button>
              <button type="button" role="tab" data-vp-section="practice" aria-selected="false">练习工坊</button>
              <button type="button" role="tab" data-vp-section="dictionary" aria-selected="false">离线词典</button>
            </div>
          </header>
          <section class="vp-vocab-host" data-vp-panel="vocab">
            ${vocabularyShell({ allowImport: true, fullPage: true })}
          </section>
          <section class="vp-dict-host" data-vp-panel="dictionary" hidden>
            ${offlineDictionaryShell({ fullPage: true })}
          </section>
        </div>
      `;

      const vocabRoot = host.querySelector('[data-vp-panel="vocab"]');
      const dictRoot = host.querySelector('[data-vp-panel="dictionary"]');

      vocabView = createVocabularyView(vocabRoot, {
        escape,
        saveText,
        fullPage: true,
        onStats: syncCount,
        openSource: async source => {
          try {
            if (openStudySource) await openStudySource(source);
          } catch (error) {
            toast(t(error.message, false), true);
          }
        },
      });

      offlineView = createOfflineDictionaryView(dictRoot, {
        escape,
        fullPage: true,
        getVocabularyTerms: () => vocabView?.getTermsSet() || new Set(),
        onVocabularyChanged: async () => {
          await vocabView?.refresh();
        },
      });

      on(host, 'click', event => {
        const tab = event.target.closest('[data-vp-section]');
        if (!tab) return;
        selectSection(tab.dataset.vpSection);
      });
    }

    function selectSection(next) {
      activeSection = next;
      host.querySelectorAll('[data-vp-section]').forEach(btn => {
        btn.setAttribute('aria-selected', String(btn.dataset.vpSection === next));
      });
      const showDict = next === 'dictionary';
      host.querySelector('[data-vp-panel="vocab"]').hidden = showDict;
      host.querySelector('[data-vp-panel="dictionary"]').hidden = !showDict;
      if (next === 'library') {
        vocabView?.switchMode('list');
      } else if (next === 'practice') {
        vocabView?.switchMode('review');
      } else if (next === 'dictionary') {
        void offlineView?.initialize();
        offlineView?.focus();
      }
    }

    async function render() {
      mount();
      await Promise.all([
        vocabView?.refresh(),
        activeSection === 'dictionary' ? offlineView?.initialize() : Promise.resolve(),
      ]);
      syncCount(vocabView?.getStats());
    }

    function reset() {
      vocabView?.dispose();
      offlineView?.dispose();
      vocabView = null;
      offlineView = null;
      initialized = false;
      activeSection = 'library';
      host.replaceChildren();
    }

    function dispose() {
      vocabView?.dispose();
      offlineView?.dispose();
    }

    return { render, reset, dispose };
  },
};
