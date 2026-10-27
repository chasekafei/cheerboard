import './styles.css';
import './fonts.css';
import { createDesign, getTemplate, TEMPLATES, findSloganByText, type Design, type Category, type TemplateId, type SloganFilter } from './catalog';
import { measureBoard, renderBoard, renderExport, invalidateFontCache, resolveRepeatPeriod } from './renderer';
import { loadLocal, saveLocal, saveImage, shareImage, getInsets, isBrowserPreview } from './platform';
import { readRecords, writeRecord, validateDesign } from './records';
import { normalizeDotEmoji, MIN_FONT_SCALE, MAX_FONT_SCALE } from './design-values';
import { loadBoardFonts } from './fonts';
import { mountLightScene, lightGeometry, scrollPixelsPerSecond } from './light-scene';
import { localDateInputValue, renderExportView } from './export-view';
import { button as btn, icon, escapeHTML as escape, sheet } from './ui/primitives';
import { renderHome } from './ui/home';
import { renderLightPlayer, renderLightToolButtons } from './ui/light-controls';
import { renderTextPanel, renderSloganList, renderSloganVariants, renderLightStylePanel, renderGraphicPanel, renderColorPanel, rangeField } from './ui/editor-panels';
import { drawBoardDecorations, DECORATION_SETS } from './decorations';
import { renderHeroPreview } from './ui/preview';

const app = document.querySelector<HTMLDivElement>('#app')!;
const overlay = document.querySelector<HTMLDivElement>('#overlay')!;
const toastEl = document.querySelector<HTMLDivElement>('#toast')!;
let page: 'home' | 'editor' | 'saved' | 'light' = 'home';
let category: Category = 'light';
let homeCategory: Category = 'light';
let design = createDesign();
let records: Design[] = [];
let recordsReady = false;
let recordsError = false;
let editRevision = 0;
let draftAvailable = false;
let draftReady = false;
let previewFrame = 0;
let tab = '文字';
let sloganCategory: SloganFilter = '全部';
let sloganPage = 0;
let search = '';
let searchTimer = 0;
let noticeSeen = false;
let noticeSaving = false;
let exportFormat: 'board' | 'comment' | 'note' | 'a4' | 'memory' = 'note';
let exportDataUrl: string | null = null;
let busy = false;
let exhibition = false;
let frame = 0;
let draftTimer = 0;
let toastTimer = 0;
let lastFocus: HTMLElement | null = null;
let overlayCleanup: (() => void) | null = null;
let overflow = false;
let archiveBusy = false;
let lightControls = false;
let lightSheet: 'text' | 'style' | null = null;
let lightScene: ReturnType<typeof mountLightScene> | null = null;
let lightControlsTimer = 0;
const memory = { place: '', date: localDateInputValue() };
let memoryDateEdited = false;
function toast(message: string) {
  toastEl.textContent = message;
  toastEl.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('visible'), 4200);
}
function fail(error: unknown) { toast(error instanceof Error ? error.message : '暂时没能完成，请重试。你的设计还在。'); }
function dirty() {
  editRevision++;
  draftAvailable = true;
  design.updatedAt = Date.now();
  clearTimeout(draftTimer);
  if (!draftReady) return;
  if (design.text.length > 2000) { toast('文字超过 2000 字，草稿尚未保存，请先精简。'); return; }
  draftTimer = window.setTimeout(() => { void saveLocal('draft-v1', design).catch(() => toast('草稿未保存，请先保存图片。')); }, 500);
}
function header() {
  return `<header class="cb-app-header">${btn(`${icon('back')}返回`, 'home', 'cb-back-button')}<span class="cb-compact-brand">CHEERBOARD<small>举个牌</small></span><nav>${btn(`${icon('bookmark')}我的牌${records.length ? `<b>${records.length}</b>` : ''}`, 'saved', 'cb-nav-link')}</nav></header>`;
}
function templateCard(id: TemplateId, compact = false) {
  const t = getTemplate(id);
  return `<button class="template-card ${compact ? 'compact' : ''} ${page === 'editor' && design.templateId === id ? 'selected' : ''}" data-action="template" data-id="${id}" aria-label="使用${t.name}" aria-pressed="${page === 'editor' && design.templateId === id}"><div class="template-art"><canvas data-template="${id}" aria-label="${t.name}效果预览"></canvas>${page === 'editor' && design.templateId === id ? `<span class="template-check">${icon('check')}</span>` : ''}</div><span class="template-info"><strong>${t.name}</strong>${!compact ? `<small>${t.description}</small>` : ''}</span></button>`;
}
function home() {
  return renderHome({ category: homeCategory, records, draft: draftAvailable ? design : null, recordsReady });
}
function textState() { return { design, category: sloganCategory, search, page: sloganPage }; }
function sloganList() {
  const result = renderSloganList(textState()); sloganPage = result.page; return result.html;
}
function updateSloganList() {
  const list = document.querySelector('#slogans');
  if (list) { list.innerHTML = sloganList(); list.scrollTop = 0; }
}
function sloganVariants() { return renderSloganVariants(design); }
function textPanel() { return renderTextPanel(textState()); }
function colorPanel() { return renderColorPanel(design); }
function graphicPanel() { return renderGraphicPanel(design); }
function lightStylePanel() { return renderLightStylePanel(design); }
function stylePanel() {
  return `<div class="mini-templates">${TEMPLATES.filter(t => t.category === category).map(t => templateCard(t.id, true)).join('')}</div><section class="effect-settings">${rangeField('font-scale', '文字大小', design.fontScale, MIN_FONT_SCALE, MAX_FONT_SCALE, ['更小', '更大'])}</section>`;
}
function paintLightEffects() {
  overlay.querySelectorAll<HTMLCanvasElement>('canvas[data-light-effect]').forEach(canvas => {
    const sample = createDesign(canvas.dataset.lightEffect as TemplateId);
    sample.text = '加油'; sample.sticker = 'none'; sample.border = false; sample.fontScale = 100; sample.decorationId = 'none';
    renderBoard(canvas, sample, { width: 360, height: 160 });
  });
  overlay.querySelectorAll<HTMLCanvasElement>('canvas[data-decoration-preview]').forEach(canvas => {
    const sample = { ...design, decorationId: canvas.dataset.decorationPreview as Design['decorationId'], decorationSeed: 1 };
    canvas.width = 240; canvas.height = 120;
    const context = canvas.getContext('2d');
    if (context) { context.fillStyle = '#000000'; context.fillRect(0, 0, 240, 120); drawBoardDecorations(context, sample, { width: 240, height: 120 }); }
  });
}
function lightPlayer() { return renderLightPlayer(design, lightControls); }
function lightToolButtons() { return renderLightToolButtons(design, lightSheet); }
function armLightControlsHide() {
  clearTimeout(lightControlsTimer);
  if (page !== 'light' || !lightControls || overlay.innerHTML) return;
  lightControlsTimer = window.setTimeout(() => {
    lightControls = false;
    const controlFocused = document.activeElement instanceof HTMLButtonElement && Boolean(document.activeElement.closest('#light-player'));
    updateLightControls();
    if (controlFocused) document.querySelector<HTMLCanvasElement>('#light-board')?.focus();
  }, 4000);
}
function toggleLightControls() {
  lightControls = !lightControls;
  updateLightControls(); armLightControlsHide();
}
function positionLightControls() {
  const root = document.querySelector<HTMLElement>('#light-player');
  const controlFrame = root?.querySelector<HTMLElement>('.light-control-frame');
  if (!root || !controlFrame) return;
  const geometry = lightGeometry(root.clientWidth, root.clientHeight, design.orientation);
  controlFrame.style.width = geometry.cssWidth + 'px';
  controlFrame.style.height = geometry.cssHeight + 'px';
  controlFrame.style.transform = `translate(-50%, -50%) rotate(${geometry.rotation}deg)`;
  controlFrame.classList.toggle('compact-controls', geometry.cssWidth < 600);
  const sides = ['top', 'right', 'bottom', 'left'];
  sides.forEach((side, index) => controlFrame.style.setProperty('--control-inset-' + side, `var(--layout-inset-${sides[(index + (geometry.rotation ? 1 : 0)) % 4]})`));
  const tools = root.querySelector<HTMLElement>('.light-tools')!;
  tools.style.gridTemplateColumns = '';
  const toolsBounds = tools.getBoundingClientRect();
  const toolbarHeight = geometry.rotation ? toolsBounds.width : toolsBounds.height;
  controlFrame.style.setProperty('--light-toolbar-height', toolbarHeight + 'px');
}
function updateLightControls() {
  const root = document.querySelector<HTMLElement>('#light-player');
  if (!root) return;
  root.classList.toggle('controls-visible', lightControls);
  root.style.background = design.background;
  root.querySelector('#light-board')?.setAttribute('aria-label', lightControls ? '点击屏幕隐藏菜单' : '点击屏幕查看菜单');
  const tools = root.querySelector<HTMLElement>('.light-tools')!;
  const signature = [design.orientation, design.scroll, design.speed, design.direction, lightSheet].join(':');
  if (tools.dataset.signature !== signature) {
    const active = document.activeElement instanceof HTMLButtonElement && tools.contains(document.activeElement) ? document.activeElement.dataset.action : undefined;
    tools.innerHTML = lightToolButtons();
    tools.dataset.signature = signature;
    if (lightControls && active) Array.from(tools.querySelectorAll<HTMLButtonElement>('button')).find(button => button.dataset.action === active)?.focus();
  }
  root.querySelectorAll<HTMLElement>('.light-tools, .light-top-tools').forEach(el => el.setAttribute('aria-hidden', String(!lightControls)));
  root.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.tabIndex = lightControls && !button.disabled ? 0 : -1; });
  positionLightControls(); lightScene?.repaint();
}
function openLightSheet(kind: 'text' | 'style') {
  openOverlay(sheet({ title: kind === 'text' ? '文案' : '样式', body: kind === 'text' ? textPanel() : lightStylePanel(), kind, bodyId: 'light-sheet-body', titleId: 'light-sheet-title', headerAction: 'light-sheet-close', closeAction: 'light-sheet-close' }), false);
  lightSheet = kind;
  updateLightControls(); paintLightEffects();
}
function refreshLightSheet() {
  const body = overlay.querySelector<HTMLElement>('#light-sheet-body');
  if (!body || !lightSheet) return;
  const scroll = body.scrollTop;
  const opened = Array.from(body.querySelectorAll('details')).map(item => item.open);
  const focused = body.contains(document.activeElement) ? (document.activeElement as HTMLElement).id : '';
  body.innerHTML = lightSheet === 'text' ? textPanel() : lightStylePanel();
  body.querySelectorAll('details').forEach((item, index) => { if (index < opened.length) item.open = opened[index]; });
  if (focused) document.getElementById(focused)?.focus();
  body.scrollTop = scroll;
  paintLightEffects();
}
function enterLight() {
  if (!draftAvailable || getTemplate(design.templateId).category !== 'light') design = createDesign('L3');
  page = 'light'; category = 'light'; lightControls = false;
  dirty(); render();
}
function editor() {
  const t = getTemplate(design.templateId);
  const isBanner = t.category === 'banner';
  const editorTitle = isBanner
    ? '<div class="editor-title editor-title--solo"><h1>手幅编辑器</h1></div>'
    : `<div class="editor-title">${btn(`${icon('back')}首页`, 'home', 'back-link')}<h1>灯牌编辑器</h1>${btn(`${icon('bookmark')}保存到我的牌`, 'archive', 'save-record')}</div>`;
  const notice = isBanner
    ? `<aside class="cb-banner-dev-notice" role="status">${icon('sparkle')}<span>完整手幅功能的新版本开发中</span></aside>`
    : '';
  return `${header()}<main class="editor-page editor-${t.category}">${notice}${editorTitle}<div class="workspace"><section class="preview-column"><div class="preview-label"><span>${t.name}</span><span>实时预览</span></div><div class="preview-stage"><div class="board-frame"><canvas id="preview" aria-label="当前加油牌实时预览"></canvas></div><div class="preview-stage-bottom"><span class="preview-dot"></span>横持手机，举起你的加油${icon('paddle')}</div></div><p id="length-warning" class="length-warning" role="status"></p><p class="venue-note">回合中请收起，是否允许展示以场馆规定为准。</p><div class="editor-actions">${btn(`${icon('show')}进入展示`, 'show', 'primary-button')}${btn(`${icon('download')}保存图片`, 'export', 'secondary-button')}</div><div class="more-actions">${btn('另存为新牌', 'archive-new', 'text-button')}${btn('分享 / 打印 / 返图卡', 'export-more', 'text-button')}</div></section><section class="editor-panel"><div class="editor-tabs" role="tablist" aria-label="编辑选项">${['文字', '样式', '配色', '装饰'].map(label => btn(label, 'tab', tab === label ? 'selected' : '', `data-id="${label}" role="tab" aria-selected="${tab === label}" aria-controls="edit-panel"`)).join('')}</div><div class="panel-body" id="edit-panel" role="tabpanel">${tab === '文字' ? textPanel() : tab === '样式' ? stylePanel() : tab === '配色' ? colorPanel() : graphicPanel()}</div></section></div></main>`;
}
function saved() {
  return `${header()}<main class="saved-page"><div class="section-top"><div><h1>我的牌<span class="muted"> ${records.length}<small> / 5</small></span></h1><p>把喜欢留在这里，下次直接拿出来。</p></div>${btn(`做一块新牌 ${icon('arrow')}`, 'home', 'primary-button')}</div>${!recordsReady ? `<div class="empty-state"><h2>${recordsError ? '暂时读不到原存档' : '正在取出你的牌…'}</h2><p>${recordsError ? '你的原存档未被覆盖。可以重试，或先制作并保存图片。' : '稍等一下，喜欢还在路上。'}</p>${recordsError ? btn('重新读取', 'reload-records', 'primary-button') : ''}</div>` : records.length ? `<div class="saved-grid">${records.map(d => `<article class="saved-card"><button class="saved-preview" data-action="open" data-id="${d.id}" aria-label="编辑${escape(d.text)}"><canvas data-record="${d.id}"></canvas></button><div class="saved-card-info"><div><strong>${escape(d.text.replace(/\n/g, ' ')) || '还没写下的加油'}</strong><small>${getTemplate(d.templateId).name} · ${new Date(d.updatedAt).toLocaleDateString('zh-CN')}</small></div>${btn(icon('close'), 'delete', 'icon-button', `data-id="${d.id}" aria-label="删除${escape(d.text)}"`)}</div><div class="saved-card-actions">${btn('编辑', 'open', 'secondary-button', `data-id="${d.id}"`)}${btn(`展示 ${icon('arrow')}`, 'show-record', 'primary-button', `data-id="${d.id}"`)}</div></article>`).join('')}</div>` : `<div class="empty-state"><span class="empty-art">${icon('bookmark')}</span><h2>这里，留给你的加油。</h2><p>做好一块牌后，点「保存到我的牌」。</p>${btn('去做第一块', 'home', 'primary-button')}</div>`}<p class="storage-note">最多保存最近 5 块；修改后保存会覆盖原牌，另存才会新增。清理应用或缓存可能丢失，喜欢的记得存图。</p></main>`;
}
function paint() {
  document.querySelectorAll<HTMLCanvasElement>('canvas[data-template]').forEach(canvas => {
    const sample = createDesign(canvas.dataset.template as TemplateId);
    sample.text = page === 'editor' ? design.text : sample.text;
    sample.scroll = false;
    renderBoard(canvas, sample, { width: 720, height: 405 });
  });
  document.querySelectorAll<HTMLCanvasElement>('canvas[data-record]').forEach(canvas => {
    const item = records.find(d => d.id === canvas.dataset.record);
    if (item) renderBoard(canvas, item, { width: 720, height: 405 });
  });
  const hero = document.querySelector<HTMLCanvasElement>('#hero-board');
  if (hero) renderHeroPreview(hero, homeCategory);
  const banner = document.querySelector<HTMLCanvasElement>('#home-banner');
  if (banner) { const sample = createDesign('H1'); sample.text = '钦尽全力'; sample.sticker = 'none'; renderBoard(banner, sample, { width: 640, height: 300 }); }
  const draft = document.querySelector<HTMLCanvasElement>('[data-home-draft]');
  if (draft) renderBoard(draft, design, { width: 320, height: 180 });
  paintPreview();
}
function paintPreview() {
  const canvas = document.querySelector<HTMLCanvasElement>('#preview');
  if (!canvas) { if (page === 'light') lightScene?.repaint(); return; }
  const metrics = renderBoard(canvas, design, { width: 1280, height: 720 });
  overflow = metrics.overflow;
  const warning = document.querySelector('#length-warning');
  if (warning) { warning.textContent = !design.text.trim() ? '先写一句话，再展示给喜欢的人。' : overflow ? '文字较长，建议换行或精简。灯牌也可以主动开启滚动。' : design.scroll ? '预览为静态排版，进入展示后开始滚动。' : ''; warning.classList.toggle('has-warning', overflow); }
}
function render() {
  clearTimeout(searchTimer);
  cancelAnimationFrame(previewFrame);
  if (page === 'light' && lightScene && document.querySelector('#light-player')) {
    updateLightControls(); refreshLightSheet(); lightScene.repaint(); armLightControlsHide(); return;
  }
  clearTimeout(lightControlsTimer);
  if (lightScene) { lightScene.destroy(); lightScene = null; }
  document.body.classList.toggle('light-page-active', page === 'light');
  app.innerHTML = page === 'home' ? home() : page === 'saved' ? saved() : page === 'light' ? lightPlayer() : editor();
  paint();
  if (page === 'light') {
    lightScene = mountLightScene(document.querySelector<HTMLElement>('#light-player')!, () => design, toggleLightControls, () => {
      const root = document.querySelector<HTMLElement>('#light-player')!;
      const viewport = root.querySelector<HTMLElement>('.light-canvas-wrap')!;
      return { width: viewport.clientWidth, height: viewport.clientHeight, orientation: design.orientation };
    });
    updateLightControls();
  }
}
function chooseTemplate(id: TemplateId) {
  const next = createDesign(id);
  const old = getTemplate(design.templateId);
  const t = getTemplate(id);
  const editing = page === 'editor' || page === 'light';
  const sameCategory = editing && old.category === t.category;
  const compatible = editing ? t.palettes.find(p => p.id === design.paletteId) : undefined;
  design = { ...next, id: editing ? design.id : next.id, text: editing || draftAvailable ? design.text : next.text, friendly: design.friendly,
    ...(sameCategory ? { dotStyle: design.dotStyle, decorationId: design.decorationId, decorationSeed: design.decorationSeed, layout: design.layout, sticker: design.sticker, border: design.border, scroll: design.scroll, speed: design.speed, direction: design.direction, loop: design.loop, fontScale: design.fontScale, dotShape: design.dotShape, dotEmoji: design.dotEmoji, dotDensity: design.dotDensity, glow: design.glow, fontId: id === 'L4' && design.templateId !== 'L4' ? next.fontId : design.fontId, orientation: design.orientation } : {}),
    ...(sameCategory && design.paletteId === 'custom' && (id !== 'L5' || design.templateId === 'L5') ? { paletteId: 'custom', foreground: design.foreground, background: design.background, accent: design.accent, gradient: design.gradient, gradientEnd: design.gradientEnd, gradientAngle: design.gradientAngle } : compatible ? { paletteId: compatible.id, background: compatible.background, foreground: compatible.foreground, accent: compatible.accent, gradient: Boolean(compatible.gradientEnd), gradientEnd: compatible.gradientEnd || next.gradientEnd, gradientAngle: compatible.gradientAngle || 0 } : {}), ...(id === 'L5' ? { gradient: false } : {}) };
  category = t.category;
  if (!editing) tab = '文字';
  page = t.category === 'light' ? 'light' : 'editor';
  dirty(); render();
}
async function archive(asNew = false) {
  if (!recordsReady) { toast(recordsError ? '未能读取原存档，请到我的牌重试，或先保存图片。' : '正在读取原存档，请稍后再保存。'); return; }
  if (archiveBusy) return;
  if (!design.text.trim()) { toast('先给这块牌写一句话吧。'); return; }
  if (design.text.length > 2000) { toast('文字超过 2000 字，未保存；请先精简。'); return; }
  archiveBusy = true;
  try {
    const snapshot = { ...design };
    const revision = editRevision;
    const next = await writeRecord(records, snapshot, asNew);
    records = next; if (design.id === snapshot.id) { if (revision === editRevision) design = { ...next[0] }; else if (asNew) design.id = next[0].id; dirty(); }
    toast(asNew ? '已另存为新牌' : '已保存到我的牌'); render();
  } catch { toast('未保存，请先存图。可以检查本地存储权限后重试。'); }
  finally { archiveBusy = false; }
}
function openOverlay(html: string, pauseLight = true) {
  closeOverlay();
  lastFocus = document.activeElement as HTMLElement;
  overlay.innerHTML = html;
  document.body.classList.add('has-overlay');
  app.setAttribute('aria-hidden', 'true');
  lightScene?.setObscured(pauseLight);
  clearTimeout(lightControlsTimer);
  const focusable = overlay.querySelector<HTMLElement>('button, input');
  if (focusable) focusable.focus();
}
function closeOverlay() {
  if (overlayCleanup) { overlayCleanup(); overlayCleanup = null; }
  cancelAnimationFrame(frame);
  exhibition = false;
  exportDataUrl = null;
  overlay.innerHTML = '';
  lightSheet = null;
  lightScene?.setObscured(false);
  document.body.classList.remove('has-overlay');
  app.removeAttribute('aria-hidden');
  if (page === 'light') updateLightControls();
  if (lastFocus && document.body.contains(lastFocus)) lastFocus.focus();
  else if (page === 'light') document.querySelector<HTMLCanvasElement>('#light-board')?.focus();
  lastFocus = null;
  armLightControlsHide();
}
function tips(start = false) {
  openOverlay(sheet({ title: '看台小提醒', kind: 'notice', body: '<p>回合中收起加油牌，把掌声留给好球。</p><ul><li>是否允许展示，请以当场场馆规定为准。</li><li>请勿遮挡后排视线，不闪烁、不发声。</li><li>亮度与自动锁屏可以在系统设置中调整。</li><li>喜欢的牌记得提前存图，现场随时可用。</li></ul>', footer: btn(start ? '记住了，进入展示' : '记住了', start ? 'accept-show' : 'close', 'primary-button wide') }));
}
function tryShow() {
  paintPreview();
  if (!design.text.trim()) { toast('先写一句加油，再进入展示。'); return; }
  if (overflow && !design.scroll) { toast('文字太长啦，先换行或精简；灯牌也可以开启滚动。'); return; }
  if (!noticeSeen) tips(true); else showBoard();
}
function showBoard() {
  openOverlay(`<section class="exhibition" role="dialog" aria-modal="true" aria-label="加油牌展示"><canvas id="display-board" aria-label="${escape(design.text)}"></canvas><div class="display-top">${btn(`${icon('back')}收起展示`, 'close', 'display-exit')}${design.scroll ? btn('停止滚动', 'stop-motion', 'display-exit') : ''}</div><div class="display-hint">${icon('show')}横持手机，展示更完整<span>${design.friendly ? '回合中请收起 · 以当场规定为准' : '轻点牌面可收起提示'}</span></div></section>`);
  exhibition = true;
  const canvas = overlay.querySelector<HTMLCanvasElement>('#display-board')!;
  const container = overlay.querySelector<HTMLElement>('.exhibition')!;
  let progress = 0; let previous = 0; let stopped = false;
  let measurement: { width: number; height: number; fontSize: number; textWidth: number } | null = null;
  const size = () => {
    const r = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    return { width: Math.max(1, Math.round(r.width * ratio)), height: Math.max(1, Math.round((r.height > r.width ? r.width * 9 / 16 : r.height) * ratio)) };
  };
  const draw = (time: number) => {
    if (!exhibition) return;
    const dimensions = size();
    if (design.scroll && !stopped) {
      const elapsed = previous ? Math.min(time - previous, 60) : 0;
      if (!measurement || measurement.width !== dimensions.width || measurement.height !== dimensions.height) {
        measurement = { ...dimensions, ...measureBoard(canvas, design, dimensions) };
      }
      const distance = (dimensions.width + measurement.textWidth) / 2 + measurement.fontSize * 0.25;
      progress += elapsed / 1000 * scrollPixelsPerSecond(design.speed, canvas.clientHeight || dimensions.height) * dimensions.height / (canvas.clientHeight || dimensions.height);
      const repeatGap = measurement.fontSize * 0.38;
      if (design.loop) progress %= resolveRepeatPeriod(measurement.textWidth, repeatGap, dimensions.width);
      else if (progress > distance * 2) stopped = true;
      renderBoard(canvas, stopped ? { ...design, scroll: false } : design, { ...dimensions,
        offset: (design.loop ? -progress : distance - progress) * (design.direction === 'left' ? 1 : -1),
        ...(design.loop ? { repeatGap } : {}) });
      previous = time;
      if (!stopped) frame = requestAnimationFrame(draw);
      else { const stop = overlay.querySelector('[data-action="stop-motion"]'); if (stop) stop.textContent = '重新滚动'; }
    } else renderBoard(canvas, { ...design, scroll: false }, dimensions);
  };
  const resize = () => { if (!design.scroll || stopped) draw(0); };
  window.addEventListener('resize', resize);
  canvas.addEventListener('click', () => container.classList.toggle('hide-hint'));
  const stopButton = overlay.querySelector<HTMLButtonElement>('[data-action="stop-motion"]');
  if (stopButton) stopButton.addEventListener('click', () => { stopped = !stopped; cancelAnimationFrame(frame); if (!stopped) { previous = 0; progress = 0; frame = requestAnimationFrame(draw); } else renderBoard(canvas, { ...design, scroll: false }, size()); stopButton.textContent = stopped ? '重新滚动' : '停止滚动'; });
  const visibility = () => { if (document.hidden) { stopped = true; cancelAnimationFrame(frame); if (stopButton) stopButton.textContent = '重新滚动'; } else if (stopped) { renderBoard(canvas, { ...design, scroll: false }, size()); } };
  document.addEventListener('visibilitychange', visibility);
  overlayCleanup = () => { window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', visibility); };
  frame = requestAnimationFrame(draw);
}
function exportOptions() {
  const portrait = getTemplate(design.templateId).category === 'light' && design.orientation === 'portrait';
  return [ ['note', '笔记分享卡', '1080 × 1440'], ['comment', '评论晒图卡', '1080 × 1080'], ['memory', '观赛打卡', '地点与日期'], ['board', portrait ? '竖版图片' : '横版图片', portrait ? '1080 × 1920' : '1920 × 1080'], ['a4', 'A4 打印图', portrait ? '2480 × 3508' : '3508 × 2480'] ];
}
function exportsDialog() {
  if (!design.text.trim()) { toast('先写一句话，再保存图片。'); return; }
  if (!memoryDateEdited) memory.date = localDateInputValue();
  openOverlay(renderExportView({ format: exportFormat, formats: exportOptions(), memory }));
  updateExport();
}
function updateExport() {
  try {
    // Encode once for both preview and delivery; do not retain the large A4
    // canvas or encode a second copy when the user saves or shares it.
    exportDataUrl = renderExport(design, exportFormat, memory).toDataURL('image/png');
    const img = overlay.querySelector<HTMLImageElement>('#export-image');
    if (img) img.src = exportDataUrl;
  } catch (error) {
    exportDataUrl = null;
    const img = overlay.querySelector<HTMLImageElement>('#export-image');
    if (img) { img.removeAttribute('src'); img.alt = error instanceof Error ? error.message : '暂时无法导出'; }
    overlay.querySelectorAll<HTMLButtonElement>('.export-buttons button').forEach(b => { b.disabled = true; });
    fail(error);
  }
}
async function deliver(kind: 'save' | 'comment' | 'note') {
  if (busy || !exportDataUrl) return;
  busy = true;
  overlay.querySelectorAll<HTMLButtonElement>('.export-buttons button').forEach(b => { b.disabled = true; });
  try {
    const data = exportDataUrl;
    if (kind !== 'save' && draftReady) { clearTimeout(draftTimer); await saveLocal('draft-v1', { ...design }).catch(() => toast('草稿未保存，建议先存图备用。')); }
    if (kind === 'save') { await saveImage(data); toast(isBrowserPreview() ? '图片已下载' : '已保存到相册'); }
    else { await shareImage(data, kind, design); toast('已打开分享流程；是否发布请在小红书内确认。'); }
  } catch (error) { fail(error); }
  finally { busy = false; overlay.querySelectorAll<HTMLButtonElement>('.export-buttons button').forEach(b => { b.disabled = false; }); }
}
async function action(button: HTMLElement) {
  const a = button.dataset.action; const id = button.dataset.id;
  switch (a) {
    case 'home': closeOverlay(); page = 'home'; render(); window.scrollTo(0, 0); break;
    case 'saved': closeOverlay(); page = 'saved'; render(); window.scrollTo(0, 0); break;
    case 'home-category': homeCategory = id as Category; render(); break;
    case 'home-start': if (homeCategory === 'light') enterLight(); else chooseTemplate('H1'); break;
    case 'light-start': enterLight(); break;
    case 'record-menu': {
      const draft = button.dataset.draft === 'true';
      const item = draft && design.id === id ? design : records.find(record => record.id === id);
      if (item) openOverlay(sheet({ title: '我的牌', kind: 'menu', body: `<div class="cb-record-actions">${btn(`${icon('edit')}继续编辑`, draft ? 'resume-draft' : 'open', '', `data-id="${item.id}"`)}${!draft ? btn(`${icon('download')}删除这块牌`, 'delete', 'cb-danger', `data-id="${item.id}"`) : ''}</div>` }));
      break;
    }
    case 'dot-style': design.dotStyle = id as Design['dotStyle']; dirty(); render(); break;
    case 'decoration': design.decorationId = id as Design['decorationId']; design.decorationSeed = 1; dirty(); render(); break;
    case 'decoration-random': {
      const choices = DECORATION_SETS.filter(set => set.id !== 'none' && set.id !== design.decorationId);
      const selected = choices[Math.floor(Math.random() * choices.length)];
      if (selected) { design.decorationId = selected.id; design.decorationSeed = Math.floor(Math.random() * 4294967294) + 1; dirty(); render(); }
      break;
    }
    case 'quick-color': {
      const channel = button.dataset.channel;
      if ((channel === 'foreground' || channel === 'background' || channel === 'accent') && /^#[0-9A-Fa-f]{6}$/.test(id || '')) { design[channel] = id!; design.paletteId = 'custom'; if (channel === 'foreground') design.gradient = false; dirty(); render(); }
      break;
    }
    case 'light-text': openLightSheet('text'); break;
    case 'light-style': openLightSheet('style'); break;
    case 'light-sheet-close': closeOverlay(); break;
    case 'light-orientation': design.orientation = design.orientation === 'landscape' ? 'portrait' : 'landscape'; dirty(); render(); break;
    case 'light-mode': design.scroll = !design.scroll; dirty(); render(); break;
    case 'light-direction': design.direction = design.direction === 'left' ? 'right' : 'left'; dirty(); render(); break;
    case 'light-speed': design.speed = design.speed % 5 + 1; dirty(); render(); break;
    case 'category': category = id as Category; render(); break;
    case 'template': { const fromHome = page !== 'editor' && page !== 'light'; chooseTemplate(id as TemplateId); if (fromHome) window.scrollTo(0, 0); break; }
    case 'tab': tab = id!; render(); break;
    case 'resume-draft': closeOverlay(); page = getTemplate(design.templateId).category === 'light' ? 'light' : 'editor'; lightControls = false; category = getTemplate(design.templateId).category; tab = '文字'; render(); window.scrollTo(0, 0); break;
    case 'dot-shape': design.dotShape = id as Design['dotShape']; dirty(); render(); break;
    case 'dot-density': design.dotDensity = Number(id); dirty(); render(); break;
    case 'dot-emoji-preset': design.dotEmoji = normalizeDotEmoji(id); dirty(); render(); break;
    case 'layout': design.layout = id as Design['layout']; dirty(); render(); break;
    case 'slogan-category': sloganCategory = id as SloganFilter; sloganPage = 0; render(); break;
    case 'slogan-page': sloganPage = Number(id); updateSloganList(); break;
    case 'slogan': design.text = button.dataset.text!; if (design.text.includes('\n')) design.layout = 'double'; dirty(); render(); break;
    case 'palette': { const p = getTemplate(design.templateId).palettes.find(p => p.id === id); if (p) { design.paletteId = p.id; design.foreground = p.foreground; design.background = p.background; design.accent = p.accent; design.gradient = Boolean(p.gradientEnd); design.gradientEnd = p.gradientEnd || design.gradientEnd; design.gradientAngle = p.gradientAngle || 0; dirty(); render(); } break; }
    case 'sticker': design.sticker = id as Design['sticker']; dirty(); render(); break;
    case 'direction': design.direction = id as Design['direction']; dirty(); render(); break;
    case 'archive': await archive(); break;
    case 'archive-new': await archive(true); break;
    case 'open': case 'show-record': { closeOverlay(); const item = records.find(d => d.id === id); if (item) { design = { ...item }; category = getTemplate(design.templateId).category; page = category === 'light' ? 'light' : 'editor'; lightControls = false; dirty(); render(); window.scrollTo(0, 0); if (a === 'show-record' && page === 'editor') tryShow(); } break; }
    case 'reload-records': await loadRecords(); break;
    case 'delete': { closeOverlay(); if (!recordsReady || archiveBusy) break; archiveBusy = true; try { const next = records.filter(d => d.id !== id); await saveLocal('boards-v1', next); records = next; render(); toast('已移除这块牌'); } finally { archiveBusy = false; } break; }
    case 'show': tryShow(); break;
    case 'accept-show': if (noticeSaving) break; noticeSaving = true; noticeSeen = true; void saveLocal('notice-v1', true).catch(() => {}); showBoard(); noticeSaving = false; break;
    case 'tips': tips(); break;
    case 'close': closeOverlay(); break;
    case 'export': exportFormat = 'note'; exportsDialog(); break;
    case 'export-more': exportFormat = 'note'; exportsDialog(); break;
    case 'format': exportFormat = id as typeof exportFormat; exportsDialog(); break;
    case 'save-image': await deliver('save'); break;
    case 'share-comment': await deliver('comment'); break;
    case 'share-note': await deliver('note'); break;
  }
}
document.addEventListener('click', event => { const button = (event.target as HTMLElement).closest<HTMLElement>('[data-action]'); if ((button?.classList.contains('cb-sheet-backdrop') || button?.classList.contains('light-sheet-backdrop')) && event.target !== button) return; if (button && !button.hasAttribute('disabled')) void action(button).catch(fail); });
document.addEventListener('pointerdown', armLightControlsHide, { passive: true });
document.addEventListener('keydown', armLightControlsHide);
document.addEventListener('input', event => {
  const target = event.target as HTMLInputElement;
  switch (target.id) {
    case 'board-text': {
      design.text = target.value; dirty(); paintPreview();
      const count = document.querySelector('#text-count');
      if (count) count.textContent = Array.from(design.text).length + ' / 2000';
      const variants = document.querySelector('#slogan-variants');
      if (variants) variants.innerHTML = sloganVariants();
      const current = findSloganByText(design.text);
      document.querySelectorAll<HTMLButtonElement>('#slogans [data-action="slogan"]').forEach(button => button.classList.toggle('selected', button.dataset.text === current?.text));
      break;
    }
    case 'slogan-search': search = target.value; sloganPage = 0; clearTimeout(searchTimer); searchTimer = window.setTimeout(updateSloganList, 120); break;
    case 'foreground': case 'background': case 'accent': {
      design[target.id] = target.value; design.paletteId = 'custom'; dirty(); paintPreview();
      overlay.querySelectorAll<HTMLButtonElement>('[data-action="quick-color"]').forEach(button => { if (button.dataset.channel === target.id) { const selected = button.dataset.id?.toUpperCase() === target.value.toUpperCase(); button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); } });
      break;
    }
    case 'gradient-end': design.gradientEnd = target.value; design.paletteId = 'custom'; dirty(); paintPreview(); break;
    case 'dot-emoji': if (!(event as InputEvent).isComposing) { design.dotEmoji = normalizeDotEmoji(target.value); dirty(); paintPreview(); } break;
    case 'font-scale': case 'glow': {
      const key = target.id === 'font-scale' ? 'fontScale' : 'glow';
      design[key] = Number(target.value);
      const output = document.getElementById(target.id + '-value');
      if (output) output.textContent = target.value + (output.dataset.suffix || '');
      target.style.setProperty('--range-progress', (Number(target.value) - Number(target.min)) / (Number(target.max) - Number(target.min)) * 100 + '%');
      dirty(); cancelAnimationFrame(previewFrame); previewFrame = requestAnimationFrame(paintPreview); break;
    }
    case 'speed': { design.speed = Number(target.value); const output = target.nextElementSibling; if (output) output.textContent = target.value + ' / 5'; dirty(); break; }
    case 'memory-place': memory.place = target.value; updateExport(); break;
    case 'memory-date': memoryDateEdited = true; memory.date = target.value; updateExport(); break;
  }
});
document.addEventListener('change', event => {
  const target = event.target as HTMLInputElement;
  switch (target.id) {
    case 'border': case 'scroll': case 'loop': case 'friendly': design[target.id] = target.checked; dirty(); render(); break;
    case 'gradient': design.gradient = target.checked; design.paletteId = 'custom'; dirty(); render(); break;
    case 'gradient-angle': design.gradientAngle = Number(target.value); design.paletteId = 'custom'; dirty(); paintPreview(); break;
    case 'dot-emoji': design.dotEmoji = normalizeDotEmoji(target.value); target.value = design.dotEmoji; dirty(); paintPreview(); break;
  }
});
document.addEventListener('keydown', event => {
  if (!overlay.innerHTML) { if (page === 'light' && event.key === 'Escape') { toggleLightControls(); } return; }
  if (event.key === 'Escape') { event.preventDefault(); closeOverlay(); }
  if (event.key === 'Tab') {
    const items = Array.from(overlay.querySelectorAll<HTMLElement>('button:not([disabled]), input, select, textarea, summary, [tabindex="0"]')).filter(item => item.getClientRects().length > 0 && !item.matches(':disabled'));
    if (!items.length) return;
    const first = items[0]; const last = items[items.length - 1];
    if (!items.includes(document.activeElement as HTMLElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); return; }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});
async function loadRecords() {
  recordsError = false;
  try { records = await readRecords(); recordsReady = true; }
  catch { recordsReady = false; recordsError = true; toast('原存档未能读取，已暂停修改存档；仍可制作和存图。'); }
  if (page === 'light') updateLightControls(); else render();
}
async function start() {
  const probe = document.createElement('div'); probe.style.cssText = 'display:flex;flex-direction:column;row-gap:1px;position:absolute;visibility:hidden'; probe.innerHTML = '<i style="height:1px"></i><i style="height:1px"></i>'; document.body.appendChild(probe); if (probe.scrollHeight !== 3) document.documentElement.classList.add('no-flex-gap'); probe.remove();
  const refreshHeight = () => {
    const height = window.visualViewport?.height || window.innerHeight;
    document.documentElement.style.setProperty('--app-height', height + 'px');
    document.documentElement.classList.toggle('short-viewport', height < 420);
    positionLightControls();
  };
  refreshHeight();
  render();
  const fontsChanged = () => { invalidateFontCache(); paint(); lightScene?.repaint(true); paintLightEffects(); };
  void loadBoardFonts().then(fontsChanged);
  if (document.fonts && typeof document.fonts.addEventListener === 'function') document.fonts.addEventListener('loadingdone', fontsChanged);
  const initialRevision = editRevision;
  void loadRecords();
  void loadLocal('draft-v1').then(value => {
    draftReady = true;
    const draft = validateDesign(value);
    if (draft && editRevision === initialRevision && page !== 'editor' && page !== 'light') { design = draft; draftAvailable = true; category = getTemplate(design.templateId).category; render(); }
    else if (editRevision !== initialRevision) dirty();
  }).catch(() => { toast('上次草稿暂时读不到，已暂停自动保存；仍可保存到我的牌或存图。'); });
  void loadLocal('notice-v1').then(value => { noticeSeen = value === true; }).catch(() => {});
  const refreshInsets = () => { void getInsets().then(insets => { (['top', 'right', 'bottom', 'left'] as const).forEach(key => document.documentElement.style.setProperty('--native-' + key, insets[key] + 'px')); }).catch(() => {}); };
  refreshInsets();
  let resizeTimer = 0;
  window.addEventListener('resize', () => { refreshHeight(); clearTimeout(resizeTimer); resizeTimer = window.setTimeout(refreshInsets, 200); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', refreshHeight);
}
void start();
