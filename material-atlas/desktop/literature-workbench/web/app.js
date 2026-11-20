"use strict";

import {renderMarkdown} from "./markdown.js";

const $ = (id) => document.getElementById(id);
const token = document.querySelector('meta[name="workbench"]').content;
const cache = new Map();
let documents = [];
let matchingPaperIds = null;
let libraryVersion;
let current;
let original;
let pendingDocument;
let paper;
let presets = [];
let editing;
let activePreset;
let revision = 0;
let cropRevision = 0;
post("/presets", {}).then((items) => setPresets(items)).catch((error) => {
  $("preset-error").textContent = error.message;
});

async function post(route, data, type = "json", signal) {
  const isFile = data instanceof File;
  const response = await fetch(route, {
    method:"POST",
    headers:{"X-Workbench":token,"Content-Type":isFile ? "application/pdf" : "application/json"},
    body:isFile ? data : JSON.stringify(data), signal
  });
  if (!response.ok) {
    const message = await response.json().catch(() => null);
    throw new Error(message?.error || "请求失败 (" + response.status + ")");
  }
  return type === "blob" ? response.blob() : response.json();
}

function element(tag, text, cls) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (cls) node.className = cls;
  return node;
}

const displayFonts = {
  deng:'DengXian, "Microsoft YaHei", sans-serif',
  yahei:'"Microsoft YaHei UI", "Microsoft YaHei", sans-serif',
  simsun:'SimSun, "Songti SC", serif',
  segoe:'"Segoe UI", "Microsoft YaHei UI", sans-serif',
  mono:'Consolas, "Microsoft YaHei UI", monospace',
};
const displayModules = {
  toolbar:"工具栏", library:"文献列表", overview:"研究速览", map:"交互式导图",
  caption:"图号与图注", analysis:"AI 图解", body:"正文结果", conversation:"报告追问",
};
const defaultDisplay = {font:"theme", sizes:{}};
let savedDisplay = defaultDisplay;
const displayInputs = new Map();
for (const [key, title] of Object.entries(displayModules)) {
  const row = element("label", title);
  const input = element("input");
  Object.assign(input, {type:"number", min:11, max:30, step:1, placeholder:"默认"});
  input.id = `display-size-${key}`;
  row.append(input);
  $("display-sizes").append(row);
  displayInputs.set(key, input);
}

function applyDisplay({font, sizes}) {
  const style = document.documentElement.style;
  if (Object.hasOwn(displayFonts, font)) style.setProperty("--reading-font", displayFonts[font]);
  else style.removeProperty("--reading-font");
  for (const key of displayInputs.keys()) {
    const property = `--reading-${key}-size`;
    if (sizes[key]) style.setProperty(property, `${sizes[key]}px`);
    else style.removeProperty(property);
  }
  schedulePaperTitles();
}

function fillDisplay({font, sizes}) {
  $("display-font").value = font;
  for (const [key, input] of displayInputs) input.value = sizes[key] ?? "";
}

function displayDraft() {
  const sizes = {};
  for (const [key, input] of displayInputs) {
    if (input.value && input.validity.valid) sizes[key] = input.valueAsNumber;
  }
  return {font:$("display-font").value, sizes};
}

post("/display-preferences", {}).then(settings => {
  savedDisplay = settings;
  applyDisplay(settings);
}).catch(error => {
  $("display-status").textContent = error.message;
}).finally(() => { $("display-settings").disabled = false; });

$("display-settings").onclick = () => {
  fillDisplay(savedDisplay);
  $("display-dialog").showModal();
};
$("display-form").oninput = () => applyDisplay(displayDraft());
$("reset-display").onclick = () => {
  fillDisplay(defaultDisplay);
  applyDisplay(defaultDisplay);
};
$("close-display").onclick = () => $("display-dialog").close();
$("display-dialog").onclose = () => applyDisplay(savedDisplay);
$("display-dialog").oncancel = event => {
  if ($("save-display").disabled) event.preventDefault();
};
$("display-form").onsubmit = async event => {
  event.preventDefault();
  if ($("save-display").disabled) return;
  const settings = displayDraft();
  $("save-display").disabled = $("close-display").disabled = true;
  $("display-status").textContent = "";
  try {
    savedDisplay = await post("/display-preferences", {settings});
    $("display-dialog").close();
  } catch (error) {
    $("display-status").textContent = error.message;
  } finally {
    $("save-display").disabled = $("close-display").disabled = false;
  }
};

function formatted(text, tag = "div") {
  const node = element(tag, "", "markdown");
  node.innerHTML = renderMarkdown(text);
  return node;
}

const refreshPath = "M20 7v5h-5M20 12a8 8 0 1 0-2 5";

function reportButton(label, icon, action, disabled = false) {
  const button = element("button", "", "report-action");
  button.type = "button";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.disabled = disabled;
  button.append(figureIcon(icon));
  button.onclick = action;
  return button;
}

function redrawReport(session) {
  if (current !== session) return;
  if (session.preset.mode === "text") drawText();
  else drawCards();
}

function editableContent(node, session, target, record, label, options = {}) {
  const report = session.report;
  if (!report || session.batch || session.running || session.refreshing) return node;
  node.classList.add("editable-content");
  node.tabIndex = 0;
  node.title = `点击${label}`;
  node.setAttribute("aria-label", label);
  let editor;
  let removeOutsideListener;
  let saving = false;

  function show() {
    removeOutsideListener?.();
    removeOutsideListener = null;
    editor = null;
    node.classList.remove("is-editing");
    const value = record[target.field];
    if (!value) node.replaceChildren(element("span", options.empty || "点击填写", "muted"));
    else if (options.plain) node.textContent = value;
    else node.innerHTML = renderMarkdown(value);
  }

  function open() {
    if (editor || session.report !== report || session.batch || session.running || session.refreshing) return;
    const previous = record[target.field] ?? "";
    const status = element("small", "", "inline-edit-status");
    status.setAttribute("role", "status");
    const input = element(options.plain ? "input" : "textarea");
    input.setAttribute("aria-label", label);
    input.value = previous;
    input.maxLength = target.field === "detail" ? 1200 : target.field === "question" ? 4000 : 60000;
    if (!options.plain) input.rows = Math.max(2, Math.min(10, Math.ceil(node.offsetHeight / 24)));
    editor = input;
    node.classList.add("is-editing");
    node.replaceChildren(input, status);
    input.focus({preventScroll:true});
    input.setSelectionRange(previous.length, previous.length);

    async function save() {
      if (editor !== input || saving) return;
      if (input.value.trim() === previous) {
        show();
        return;
      }
      saving = true;
      input.readOnly = true;
      status.textContent = "正在保存…";
      try {
        const figureAnswer = target.kind === "figure" && target.field === "answer";
        const prompt = figureAnswer ? figurePrompt(session) : undefined;
        const {value} = await post("/edit-report", {report:report.id, target, value:input.value, figurePrompt:prompt});
        record[target.field] = value;
        if (session.report === report && target.kind === "figure") session.pendingArchive = null;
        if (figureAnswer) Object.assign(record, {error:"", analysisFormat:1, analysisPrompt:prompt});
        show();
      } catch (error) {
        status.textContent = `${error.message} 可按 Ctrl+Enter 重试或 Esc 取消。`;
        if (!node.isConnected) {
          removeOutsideListener?.();
          if (current === session) $("status").textContent = error.message;
        }
      } finally {
        input.readOnly = false;
        saving = false;
      }
    }

    input.onblur = save;
    const outside = event => {
      if (!node.contains(event.target)) void save();
    };
    document.addEventListener("pointerdown", outside, true);
    removeOutsideListener = () => document.removeEventListener("pointerdown", outside, true);
    input.onkeydown = event => {
      if (event.isComposing || saving) return;
      if (event.key === "Escape") {
        event.preventDefault();
        show();
        node.focus({preventScroll:true});
      } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey || options.plain)) {
        event.preventDefault();
        void save();
      }
    };
  }

  node.addEventListener("click", event => {
    if (event.target.closest("a, button, input, textarea") || !window.getSelection()?.isCollapsed) return;
    open();
  });
  node.addEventListener("keydown", event => {
    if (event.target !== node || event.key !== "Enter") return;
    event.preventDefault();
    open();
  });
  show();
  return node;
}

function buttons() {
  const outline = current?.preset.mode === "outline";
  $("all").disabled = !current || current.batch || current.refreshing || current.loadingArchive || (!current.figures.length && !(outline && current.hasText));
  $("stop-generation").hidden = !current?.generation;
  $("stop-generation").disabled = Boolean(current?.generation?.stopping);
  $("all").textContent = current?.pendingArchive && !current.batch
    ? (outline ? "重试生成导图" : "重试保存") : current?.report ? "重新运行" : "▶ 运行";
  $("all").title = outline ? "生成论文导图" : "生成图解报告";

  $("crop").hidden = !canUseFigures(selectedPreset());
  $("crop").disabled = !current || Boolean(current.batch || current.refreshing || current.loadingArchive || current.pendingArchive);
  $("open-paper").disabled = !current;
  $("run-preset").disabled = current?.preset.mode !== "text" || !current.hasText || Boolean(current.running || current.loadingArchive);
  $("export-report").hidden = !current?.report;
  $("export-report").disabled = Boolean(current?.exporting);
  $("export-status").textContent = current?.exportStatus || "";
  drawConversation();
}

$("export-report").addEventListener("click", async () => {
  const session = current;
  const report = session?.report;
  if (!report || session.exporting) return;
  const title = String(session.document.title || session.document.filename || "研读报告")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 100).trim();
  session.exporting = true;
  session.exportStatus = "正在准备报告…";
  buttons();
  try {
    const archive = await post("/export-report", {report:report.id}, "blob");
    const url = URL.createObjectURL(archive);
    const link = element("a");
    link.href = url;
    link.download = `${title || "研读报告"}-${report.number || "报告"}.zip`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    session.exportStatus = "";
  } catch (error) {
    session.exportStatus = error.message;
  } finally {
    session.exporting = false;
    if (current === session) buttons();
  }
});

function selectedPreset() {
  return presets.find((preset) => preset.id === activePreset);
}

function canUseFigures(preset) {
  return preset?.mode === "figures" || (preset?.mode === "outline" && preset.includeFigures !== false);
}

function setPresets(items, selected = activePreset) {
  presets = items;
  activePreset = items.some(({id}) => id === selected) ? selected : items[0]?.id || "";
  $("operation").replaceChildren(...items.map(({name,id}) => Object.assign(element("option", name), {value:id})));
  $("operation").value = activePreset;
  $("operation").disabled = false;
  $("new-preset").disabled = false;
  showPreset();
}

function openPreset(preset) {
  editing = preset;
  $("preset-title").textContent = preset ? "编辑预设" : "新建预设";
  $("preset-name").value = preset?.name || "";
  $("preset-mode").value = !preset || (preset.mode === "outline" && canUseFigures(preset)) ? "outline-evidence" : preset.mode;
  $("preset-prompt").value = preset?.prompt || "";
  $("preset-figure-prompt").value = preset?.figurePrompt || "";
  showPresetFlow();
  $("preset-status").textContent = "";
  $("preset-dialog").showModal();
}

function showPresetFlow() {
  const flow = $("preset-mode").value;
  $("preset-flow").textContent = {
    "outline-evidence":"提取原图并逐图解读，再按原文章节生成速览和导图。",
    outline:"按原文章节生成速览和导图，适合只处理正文时使用。",
    figures:"提取原图，按每个子图一段生成图解报告。",
    text:"根据所选页码和指令，生成摘要、对比或信息提取等正文报告。",
  }[flow];
  $("preset-prompt-label").textContent = flow === "figures" ? "逐图解读指令" :
    flow === "text" ? "正文处理指令" : "速览和导图指令";
  $("preset-figure-options").hidden = flow !== "outline-evidence";
}

$("new-preset").onclick = () => openPreset(null);
$("preset-mode").onchange = showPresetFlow;
$("edit-preset").onclick = () => openPreset(selectedPreset());
$("close-preset").onclick = () => $("preset-dialog").close();
$("operation").onchange = () => {
  activePreset = $("operation").value;
  showPreset();
};
$("preset-form").onsubmit = async (event) => {
  event.preventDefault();
  $("save-preset").disabled = true;
  try {
    const flow = $("preset-mode").value;
    const payload = {id:editing?.id, name:$("preset-name").value,
      mode:flow === "outline-evidence" ? "outline" : flow, includeFigures:flow === "outline-evidence",
      prompt:$("preset-prompt").value, figurePrompt:$("preset-figure-prompt").value};
    const {presets:items, selectedId} = await post("/presets", payload);
    setPresets(items, selectedId);
    $("preset-dialog").close();
  } catch (error) {
    $("preset-status").textContent = error.message;
  } finally {
    $("save-preset").disabled = false;
  }
};

function showPreset() {
  const preset = selectedPreset();
  $("edit-preset").disabled = !preset;
  $("figure-actions").hidden = !preset || preset.mode === "text";
  $("text-actions").hidden = preset?.mode !== "text";
  $("empty-title").textContent = preset ? "选择一篇文献" : "选择处理方式";
  if (preset && pendingDocument) {
    const document = pendingDocument;
    pendingDocument = null;
    choose(document);
    return;
  }
  drawList();
  if (!paper || !preset) return;
  const key = JSON.stringify(preset);
  if (!paper.runs.has(key)) {
    paper.runs.set(key, {...paper, preset, first:1, last:paper.pages.length,
      figures:canUseFigures(preset) ? structuredClone(paper.figures) : []});
  }
  current = paper.runs.get(key);
  const text = preset.mode === "text";
  $("figure-result").hidden = text;
  $("outline").hidden = true;
  $("result-tabs").hidden = true;
  $("text-actions").hidden = $("text-result").hidden = !text;
  if (!text) {
    drawCards();
  } else {
    setPageRange(current);
    drawText();
  }
  void loadSavedReport(current);
}

function setPageRange(session) {
  $("first-page").max = $("last-page").max = session.pages.length;
  $("first-page").value = session.first;
  $("last-page").value = session.last;
}

function drawText() {
  const result = formatted(current.result?.answer);
  if (current.result) editableContent(result, current, {kind:"text", field:"answer"}, current.result, "编辑正文结果");
  $("text-result").replaceChildren(result);
  $("status").textContent = current.running ? "正在运行预设…" : current.error ||
    (current.result ? `PDF 第 ${current.result.first}–${current.result.last} 页 · 已保存到 AI 工作室库` :
      current.hasText ? "" : "此 PDF 没有可提取的文字。");
  buttons();
}

$("text-actions").onsubmit = async (event) => {
  event.preventDefault();
  const session = current;
  if (session?.preset.mode !== "text" || session.running) return;
  const first = Number($("first-page").value);
  const last = Number($("last-page").value);
  session.first = first;
  session.last = last;
  session.running = true;
  session.error = "";
  drawText();
  try {
    await checkService();
    const {answer, report, model} = await post("/process", {id:session.id, first, last, prompt:session.preset.prompt, ...reportDetails(session)});
    session.report = report;
    session.turns = [];
    session.askError = "";
    session.result = {answer, first, last, model};
  } catch (error) {
    session.error = error.message;
  } finally {
    session.running = false;
    if (current === session) drawText();
  }
};

const titleMeasure = document.createElement("canvas").getContext("2d");
const titleGraphemes = new Intl.Segmenter(undefined, {granularity:"grapheme"});
const paperTitleCache = new Map();
let paperTitleMetrics = "";
let titleFrame;
let paperTooltipTimer;

function titleLines(title, width) {
  const measure = text => titleMeasure.measureText(text).width;
  if (measure(title) <= width) return [title];
  const units = Array.from(titleGraphemes.segment(title), part => part.segment);
  function fit(fromEnd, prefix = "") {
    let low = 0;
    let high = units.length;
    const take = count => (fromEnd ? units.slice(units.length-count) : units.slice(0,count)).join("");
    while (low < high) {
      const middle = Math.ceil((low+high)/2);
      if (measure(prefix + take(middle)) <= width) low = middle;
      else high = middle-1;
    }
    let line = take(low);
    const boundary = fromEnd ? line.indexOf(" ") : line.lastIndexOf(" ");
    const middleOfWord = fromEnd
      ? /[\p{L}\d]/u.test(units[units.length-low-1] || "") && /^[\p{Script=Latin}\d]/u.test(line)
      : /[\p{Script=Latin}\d]$/u.test(line) && /[\p{Script=Latin}\d]/u.test(units[low] || "");
    if (middleOfWord && boundary >= 0) {
      const wholeWords = fromEnd ? line.slice(boundary+1) : line.slice(0,boundary);
      if (measure(wholeWords) >= width*.72) line = wholeWords;
    }
    return line.trim();
  }
  const first = fit(false);
  const rest = title.slice(first.length).trim();
  return [first, measure(rest) <= width ? rest : "… " + fit(true, "… ")];
}

function schedulePaperTitles() {
  if (titleFrame !== undefined) return;
  titleFrame = requestAnimationFrame(() => {
    titleFrame = undefined;
    const titles = $("papers").querySelectorAll(".paper-title");
    if (!titles.length) return;
    const sample = titles[0];
    const {fontStyle, fontWeight, fontSize, fontFamily} = getComputedStyle(sample);
    const font = `${fontStyle} ${fontWeight} ${fontSize} ${fontFamily}`;
    const width = sample.clientWidth - 1;
    if (width <= 0) return;
    const metrics = `${width}:${font}`;
    if (metrics !== paperTitleMetrics) {
      paperTitleMetrics = metrics;
      paperTitleCache.clear();
    }
    titleMeasure.font = font;
    for (const node of titles) {
      if (node.dataset.metrics === metrics) continue;
      const title = node.dataset.title;
      if (!paperTitleCache.has(title)) paperTitleCache.set(title, titleLines(title, width));
      const lines = paperTitleCache.get(title);
      node.replaceChildren(...lines.map(line => element("span", line)));
      node.dataset.metrics = metrics;
      node.dataset.shortened = String(lines[1]?.startsWith("… ") ?? false);
    }
  });
}

function showPaperTooltip(button, title, metadata) {
  const tooltip = $("paper-tooltip");
  tooltip.replaceChildren(element("strong", title));
  if (metadata) tooltip.append(element("small", metadata));
  tooltip.hidden = false;
  const rect = button.getBoundingClientRect();
  const left = Math.min(rect.right+8, innerWidth-tooltip.offsetWidth-8);
  const top = Math.min(rect.top, innerHeight-tooltip.offsetHeight-8);
  tooltip.style.left = `${Math.max(8,left)}px`;
  tooltip.style.top = `${Math.max(8,top)}px`;
}

function hidePaperTooltip() {
  clearTimeout(paperTooltipTimer);
  $("paper-tooltip").hidden = true;
}

new ResizeObserver(() => {
  hidePaperTooltip();
  schedulePaperTitles();
}).observe($("papers"));
$("papers").addEventListener("scroll", hidePaperTooltip, {passive:true});
window.addEventListener("scroll", hidePaperTooltip, {passive:true});
document.fonts.addEventListener("loadingdone", () => {
  paperTitleCache.clear();
  for (const node of $("papers").querySelectorAll(".paper-title")) delete node.dataset.metrics;
  schedulePaperTitles();
});

function drawList() {
  const query = $("query").value.trim().toLowerCase();
  const selected = (pendingDocument || original)?.id;
  const visible = documents.filter(({id, title, filename, authors, doi}) =>
    (!matchingPaperIds || matchingPaperIds.has(id)) &&
    [title, filename, authors, doi].some(value => String(value || "").toLowerCase().includes(query)));
  $("paper-count").textContent = [selected ? "已选 1 篇" : "", `${visible.length} 篇`].filter(Boolean).join(" · ");
  $("paper-filter-empty").hidden = !documents.length || !!visible.length;
  hidePaperTooltip();
  $("papers").replaceChildren(...visible.map((document) => {
    const button = element("button", "", "paper");
    const title = (document.title || document.filename || "未命名文献").replace(/\s+/g, " ").trim();
    const heading = element("strong", "", "paper-title");
    heading.dataset.title = title;
    heading.append(element("span", title));
    button.append(heading);
    const firstAuthor = document.authors?.split(/[,，;；]/,1)[0]?.trim();
    const metadata = [document.year, firstAuthor, document.journal].filter(Boolean).join(" · ");
    if (metadata) button.append(element("small", metadata));
    button.setAttribute("aria-label", [title, metadata].filter(Boolean).join("，"));
    const fullMetadata = [document.year, document.journal, document.authors].filter(Boolean).join(" · ");
    const help = () => {
      const detail = button.querySelector("small");
      if (heading.dataset.shortened === "true" || (detail && detail.scrollWidth > detail.clientWidth)) {
        showPaperTooltip(button, title, fullMetadata);
      }
    };
    button.addEventListener("pointerenter", event => {
      if (event.pointerType !== "touch") paperTooltipTimer = setTimeout(help, 260);
    });
    button.addEventListener("pointerleave", hidePaperTooltip);
    button.addEventListener("focus", help);
    button.addEventListener("blur", hidePaperTooltip);
    button.setAttribute("aria-current", String(document.id === selected));
    button.onclick = event => {
      choose(document);
      if (event.detail === 0) $("papers").querySelector('[aria-current="true"]')?.focus({preventScroll:true});
    };
    return button;
  }));
  schedulePaperTitles();
}

function preview(session, figure) {
  if (!figure.preview) {
    figure.preview = post("/render", {id:session.id, figure:descriptor(figure), detail:true}, "blob")
      .then((image) => URL.createObjectURL(image))
      .catch((error) => { figure.preview = null; throw error; });
  }
  return figure.preview;
}

function descriptor({label,page,box,caption,archivedImage}) {
  return {label,page,box,caption,archivedImage};
}

function choose(document) {
  if (!selectedPreset()) {
    pendingDocument = document;
    $("empty-title").textContent = "为所选文献选择处理方式";
    $("operation").focus();
    drawList();
    return;
  }
  const version = ++revision;
  current = paper = null;
  original = document;
  $("paper-title").textContent = document.title || document.filename;
  $("paper-header").hidden = false;
  $("empty").hidden = true;
  $("work").hidden = false;
  $("cards").replaceChildren();
  $("figure-result").hidden = true;
  $("outline").hidden = true;
  $("result-tabs").hidden = true;
  $("text-result").textContent = "";
  $("status").textContent = "正在读取文献…";
  buttons();
  drawList();
  const existing = cache.get(document.id);
  if (existing) {
    paper = existing;
    showPreset();
  } else {
    parent.postMessage({type:"studio-read-pdf", id:document.id, request:version, version:libraryVersion}, "*");
  }
}

async function receivePdf({data, error, request}) {
  if (request !== revision || !original) return;
  const document = original;
  try {
    if (error) throw new Error(error);
    const result = await post("/extract", new File([data], document.filename || "document.pdf", {type:"application/pdf"}));
    if (revision !== request) return;
    paper = {...result, document, runs:new Map()};
    cache.set(document.id, paper);
    showPreset();
  } catch (error) {
    if (revision === request) $("status").textContent = error.message;
  }
}

function reportDetails(session) {
  return {title:session.document.title || session.document.filename, preset:session.preset.name,
    presetId:session.preset.id, presetNumber:session.preset.number, includeFigures:canUseFigures(session.preset)};
}

function figurePrompt(session) {
  return session.preset.mode === "outline" ? session.preset.figurePrompt || session.preset.prompt : session.preset.prompt;
}

async function loadSavedReport(session) {
  if (session.archiveRead) return;
  session.archiveRead = true;
  session.loadingArchive = true;
  buttons();
  try {
    const saved = await post("/saved-report", {id:session.id, ...reportDetails(session), mode:session.preset.mode});
    if (!saved) return;
    session.outline = saved.outline;
    session.figures = saved.figures;
    session.result = saved.result;
    if (saved.result) ({first:session.first, last:session.last} = saved.result);
    session.report = saved.report;
    session.turns = saved.turns;
  } catch (error) {
    session.error = error.message;
  } finally {
    session.loadingArchive = false;
    if (current === session) {
      if (session.preset.mode === "text") {
        setPageRange(session);
        drawText();
      } else drawCards();
    }
  }
}

async function checkService(vision = false, signal) {
  const response = await fetch(vision ? "/service?vision=1" : "/service", {signal});
  if (!response.ok) throw Error((await response.json()).error);
}

let serviceRevision = 0;
async function refreshService() {
  const version = ++serviceRevision;
  const badge = $("service-badge");
  const writeService = (state, label, model, description) => {
    badge.dataset.state = state;
    badge.lastElementChild.textContent = label;
    $("model-label").textContent = model;
    $("model-label").title = model;
    $("model-description").textContent = description;
  };
  try {
    const response = await fetch("/service", {cache:"no-store"});
    const service = await response.json();
    if (version !== serviceRevision) return;
    if (!response.ok) {
      writeService("idle", "服务未就绪", "未配置", service.error);
      return;
    }
    writeService("ready", "服务已配置", service.model, `${service.service} · ${service.model}`);
  } catch {
    if (version === serviceRevision) writeService("idle", "服务状态不可用", "未知", "请打开 AI 设置查看。");
  }
}

function drawCards() {
  const session = current;
  drawOutline(session);
  $("status").textContent = session.batch ? (session.preset.mode === "outline" ? "正在生成论文导图…" : "正在生成图解报告…") : session.error ||
    (session.figures.length || session.report ? ""
      : session.preset.mode === "outline" && session.hasText
        ? "未找到编号图，导图将根据正文生成。"
        : "未找到带编号图注的图，可从原文补录。");
  drawFigure(session);
  buttons();
}

function drawFigure(session) {
  const count = session.figures.length;
  const index = visibleFigureIndex(session);
  const figure = session.figures[index];
  $("figure-result-title").textContent = session.preset.mode === "outline" && session.outline ? "逐图证据" : "图解报告";
  $("figure-count").textContent = figure ? `（共识别 ${count} 幅图，当前为 ${figure.label}）` : "";
  $("figure-position").textContent = count ? `图 ${index + 1} / ${count}` : "";
  $("prev-figure").disabled = index === 0;
  $("next-figure").disabled = index >= count - 1;
  $("cards").replaceChildren();
  if (!figure) return;
  const card = element("article", "", "card");
  card.id = `studio-figure-${index+1}`;
  card.tabIndex = -1;
  const left = element("figure", "", "report-figure");
  const image = element("img");
  image.alt = `${figure.label}，PDF 第 ${figure.page} 页`;
  image.draggable = false;
  const imageStatus = element("small", "", "muted");
  imageStatus.setAttribute("role", "status");
  left.append(zoomableImage(image), imageStatus);
  const details = element("div", "", "figure-details");
  const name = element("h3", figure.label, "figure-name");
  name.title = `PDF 第 ${figure.page} 页`;
  left.append(name);
  if (figure.caption || session.report) {
    const caption = element("figcaption", "", "figure-caption");
    const original = formatted(figure.caption);
    original.classList.add("caption");
    const bar = element("div", "", "report-actions");
    bar.append(figureSectionTitle("图注（原文）", "M7 3h7l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm7 0v5h4M8 12h7m-7 4h7"));
    editableContent(original, session, {kind:"figure", field:"caption", index}, figure, "编辑本图图注");
    caption.append(bar, original);
    left.append(caption);
  }
  const analysis = element("section", "", "figure-analysis");
  const title = figureSectionTitle("AI 解读", "M12 3c1.3 5.1 3.9 7.7 9 9-5.1 1.3-7.7 3.9-9 9-1.3-5.1-3.9-7.7-9-9 5.1-1.3 7.7-3.9 9-9Z");
  title.id = "figure-analysis-title";
  const body = element("div", "", "analysis-scroll");
  body.tabIndex = 0;
  body.setAttribute("role", "region");
  body.setAttribute("aria-labelledby", title.id);
  const empty = figure.error || (session.batch ? "等待解读…" : "运行预设后，解读将显示在这里。");
  const answer = figure.answer ? formatted(figure.answer) : element("div", empty, "markdown");
  body.append(editableContent(answer, session, {kind:"figure", field:"answer", index}, figure, "编辑本图解读", {empty}));
  const bar = element("div", "", "report-actions");
  bar.append(title);
  if (session.report && !session.batch) {
    bar.append(reportButton("重新生成本图解读", refreshPath, () => refreshFigure(session, figure, index), Boolean(session.refreshing)));
  }
  if (session.refreshing === figure) bar.append(element("small", "重新生成中…", "muted"));
  analysis.append(bar, body);
  details.append(analysis);
  card.append(left, details);
  preview(session, figure).then((url) => { image.src = url; }).catch((error) => {
    image.hidden = true;
    imageStatus.textContent = error.message;
  });
  $("cards").append(card);
}

function figureSectionTitle(text, iconPath) {
  const heading = element("h4");
  heading.append(figureIcon(iconPath), document.createTextNode(text));
  return heading;
}

function figureIcon(iconPath) {
  const ns = "http://www.w3.org/2000/svg";
  const icon = document.createElementNS(ns, "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", iconPath);
  icon.append(path);
  return icon;
}

async function refreshFigure(session, figure, index) {
  if (!session.report || session.batch || session.refreshing) return;
  session.refreshing = figure;
  session.error = "";
  redrawReport(session);
  try {
    const prompt = figurePrompt(session);
    const {answer} = await post("/interpret", {id:session.id, figure:descriptor(figure), prompt});
    const {value} = await post("/edit-report", {report:session.report.id, target:{kind:"figure", field:"answer", index},
      value:answer, figurePrompt:prompt});
    figure.answer = value;
    figure.error = "";
    figure.analysisFormat = 1;
    figure.analysisPrompt = prompt;
    session.pendingArchive = null;
  } catch (error) {
    session.error = error.message;
  } finally {
    session.refreshing = null;
    redrawReport(session);
  }
}

function zoomableImage(image) {
  const viewer = element("div", "", "figure-viewer");
  const viewport = element("div", "", "figure-viewport");
  viewport.title = "滚轮缩放 · 放大后按住右键拖动";
  const toolbar = element("div", "", "zoom-toolbar");
  const percent = element("span", "100%", "muted");
  let scale = 1;
  let x = 0;
  let y = 0;
  let drag;
  const clamp = (value, bound) => Math.max(-bound, Math.min(bound, value));

  function update() {
    x = clamp(x, Math.max(0, (image.offsetWidth * scale - viewport.clientWidth) / 2));
    y = clamp(y, Math.max(0, (image.offsetHeight * scale - viewport.clientHeight) / 2));
    image.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${scale})`;
    viewport.dataset.zoomed = String(scale > 1);
    percent.textContent = `${Math.round(scale * 100)}%`;
  }

  function zoom(next, anchorX = 0, anchorY = 0) {
    next = Math.min(6, Math.max(1, next));
    const ratio = next / scale;
    x = anchorX - (anchorX - x) * ratio;
    y = anchorY - (anchorY - y) * ratio;
    scale = next;
    update();
  }

  function control(text, label, action) {
    const button = element("button", text);
    button.type = "button";
    button.setAttribute("aria-label", label);
    button.onclick = action;
    return button;
  }
  toolbar.append(control("−", "缩小图片", () => zoom(scale / 1.25)), percent,
    control("+", "放大图片", () => zoom(scale * 1.25)),
    control("复位", "恢复原图大小", () => zoom(1)));
  viewport.append(image);
  viewer.append(viewport, toolbar);
  image.addEventListener("load", update, {once:true});
  viewport.addEventListener("wheel", event => {
    if (!image.naturalWidth || !event.deltaY || (scale === 1 && event.deltaY > 0)) return;
    event.preventDefault();
    const rect = viewport.getBoundingClientRect();
    zoom(scale * (event.deltaY < 0 ? 1.2 : 1 / 1.2),
      event.clientX - rect.left - rect.width / 2,
      event.clientY - rect.top - rect.height / 2);
  }, {passive:false});
  viewport.oncontextmenu = event => event.preventDefault();
  viewport.onpointerdown = event => {
    if (event.button !== 2 || scale <= 1) return;
    viewport.setPointerCapture(event.pointerId);
    drag = {pointer:event.pointerId, x:event.clientX - x, y:event.clientY - y};
    viewport.classList.add("dragging");
  };
  viewport.onpointermove = event => {
    if (drag?.pointer !== event.pointerId) return;
    x = event.clientX - drag.x;
    y = event.clientY - drag.y;
    update();
  };
  viewport.onlostpointercapture = () => {
    drag = null;
    viewport.classList.remove("dragging");
  };
  return viewer;
}

$("prev-figure").onclick = () => moveFigure(-1);
$("next-figure").onclick = () => moveFigure(1);
function visibleFigureIndex(session) {
  return Math.max(0, Math.min(session.figureIndex || 0, session.figures.length - 1));
}

function moveFigure(delta) {
  if (!current) return;
  current.figureIndex = Math.max(0, Math.min((current.figureIndex || 0) + delta, current.figures.length - 1));
  drawFigure(current);
  updateQuestionInput(current);
}

function drawOutline(session) {
  const outline = session.preset.mode === "outline" ? session.outline : null;
  $("outline").hidden = !outline;
  $("result-tabs").hidden = !outline;
  const view = session.outlineView || "overview";
  $("figure-result").hidden = !session.figures.length || Boolean(outline && view !== "evidence");
  if (!outline) return;
  for (const button of $("result-tabs").querySelectorAll("[data-outline-view]")) {
    button.setAttribute("aria-pressed", String(view === button.dataset.outlineView));
    button.disabled = button.dataset.outlineView === "evidence" && !session.figures.length;
  }
  const content = $("outline-content");
  content.replaceChildren();
  if (view === "evidence") return;
  const summary = formatted(outline.summary);
  summary.classList.add("outline-summary");
  if (view === "overview") {
    editableContent(summary, session, {kind:"summary", field:"summary"}, outline, "编辑研究速览");
    if (outline.summary || session.report) content.append(summary);
    if (outline.sections) {
      if (outline.source === "pages") content.append(element("p", "未识别到小标题，按原文页码分段。", "outline-structure-note muted"));
      const list = element("div", "", "paper-outline");
      const startLevel = Math.min(...outline.sections.map(section => section.level));
      for (const section of outline.sections) {
        const node = outlineDetail(session, section);
        node.style.setProperty("--section-depth", Math.min(4, section.level - startLevel));
        list.append(node);
      }
      content.append(list);
      return;
    }
    content.append(element("p", "这是旧版速览。点击「重新运行」可按原文目录重新拆解。", "outline-structure-note muted"));
    const list = element("div", "", "outline-overview");
    for (const branch of outline.branches) {
      const group = element("section");
      group.append(editableContent(element("h2", branch.title), session,
        {kind:"section", field:"title", branch:outline.branches.indexOf(branch)}, branch, "编辑分支标题", {plain:true}));
      for (const node of branch.nodes) group.append(outlineDetail(session, node));
      list.append(group);
    }
    content.append(list);
    return;
  }
  content.append(outlineNavigator(session, outline));
}

function sectionTree(outline) {
  if (!outline.sections) {
    return outline.branches.map(branch => ({
      title:branch.title, children:branch.nodes.map(node => ({title:node.title, node, children:[]})),
    }));
  }
  const branches = [];
  const parents = [];
  for (const section of outline.sections) {
    while (parents.length && parents.at(-1).node.level >= section.level) parents.pop();
    const item = {title:section.title, node:section, children:[]};
    (parents.at(-1)?.children || branches).push(item);
    parents.push(item);
  }
  return branches;
}

function outlineNavigator(session, outline) {
  const tree = sectionTree(outline);
  const map = element("div", "", "outline-navigator");
  const columns = element("nav", "", "outline-columns");
  columns.setAttribute("aria-label", "论文章节");
  const detail = element("section", "", "outline-map-detail");
  detail.setAttribute("aria-label", "章节详情");
  map.append(columns, detail);
  session.outlinePath ||= [0];

  function select(depth, index) {
    session.outlinePath = [...session.outlinePath.slice(0, depth), index];
    draw(depth);
  }

  function draw(focusDepth) {
    const scrolls = new Map(Array.from(columns.children, column =>
      [column.dataset.path, column.querySelector(".outline-column-list").scrollTop]));
    let items = tree;
    let active;
    let path = "";
    const visible = [];
    for (let depth = 0; items.length; depth++) {
      const index = session.outlinePath[depth];
      const selected = items[index];
      const siblings = items;
      const column = element("section", "", "outline-column");
      column.dataset.path = path;
      column.append(element("h3", active ? "下级小节" : "原文章节"));
      const list = element("div", "", "outline-column-list");
      siblings.forEach((item, row) => {
        const button = element("button", "", "outline-node");
        button.type = "button";
        button.setAttribute("aria-pressed", String(row === index));
        const title = element("span", item.title);
        button.append(title);
        if (item.children.length) {
          const arrow = element("span", "›", "outline-node-arrow");
          arrow.setAttribute("aria-hidden", "true");
          button.append(arrow);
        }
        button.onclick = () => select(depth, row);
        button.onkeydown = event => {
          let target = row;
          switch (event.key) {
            case "ArrowUp": target = Math.max(0, row-1); break;
            case "ArrowDown": target = Math.min(siblings.length-1, row+1); break;
            case "Home": target = 0; break;
            case "End": target = siblings.length-1; break;
            case "ArrowLeft":
              if (depth) select(depth-1, session.outlinePath[depth-1]);
              event.preventDefault();
              return;
            case "ArrowRight":
              if (item.children.length) {
                session.outlinePath = [...session.outlinePath.slice(0, depth), row, 0];
                draw(depth+1);
              }
              event.preventDefault();
              return;
            default: return;
          }
          event.preventDefault();
          select(depth, target);
        };
        list.append(button);
      });
      column.append(list);
      visible.push(column);
      if (!selected) break;
      active = selected;
      items = selected.children;
      path += "/" + index;
    }
    columns.replaceChildren(...visible);
    for (const column of visible) {
      column.querySelector(".outline-column-list").scrollTop = scrolls.get(column.dataset.path) || 0;
    }
    const node = active?.node;
    detail.replaceChildren(node ? outlineDetail(session, node) : element("p", "选择一个要点查看证据。", "muted"));
    detail.scrollTop = 0;
    if (focusDepth !== undefined) {
      const column = visible[focusDepth];
      const button = column?.querySelector('[aria-pressed="true"]');
      button?.focus({preventScroll:true});
      button?.scrollIntoView({block:"nearest", inline:"nearest", container:"nearest"});
      const last = visible.at(-1);
      const viewport = columns.getBoundingClientRect();
      const overflow = last.getBoundingClientRect().right - viewport.right;
      if (overflow > 0) columns.scrollLeft += overflow;
      if (column) {
        const left = column.getBoundingClientRect().left - viewport.left;
        if (left < 0) columns.scrollLeft += left;
      }
    }
  }
  draw();
  return map;
}

function outlineDetail(session, node) {
  const view = element("article", "", "outline-detail");
  const heading = element("h3", node.title);
  const detail = formatted(node.detail);
  const outline = session.outline;
  if (session.report && outline) {
    const branch = outline.branches?.findIndex(group => group.nodes.includes(node));
    const index = outline.sections?.indexOf(node) ?? outline.branches?.[branch]?.nodes.indexOf(node);
    if (index >= 0) {
      if (branch >= 0) editableContent(heading, session, {kind:"section", field:"title", branch, index}, node, "编辑要点标题", {plain:true});
      editableContent(detail, session, {kind:"section", field:"detail", branch, index}, node, "编辑章节解读");
    }
  }
  view.append(heading, detail);
  const sources = element("div", "", "actions outline-sources");
  const previewArea = element("div", "", "outline-figure-preview");
  previewArea.hidden = true;
  let selectedImage;
  for (const index of node.figures) {
    const figure = session.figures[index-1];
    const button = element("button", figure.label);
    button.type = "button";
    button.setAttribute("aria-expanded", "false");
    button.onclick = () => {
      const same = selectedImage === index;
      sources.querySelector('[aria-expanded="true"]')?.setAttribute("aria-expanded", "false");
      selectedImage = same ? null : index;
      previewArea.hidden = same;
      previewArea.replaceChildren();
      if (same) return;
      button.setAttribute("aria-expanded", "true");
      const image = element("img");
      image.alt = `${figure.label}，PDF 第 ${figure.page} 页`;
      image.draggable = false;
      const status = element("p", "正在读取原图…", "muted");
      status.setAttribute("role", "status");
      previewArea.append(status, zoomableImage(image));
      previewArea.scrollIntoView({block:"nearest", container:"nearest"});
      preview(session, figure).then(url => { image.src = url; status.hidden = true; }).catch(error => {
        status.textContent = error.message;
        image.parentElement.hidden = true;
      });
    };
    sources.append(button);
  }
  if (node.first) {
    const range = node.first === node.last ? node.first : `${node.first}–${node.last}`;
    sources.append(element("small", `PDF 第 ${range} 页`, "muted"));
  } else if (node.pages.length) {
    sources.append(element("small", "PDF 第 " + node.pages.join("、") + " 页", "muted"));
  }
  if (sources.childNodes.length) view.append(sources, previewArea);
  return view;
}

$("result-tabs").onclick = event => {
  const button = event.target.closest("[data-outline-view]");
  if (!button || !current?.outline) return;
  current.outlineView = button.dataset.outlineView;
  drawOutline(current);
  updateQuestionInput(current);
};

$("stop-generation").onclick = async () => {
  const generation = current?.generation;
  if (!generation || generation.stopping) return;
  generation.stopping = true;
  $("stop-generation").disabled = true;
  try {
    await post("/cancel", {operation:generation.operation}, "json", AbortSignal.timeout(4000));
  } catch (error) {
    generation.cancelError = error.message;
  } finally {
    generation.controller.abort();
  }
};

$("all").onclick = async () => {
  const session = current;
  const outline = session?.preset.mode === "outline";
  if (!session || session.batch || session.refreshing || (!session.figures.length && !(outline && session.hasText))) return;
  session.batch = true;
  session.error = "";
  const generation = {operation:crypto.randomUUID(), controller:new AbortController()};
  const {operation, controller:{signal}} = generation;
  session.generation = generation;
  const generate = (route, fields) => post(route, {...fields, operation}, "json", signal);
  const prompt = figurePrompt(session);
  drawCards();
  try {
    if (!session.pendingArchive) {
      const items = session.figures.map(figure => ({...figure}));
      if (outline) {
        const available = new Map();
        for (const run of session.runs.values()) {
          if (!canUseFigures(run.preset)) continue;
          for (const figure of run.figures) {
            if (figure.answer && figure.analysisFormat === 1 && figure.analysisPrompt === prompt) {
              available.set(JSON.stringify(descriptor(figure)), figure);
            }
          }
        }
        for (const figure of items) {
          const previous = available.get(JSON.stringify(descriptor(figure)));
          if (previous) ({answer:figure.answer, model:figure.model, analysisFormat:figure.analysisFormat,
            analysisPrompt:figure.analysisPrompt} = previous);
          else if (figure.analysisFormat !== 1 || figure.analysisPrompt !== prompt) figure.answer = "";
        }
      }
      const remaining = outline ? items.filter(figure => !figure.answer) : items;
      await checkService(Boolean(remaining.length), signal);
      for (const [index, figure] of remaining.entries()) {
        if (generation.stopping) throw Error("已停止生成。");
        if (current === session) $("status").textContent = `正在解读 ${index+1} / ${remaining.length} · ${figure.label}`;
        figure.error = "";
        figure.answer = "";
        try {
          const {answer, model} = await generate("/interpret", {id:session.id, figure:descriptor(figure), prompt});
          figure.model = model;
          figure.answer = answer;
          figure.analysisFormat = 1;
          figure.analysisPrompt = prompt;
        } catch (error) {
          if (generation.stopping || signal.aborted) throw error;
          figure.error = error.message;
        }
      }
      session.pendingArchive = {id:session.id, ...reportDetails(session), model:[...new Set(items.map(item => item.model).filter(Boolean))].join(" / "),
        figures:items.map(figure => ({...descriptor(figure),answer:figure.answer,error:figure.error,model:figure.model,
          analysisFormat:figure.analysisFormat,analysisPrompt:figure.analysisPrompt}))};
    }
    if (generation.stopping) throw Error("已停止生成。");
    if (outline) {
      if (current === session) $("status").textContent = "正在整理研究大纲和图证据…";
      const result = await generate("/outline", {...session.pendingArchive, prompt:session.preset.prompt});
      session.report = result.report;
      session.outline = result.outline;
      session.outlineView = "overview";
      session.outlinePath = [0];
    } else {
      session.report = await generate("/report", session.pendingArchive);
    }
    const items = session.pendingArchive.figures;
    items.forEach((item, index) => Object.assign(session.figures[index], item));
    session.turns = [];
    session.askError = "";
    session.pendingArchive = null;
    const failures = items.filter(figure => figure.error).length;
    if (failures) session.error = `报告已保存，${failures} 张图解读失败。`;
  } catch (error) {
    session.error = generation.stopping
      ? generation.cancelError ? `本地已停止，取消请求未确认：${generation.cancelError}` : "已停止生成。"
      : error.message;
  } finally {
    session.batch = false;
    session.generation = null;
    if (current === session) drawCards();
  }
};

function drawConversation() {
  const session = current;
  $("conversation").hidden = !session?.report || Boolean(session.batch || session.running);
  if ($("conversation").hidden) return;
  const turns = $("turns");
  if (turns.dataset.report !== session.report.id) {
    turns.replaceChildren();
    turns.dataset.report = session.report.id;
  }
  for (let index = turns.children.length; index < (session.turns?.length || 0); index++) {
    const record = session.turns[index];
    const turn = element("article", "", "turn");
    turn.append(
      editableContent(element("h3", record.question), session, {kind:"turn", field:"question", index}, record, "编辑问题", {plain:true}),
      editableContent(formatted(record.answer), session, {kind:"turn", field:"answer", index}, record, "编辑追问回答"),
    );
    turns.append(turn);
  }
  if ($("question").dataset.report !== session.report.id) {
    $("question").dataset.report = session.report.id;
    $("question").value = "";
  }
  updateQuestionInput(session);
  $("ask").disabled = Boolean(session.asking);
  $("ask-status").textContent = session.asking ? "正在回答…" : session.askError || "";
}

function questionFigureIndex(session) {
  if (!session?.figures.length || $("figure-result").hidden) return;
  return visibleFigureIndex(session) + 1;
}

function updateQuestionInput(session) {
  const index = questionFigureIndex(session);
  const label = index && session.figures[index-1].label;
  $("question").placeholder = label ? `${label} 支持了什么结论？` : "针对这份报告提问…";
  $("clear-question").hidden = !$("question").value;
}

$("question").oninput = () => updateQuestionInput(current);
$("clear-question").onclick = () => {
  $("question").value = "";
  updateQuestionInput(current);
  $("question").focus();
};

$("ask-form").onsubmit = async (event) => {
  event.preventDefault();
  const session = current;
  const question = $("question").value.trim();
  if (!question || !session?.report || session.asking) return;
  const report = session.report;
  session.asking = true;
  session.askError = "";
  const figure = questionFigureIndex(session);
  drawConversation();
  try {
    const {answer, question:recordedQuestion} = await post("/follow-up", {report:report.id, question, figure});
    if (session.report === report) {
      session.turns.push({question:recordedQuestion, answer});
      if (current === session && $("question").value.trim() === question) $("question").value = "";
    }
  } catch (error) {
    if (session.report === report) session.askError = error.message;
  } finally {
    session.asking = false;
    if (current === session) {
      drawConversation();
      if (session.report === report && !session.askError) $("turns").lastElementChild?.scrollIntoView({block:"nearest"});
    }
  }
};

function clearSelection() {
  ++revision;
  current = paper = null;
  original = null;
  pendingDocument = null;
  $("paper-header").hidden = true;
  $("cards").replaceChildren();
  $("work").hidden = true;
  $("empty").hidden = false;
  buttons();
}
$("query").oninput = drawList;
$("paper-filters").onclick = () => parent.postMessage({type:"studio-open-paper-filters"}, "*");

window.addEventListener("message", (event) => {
  if (event.source !== parent || !event.data) return;
  const message = event.data;
  if (message.type === "studio-service-changed") refreshService();
  if (message.type === "studio-paper-filters-state") {
    $("paper-filters").setAttribute("aria-expanded", String(message.open));
    if (message.restoreFocus) $("paper-filters").focus({preventScroll:true});
  }
  if (message.type === "studio-theme") {
    const style = document.documentElement.style;
    for (const [token, value] of Object.entries(message.tokens)) {
      if (token === "font-size") style.setProperty("--studio-font-size", value);
      else style.setProperty("--" + token, value);
    }
    style.colorScheme = message.mode === "dark" ? "dark" : "light";
    schedulePaperTitles();
  }
  if (message.type === "studio-library") {
    if (message.version !== libraryVersion) {
      libraryVersion = message.version;
      cache.clear();
      clearSelection();
    }
    documents = message.papers;
    matchingPaperIds = Array.isArray(message.matchingIds) ? new Set(message.matchingIds) : null;
    $("paper-filters").disabled = false;
    $("paper-filters").toggleAttribute("data-active", !!message.filterCount);
    $("paper-filter-count").textContent = message.filterCount || "";
    $("paper-filter-count").hidden = !message.filterCount;
    if (pendingDocument && !documents.some(({id}) => id === pendingDocument.id)) {
      pendingDocument = null;
      $("empty-title").textContent = "选择处理方式";
    }
    if (original && !documents.some(({id}) => id === original.id)) {
      cache.delete(original.id);
      clearSelection();
    }
    $("library-status").textContent = documents.length ? "" : "文献库中暂无 PDF。";
    drawList();
  }
  if (message.type === "studio-pdf" && message.version === libraryVersion) receivePdf(message);
});

function openSettings() {
  $("model-menu").open = false;
  parent.postMessage({type:"studio-open-settings"}, "*");
}
$("settings").onclick = openSettings;
$("configure-model").onclick = openSettings;
refreshService();

const canvas = $("canvas");
const ctx = canvas.getContext("2d");
let sourcePage;
let rectangle;
let origin;
let pointer;
let cropping;

function point(event) {
  const box = canvas.getBoundingClientRect();
  return {x: Math.min(canvas.width, Math.max(0, (event.clientX-box.left)*canvas.width/box.width)),
          y: Math.min(canvas.height, Math.max(0, (event.clientY-box.top)*canvas.height/box.height))};
}

function paint() {
  if (!sourcePage) return;
  ctx.drawImage(sourcePage,0,0,canvas.width,canvas.height);
  if (rectangle) {
    const [x,y,w,h] = rectangle;
    ctx.fillStyle = "#3b805040";
    ctx.strokeStyle = "#215742";
    ctx.lineWidth = 2;
    ctx.fillRect(x,y,w,h);
    ctx.strokeRect(x,y,w,h);
  }
}

async function showPage() {
  const request = ++cropRevision;
  const session = current;
  const number = Number($("crop-page").value);
  const page = session.pages[number-1];
  sourcePage?.close();
  sourcePage = rectangle = origin = pointer = null;
  $("add-crop").disabled = true;
  canvas.hidden = true;
  $("crop-status").textContent = "正在渲染页面…";
  try {
    const blob = await post("/render",{id:session.id,figure:{page:number,box:[0,0,page.width,page.height]}},"blob");
    const bitmap = await createImageBitmap(blob);
    if (request !== cropRevision) return bitmap.close();
    sourcePage = bitmap;
    canvas.width = Math.min(900,bitmap.width);
    canvas.height = Math.round(canvas.width * bitmap.height / bitmap.width);
    canvas.hidden = false;
    paint();
    $("crop-status").textContent = "";
  } catch (error) {
    if (request === cropRevision) $("crop-status").textContent = error.message;
  }
}

function openPage(crop) {
  cropping = crop;
  $("page-title").textContent = crop ? "从原页补录图片" : "查看原文";
  for (const id of ["crop-hint","crop-fields","add-crop"]) $(id).hidden = !crop;
  $("crop-page").replaceChildren(...current.pages.map((_,i) => element("option", String(i+1))));
  $("crop-label").value = $("crop-caption").value = "";
  $("crop-dialog").showModal();
  showPage();
}
$("crop").onclick = () => openPage(true);
$("open-paper").onclick = () => openPage(false);
$("crop-dialog").onclose = () => { ++cropRevision; sourcePage?.close(); sourcePage = null; };
$("close-crop").onclick = () => $("crop-dialog").close();
$("crop-page").onchange = showPage;
canvas.onpointerdown = (event) => {
  if (!cropping || !sourcePage) return;
  origin = point(event);
  pointer = event.pointerId;
  canvas.setPointerCapture(pointer);
  rectangle = null;
  $("add-crop").disabled = true;
  paint();
};
canvas.onpointermove = (event) => {
  if (!origin || event.pointerId !== pointer) return;
  const p = point(event);
  rectangle = [Math.min(origin.x,p.x),Math.min(origin.y,p.y),Math.abs(p.x-origin.x),Math.abs(p.y-origin.y)];
  paint();
};
canvas.onpointerup = (event) => {
  if (event.pointerId !== pointer) return;
  canvas.onpointermove(event);
  origin = pointer = null;
  $("add-crop").disabled = !rectangle || rectangle[2] < 8 || rectangle[3] < 8;
};
canvas.onpointercancel = () => { origin = pointer = rectangle = null; paint(); };
$("add-crop").onclick = () => {
  if (!cropping || !rectangle || current.batch) return;
  const page = Number($("crop-page").value);
  const {width,height} = current.pages[page-1];
  const [x,y,w,h] = rectangle;
  const box = [x/canvas.width*width,y/canvas.height*height,
               (x+w)/canvas.width*width,(y+h)/canvas.height*height].map((n,i) => Math.min(i%2 ? height : width,n));
  current.figures.push({label:$("crop-label").value.trim() || "补录图",page,box,
                        caption:$("crop-caption").value.trim(),kind:"手动裁剪"});
  current.figures.sort((a,b) => a.page-b.page || (a.box?.[1] ?? -1)-(b.box?.[1] ?? -1));
  current.outline = null;
  current.report = null;
  $("crop-dialog").close();
  drawCards();
};

parent.postMessage({type:"studio-ready"}, "*");


