import {icon} from '../icons.js';
import {html, t} from '../i18n.js';
import {FIGURE_THEMES,resolveFigureTheme,themeColorParameter} from './schemes/figure-themes.js';

export const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[char]);

export function workspaceHTML(native) {
  const desktopOnly = native ? '' : 'disabled';
  return html`
    <div class="figura-layout">
      <aside class="figura-gallery" aria-label="绘图方案">
        <div class="figura-gallery-heading"><h3>绘图方案</h3><button type="button" class="icon-button" data-fig-action="schemes" aria-label="管理方案" title="管理方案">${icon('plus')}</button></div>
        <label class="figura-search">${icon('search')}<input data-fig="query" type="search" aria-label="搜索方案" placeholder="搜索方案"></label>
        <select data-fig="category" aria-label="方案分类"></select>
        <div data-fig="schemes" class="figura-schemes"></div>
      </aside>
      <section class="figura-main" aria-label="绘图工作区">
        <div class="figura-project-bar">
          <input data-fig="name" type="text" maxlength="250" placeholder="绘图项目名称" aria-label="绘图项目名称">
          <button type="button" class="outline-button" data-fig-action="projects">${icon('folder')}项目</button>
          <button type="button" class="outline-button" data-fig-action="quick-import">${icon('upload')}一键导入</button>
          <button type="button" class="primary" data-fig-action="save">保存项目</button>
          <span data-fig="save-status" class="figura-help" role="status"></span>
        </div>
        <div class="figura-toolbar">
          <div class="figura-mode" role="group" aria-label="绘图视图">
            <button type="button" data-fig-action="preview-tab" aria-pressed="true">预览</button>
            <button type="button" data-fig-action="data-tab" aria-pressed="false">数据</button>
          </div>
          <span class="figura-spacer"></span>
          <label class="figura-theme-select"><span>主题</span><select data-fig="theme" aria-label="绘图主题"><option value="">方案原色</option>${FIGURE_THEMES.map(({id,label})=>t(`<option value="${id}">${label}</option>`)).join('')}</select><span class="figura-theme-swatches" data-fig="theme-swatches" aria-hidden="true" hidden></span></label>
          <button type="button" class="outline-button" data-fig-action="parameters">${icon('sliders')}参数</button>
          <button type="button" class="outline-button" data-fig-action="montage">${icon('overview')}拼版</button>
          <button type="button" class="outline-button" data-fig-action="export">${icon('download')}导出</button>
        </div>
        <p class="figura-status" data-fig="notice" role="status"></p>
        <section data-fig="preview-page" class="figura-preview-page">
          <div class="figura-stage" data-fig="stage">
            <div class="figura-empty" data-fig="placeholder">${icon('chart')}<strong>选择一个绘图方案</strong><span>先看示例，再导入你的表格。</span></div>
            <img data-fig="image" alt="绘图预览" hidden>
          </div>
          <div class="figura-preview-footer">
            <span data-fig="plot-status" role="status"></span>
            <button type="button" class="text-button" data-fig-action="refresh">更新预览</button>
          </div>
        </section>
        <section data-fig="data-page" class="figura-data-page" hidden>
          <div class="figura-data-head">
            <button type="button" class="outline-button" data-fig-action="choose-data">${icon('upload')}导入表格</button>
            <input data-fig="file" type="file" accept=".csv,.tsv,.xlsx" hidden>
            <button type="button" class="text-button" data-fig-action="sample">载入示例</button>
            <button type="button" class="text-button" data-fig-action="style-sample" hidden>论文样式示例</button>
            <span data-fig="dataset" class="figura-help"></span>
          </div>
          <div data-fig="sheets" class="figura-data-head" hidden><label>工作表<select data-fig="sheet"></select></label><button type="button" class="outline-button" data-fig-action="apply-sheet">应用工作表</button></div>
          <p class="figura-status is-error" data-fig="data-error" role="status"></p>
          <p class="figura-help" data-fig="requirements"></p>
          <details class="figura-disclosure" open><summary>字段映射</summary><div data-fig="mapping" class="figura-fields"></div></details>
          <div class="figura-grid-actions">
            <button type="button" class="text-button" data-fig-action="add-row">＋ 行</button>
            <button type="button" class="text-button" data-fig-action="add-column">＋ 列</button>
            <button type="button" class="text-button" data-fig-action="undo-data" hidden>撤销表格更改</button>
            <span class="figura-spacer"></span>
            <button type="button" class="icon-button" data-fig-action="prev-page" aria-label="上一页">${icon('chevron-left')}</button>
            <span data-fig="range"></span>
            <button type="button" class="icon-button" data-fig-action="next-page" aria-label="下一页">${icon('chevron-right')}</button>
          </div>
          <div data-fig="table" class="figura-table" tabindex="0" aria-label="绘图数据表"></div>
        </section>
      </section>
    </div>
    <dialog class="filter-drawer figura-dialog" data-fig="parameters" aria-label="绘图参数">
      ${dialogHeading('绘图参数')}
      <p class="figura-help">尺寸以 px 表示，96 px 对应 1 英寸。</p>
      <p class="figura-help" data-fig="theme-note" hidden>主题生效时使用主题色组。选择「方案原色」可编辑原色参数。</p>
      <div class="figura-fields" data-fig="controls"></div>
      <div class="figura-dialog-footer"><button type="button" class="text-button" data-fig-action="reset-params">恢复默认参数</button><button type="button" class="primary" data-fig-action="done">完成</button></div>
    </dialog>
    <dialog class="modal figura-dialog" data-fig="projects" aria-label="绘图项目">
      ${dialogHeading('绘图项目')}
      <label class="figura-field">已保存项目<select data-fig="projects-list"></select></label>
      <div class="figura-dialog-footer">
        <button type="button" class="outline-button" data-fig-action="open-project">打开项目</button>
        <button type="button" class="outline-button" data-fig-action="save-copy">另存副本</button>
        <button type="button" class="text-button" data-fig-action="delete-project">删除项目…</button>
      </div>
      <div class="figura-dialog-footer">
        <button type="button" class="outline-button" data-fig-action="import-project">导入 Figura 项目／工作区</button>
        <input type="file" data-fig="project-file" accept=".json" hidden>
        <button type="button" class="text-button" data-fig-action="backup-project">备份当前项目</button>
        <button type="button" class="text-button" data-fig-action="backup-workspace">备份全部项目</button>
      </div>
      <p class="figura-help">备份保存数据和参数。自定义方案请另行保留方案文件夹。</p>
    </dialog>
    <dialog class="modal figura-dialog" data-fig="schemes-dialog" aria-label="管理方案">
      ${dialogHeading('管理方案')}
      <div class="figura-dialog-footer">
        <button type="button" class="primary" data-fig-action="install" ${desktopOnly}>${icon('plus')}安装方案文件夹</button>
        <button type="button" class="outline-button" data-fig-action="folder" ${desktopOnly}>打开自定义方案目录</button>
        <button type="button" class="text-button" data-fig-action="scan">重新扫描</button>
      </div>
      <p class="figura-help">选择包含 manifest.json、plot.js、example.csv 和封面的 Figura API 1 方案文件夹。仅安装你信任的方案。</p>
      <details class="figura-disclosure" data-fig="metadata-panel"><summary>当前方案资料</summary>
        <label class="figura-field">名称<input data-fig="scheme-name" maxlength="160"></label>
        <label class="figura-field">描述<textarea data-fig="description" maxlength="4000" rows="3"></textarea></label>
        <label class="figura-field">替换封面 PNG／JPEG<input data-fig="cover" type="file" accept="image/png,image/jpeg"></label>
        <div class="figura-dialog-footer"><button type="button" class="outline-button" data-fig-action="metadata">保存方案资料</button><button type="button" class="text-button" data-fig-action="reset-metadata">恢复原资料</button></div>
      </details>
    </dialog>
    <dialog class="modal figura-dialog" data-fig="markdown-import" aria-label="Markdown 一键导入">
      ${dialogHeading('Markdown 一键导入')}
      <p class="figura-help">填写图型或项目编号与数据表，导入后直接绘图。</p>
      <div class="figura-dialog-footer"><button type="button" class="primary" data-fig-action="choose-markdown">${icon('upload')}选择 Markdown 文件</button>
      <input type="file" data-fig="markdown-file" accept=".md,.markdown" hidden></div>
      <label class="figura-field">参考文档使用的图型或项目<select data-fig="markdown-template"></select></label>
      <div class="figura-dialog-footer"><button type="button" class="outline-button" data-fig-action="markdown-template">${icon('download')}下载参考文档</button></div>
    </dialog>
    <dialog class="modal figura-dialog" data-fig="export-dialog" aria-label="导出绘图">
      ${dialogHeading('导出绘图')}
      <p class="figura-help">SVG 和 PDF 为矢量。PNG 使用所选分辨率。</p>
      <label class="figura-field">PNG 分辨率<select data-fig="dpi"><option>300</option><option>600</option><option>150</option><option>96</option></select></label>
      <p class="figura-help" data-fig="export-size"></p>
      <div class="figura-dialog-footer">
        <button type="button" class="outline-button" data-fig-action="svg">SVG</button>
        <button type="button" class="outline-button" data-fig-action="pdf" ${desktopOnly}>PDF</button>
        <button type="button" class="primary" data-fig-action="png">PNG</button>
      </div>
    </dialog>
    <dialog class="modal figura-dialog" data-fig="confirm" aria-label="确认更改">
      ${dialogHeading('确认更改')}
      <p data-fig="confirm-text"></p>
      <div class="figura-dialog-footer"><button type="button" class="text-button" data-fig-action="done">取消</button><button type="button" class="outline-button" data-fig-action="confirm-save">保存并继续</button><button type="button" class="primary" data-fig-action="confirm">继续</button></div>
    </dialog>`;
}

function dialogHeading(title) {
  return html`<div class="figura-dialog-heading"><h2>${t(title)}</h2><button type="button" class="icon-button" data-fig-action="done" aria-label="关闭弹窗">${icon('close')}</button></div><p class="figura-status" data-fig-dialog-status role="status"></p>`;
}

export function parameterHTML(scheme, draft) {
  const themed = Boolean(resolveFigureTheme(draft.themeId));
  return scheme.parameters.map(({key, label, type, options, min, max}) => {
    const value = draft.params[key], id = escape(key);
    const disabled = themed && (type === 'color' && themeColorParameter(key) >= 0 || key === 'palette' && !scheme.user) ? 'disabled' : '';
    return `<label class="figura-field"><span>${escape(label)}</span>${type === 'select'
      ? `<select data-fig-param="${id}" ${disabled}>${options.map(option => `<option ${option === value ? 'selected' : ''}>${escape(option)}</option>`).join('')}</select>`
      : `<input data-fig-param="${id}" type="${type}" value="${escape(value)}" ${disabled} ${min == null ? '' : 'min="'+min+'"'} ${max == null ? '' : 'max="'+max+'"'} step="any" maxlength="5000">`}</label>`;
  }).join('');
}

export function mappingHTML(scheme, draft) {
  return scheme.fields.map(field => html`<label class="figura-field"><span>${escape(field.label)} ${field.required === false ? t('（可选）') : '*'}</span>
    <select data-fig-map="${escape(field.key)}"><option value="">请选择数据列</option>${draft.rows[0].map(header => `<option ${header === draft.mapping[field.key] && header ? 'selected' : ''} value="${escape(header)}">${escape(header)}</option>`).join('')}</select></label>`).join('');
}

export function tableHTML(rows, start, end) {
  const input = (row, column) => `<input type="text" maxlength="10000" data-fig-row="${row}" data-fig-column="${column}" aria-label="${escape(row ? `${row + 1} · ${column + 1}` : t('列名') + ' ' + (column + 1))}" value="${escape(rows[row][column])}">`;
  const remove = (type, index, label, disabled = false) => `<button type="button" class="text-button" data-fig-action="delete-${type}" data-index="${index}" aria-label="${escape(t(label))}" title="${escape(t(label))}" ${disabled ? 'disabled' : ''}>×</button>`;
  const headers = rows[0].map((_, column) => `<th scope="col">${input(0, column)}${remove('column', column, '删除列', rows[0].length === 1)}</th>`).join('');
  const body = rows.slice(start, end).map((row, index) => {
    const position = start + index;
    return `<tr><th scope="row">${position}${remove('row', position, '删除行')}</th>${row.map((_, column) => `<td>${input(position, column)}</td>`).join('')}</tr>`;
  }).join('');
  return `<table><thead><tr><th scope="col">#</th>${headers}</tr></thead><tbody>${body}</tbody></table>`;
}
