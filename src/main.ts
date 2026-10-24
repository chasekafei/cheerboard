import './styles.css';
import { createDesign, getTemplate, TEMPLATES, SLOGANS, type Design, type Category, type TemplateId } from './catalog';
import { renderBoard, renderExport } from './renderer';
import { loadLocal, saveLocal, saveImage, shareImage, getInsets, isNative } from './platform';
import { readRecords, writeRecord, validateDesign } from './records';

const app = document.querySelector<HTMLDivElement>('#app')!;
const overlay = document.querySelector<HTMLDivElement>('#overlay')!;
const toastEl = document.querySelector<HTMLDivElement>('#toast')!;
let page: 'home' | 'editor' | 'saved' = 'home';
let category: Category = 'banner';
let design = createDesign();
let records: Design[] = [];
let recordsReady = false;
let recordsError = false;
let editRevision = 0;
let tab = '文字';
let sloganCategory = '全部';
let search = '';
let noticeSeen = false;
let noticeSaving = false;
let exportFormat: 'board' | 'comment' | 'note' | 'a4' | 'memory' = 'board';
let exportCanvas: HTMLCanvasElement | null = null;
let busy = false;
let exhibition = false;
let frame = 0;
let draftTimer = 0;
let toastTimer = 0;
let lastFocus: HTMLElement | null = null;
let overlayCleanup: (() => void) | null = null;
let overflow = false;
let archiveBusy = false;
const memory = { place: '', date: '' };
const icons: Record<string, string> = {
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  back: '<path d="m14 6-6 6 6 6"/>',
  star: '<path d="m12 3 2.7 5.6 6.3.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.5l6.3-.9Z"/>',
  bookmark: '<path d="M6 4h12v17l-6-4-6 4Z"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
  show: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8m-4-4v4"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
};
const icon = (name: string, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.star}</svg>`;
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const btn = (label: string, action: string, cls = '', extra = '') => `<button type="button" class="${cls}" data-action="${action}" ${extra}>${label}</button>`;
function toast(message: string) {
  toastEl.textContent = message;
  toastEl.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('visible'), 4200);
}
function fail(error: unknown) { toast(error instanceof Error ? error.message : '暂时没能完成，请重试。你的设计还在。'); }
function dirty() {
  editRevision++;
  design.updatedAt = Date.now();
  clearTimeout(draftTimer);
  if (design.text.length > 2000) { toast('文字超过 2000 字，草稿尚未保存，请先精简。'); return; }
  draftTimer = window.setTimeout(() => { void saveLocal('draft-v1', design).catch(() => toast('草稿未保存，请先保存图片。')); }, 500);
}
function header() {
  return `<header class="site-header"><button class="brand" data-action="home" aria-label="手机手幅首页"><span class="brand-mark">${icon('star')}</span><span>手机手幅<span class="brand-en">CHEERBOARD</span></span></button><nav aria-label="主导航">${btn('做一块牌', 'home', page === 'home' ? 'nav-link active' : 'nav-link')}${btn(`${icon('bookmark')}我的牌${records.length ? `<span class="count">${records.length}</span>` : ''}`, 'saved', page === 'saved' ? 'nav-link active' : 'nav-link')}</nav></header>`;
}
function templateCard(id: TemplateId, compact = false) {
  const t = getTemplate(id);
  return `<button class="template-card ${compact ? 'compact' : ''} ${page === 'editor' && design.templateId === id ? 'selected' : ''}" data-action="template" data-id="${id}" aria-label="使用${t.name}" aria-pressed="${page === 'editor' && design.templateId === id}"><div class="template-art"><canvas data-template="${id}" aria-label="${t.name}效果预览"></canvas><span class="template-use">${icon('arrow')}</span></div><span class="template-info"><span><strong>${t.name}</strong>${!compact ? `<small>${t.description}</small>` : ''}</span><span class="template-index">${id}</span></span></button>`;
}
function home() {
  const recent = records[0];
  return `${header()}<main class="home"><section class="intro"><div class="intro-copy"><h1>把加油，<br>举在<span class="underline">手里。</span><span class="heading-spark">✳</span></h1><p>选一句话，做一块自己的加油牌。<br>灯牌亮出心意，手幅装下喜欢。</p><div class="intro-bottom"><span class="little-dot"></span>随手做，随时用</div></div><button class="featured" data-action="template" data-id="H1" aria-label="制作撞色涂鸦手幅"><div class="featured-top"><span>你的热爱，值得大字写出来</span>${icon('arrow')}</div><div class="featured-board"><canvas id="hero-board" aria-label="撞色涂鸦手幅示例"></canvas></div><div class="featured-bottom"><span>从一句「加油」开始</span><span class="featured-cta">做同款 ${icon('arrow')}</span></div></button></section><section class="collection" aria-labelledby="collection-title"><div class="collection-heading"><div><h2 id="collection-title">先选一款喜欢的</h2><p>文字、颜色都能改成你的。</p></div><div class="category-switch" role="group" aria-label="模板类别">${btn('✦ 灯牌', 'category', category === 'light' ? 'selected' : '', `data-id="light" aria-pressed="${category === 'light'}"`)}${btn('▰ 手幅', 'category', category === 'banner' ? 'selected' : '', `data-id="banner" aria-pressed="${category === 'banner'}"`)}</div></div><div class="category-caption">${category === 'light' ? '让一句加油清清楚楚 · 可选滚动' : '让喜欢有自己的样子 · 静态彩色手幅'}</div><div class="template-grid">${TEMPLATES.filter(t => t.category === category).map(t => templateCard(t.id)).join('')}</div></section>${recent ? `<section class="recent"><div><span class="recent-label">上次的加油还在</span><strong>${escape(recent.text.replace(/\n/g, ' '))}</strong></div>${btn(`继续编辑 ${icon('arrow')}`, 'open', 'text-button', `data-id="${recent.id}"`)}</section>` : ''}<footer class="home-footer"><span>小小一块屏幕，也装得下大大的喜欢。</span><button data-action="tips">使用小提醒 ${icon('arrow')}</button></footer></main>`;
}
function sloganList() {
  return SLOGANS.filter(s => s.confirmed && (sloganCategory === '全部' || s.category === sloganCategory) && s.text.toLowerCase().includes(search.toLowerCase())).map(s => btn(escape(s.text), 'slogan', `slogan ${design.text === s.text ? 'selected' : ''}`, `data-text="${escape(s.text)}"`)).join('') || '<p class="empty-hint">还没有这句话，直接在上面写吧。</p>';
}
function textPanel() {
  return `<div class="panel-heading"><label for="board-text">写下你的加油</label><span id="text-count">${Array.from(design.text).length} / 2000</span></div><textarea id="board-text" rows="2" placeholder="想说的话，大字写出来" spellcheck="false">${escape(design.text)}</textarea><div class="field-line"><span>排版</span><div class="segmented">${btn('单行', 'layout', design.layout === 'single' ? 'selected' : '', 'data-id="single"')}${btn('双行', 'layout', design.layout === 'double' ? 'selected' : '', 'data-id="double"')}</div></div><p class="input-help">双行可直接换行；不换行时会自动分行。</p><div class="panel-divider"></div><div class="panel-heading"><span>灵感从这里开始</span><span>点一下套用</span></div><input class="search" id="slogan-search" type="search" placeholder="找一句加油…" value="${escape(search)}" aria-label="搜索口号"><div class="slogan-categories">${['全部', '通用', '选手及组合', '数字与符号'].map(c => btn(c === '选手及组合' ? '选手 / 组合' : c === '数字与符号' ? '数字 / 符号' : c, 'slogan-category', sloganCategory === c ? 'selected' : '', `data-id="${c}"`)).join('')}</div><div class="slogans" id="slogans">${sloganList()}</div>`;
}
function stylePanel() {
  return `<div class="panel-heading"><span>换个样子，心意不变</span></div><div class="mini-category">${btn('灯牌', 'editor-category', category === 'light' ? 'selected' : '', 'data-id="light"')}${btn('手幅', 'editor-category', category === 'banner' ? 'selected' : '', 'data-id="banner"')}</div><div class="mini-templates">${TEMPLATES.filter(t => t.category === category).map(t => templateCard(t.id, true)).join('')}</div>`;
}
function colorPanel() {
  return `<div class="panel-heading"><span>配好的一整套颜色</span></div><div class="palette-list">${getTemplate(design.templateId).palettes.map(p => `<button data-action="palette" data-id="${p.id}" class="palette ${design.paletteId === p.id ? 'selected' : ''}" aria-pressed="${design.paletteId === p.id}"><span class="swatch" style="background:${p.background};color:${p.foreground}">Aa<span style="background:${p.accent}"></span></span><span>${p.name}</span>${design.paletteId === p.id ? icon('check') : ''}</button>`).join('')}</div><div class="panel-divider"></div><div class="panel-heading"><span>也可以自己配</span></div><div class="custom-colors"><label>文字颜色<input type="color" id="foreground" value="${design.foreground}"></label><label>背景颜色<input type="color" id="background" value="${design.background}"></label></div>`;
}
function graphicPanel() {
  return `<div class="panel-heading"><span>加一点喜欢的小细节</span></div><div class="sticker-grid">${[['none', '不添加', '—'], ['star', '星星', '✦'], ['heart', '爱心', '♡'], ['fries', '薯条', '🍟']].map(([id, name, glyph]) => btn(`<span class="sticker-glyph">${glyph}</span>${name}`, 'sticker', design.sticker === id ? 'selected' : '', `data-id="${id}" aria-pressed="${design.sticker === id}"`)).join('')}</div><label class="toggle-row"><span>装饰边框<small>不抢走文字的主角位置</small></span><input id="border" type="checkbox" ${design.border ? 'checked' : ''}><span class="toggle"></span></label>`;
}
function motionPanel() {
  if (getTemplate(design.templateId).category !== 'light') return '';
  return `<section class="motion-panel"><label class="toggle-row"><span>让文字滚动<small>默认静态，需要时再开启</small></span><input id="scroll" type="checkbox" ${design.scroll ? 'checked' : ''}><span class="toggle"></span></label>${design.scroll ? `<div class="motion-options"><label>速度 <input id="speed" type="range" min="1" max="5" step="1" value="${design.speed}"><span>${design.speed} / 5</span></label><div class="field-line"><span>方向</span><div class="segmented">${btn('← 向左', 'direction', design.direction === 'left' ? 'selected' : '', 'data-id="left"')}${btn('向右 →', 'direction', design.direction === 'right' ? 'selected' : '', 'data-id="right"')}</div></div><label class="checkbox-label"><input id="loop" type="checkbox" ${design.loop ? 'checked' : ''}>循环播放</label></div>` : ''}</section>`;
}
function editor() {
  const t = getTemplate(design.templateId);
  return `${header()}<main class="editor-page"><div class="editor-title">${btn(`${icon('back')}选款`, 'home', 'back-link')}<h1>这块牌，写你的心意。</h1>${btn(`${icon('bookmark')}保存到我的牌`, 'archive', 'save-record')}</div><div class="workspace"><section class="preview-column"><div class="preview-label"><span>你的${t.category === 'light' ? '灯牌' : '手幅'}<span class="muted"> / ${t.name}</span></span><span>实时预览</span></div><div class="preview-stage"><div class="board-frame"><canvas id="preview" aria-label="当前加油牌实时预览"></canvas></div><div class="preview-stage-bottom"><span class="preview-dot"></span>文字会按屏幕自动适配<span>横屏更好看 ${icon('show')}</span></div></div><p id="length-warning" class="length-warning" role="status"></p>${motionPanel()}<div class="friendly-box"><label class="toggle-row"><span>${icon('heart')}场馆友好<small>回合中收起，别挡住后排的视线。</small></span><input id="friendly" type="checkbox" ${design.friendly ? 'checked' : ''}><span class="toggle"></span></label><p>是否允许展示，以当场规定为准。亮度与自动锁屏请在手机系统中手动设置。</p></div><div class="editor-actions">${btn(`${icon('show')}进入展示`, 'show', 'primary-button')}${btn(`${icon('download')}保存图片`, 'export', 'secondary-button')}</div><div class="more-actions">${btn('另存为新牌', 'archive-new', 'text-button')}${btn('分享 / 打印 / 返图卡', 'export-more', 'text-button')}</div></section><section class="editor-panel"><div class="editor-tabs" role="tablist" aria-label="编辑选项">${['文字', '款式', '颜色', '图形'].map(label => btn(label, 'tab', tab === label ? 'selected' : '', `data-id="${label}" role="tab" aria-selected="${tab === label}" aria-controls="edit-panel"`)).join('')}</div><div class="panel-body" id="edit-panel" role="tabpanel">${tab === '文字' ? textPanel() : tab === '款式' ? stylePanel() : tab === '颜色' ? colorPanel() : graphicPanel()}</div></section></div></main>`;
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
  if (hero) { const sample = createDesign('H1'); sample.text = '为你加油'; renderBoard(hero, sample, { width: 1024, height: 576 }); }
  paintPreview();
}
function paintPreview() {
  const canvas = document.querySelector<HTMLCanvasElement>('#preview');
  if (!canvas) return;
  const metrics = renderBoard(canvas, design, { width: 1280, height: 720 });
  overflow = metrics.overflow;
  const warning = document.querySelector('#length-warning');
  if (warning) { warning.textContent = !design.text.trim() ? '先写一句话，再展示给喜欢的人。' : overflow ? '文字较长，建议换行或精简。灯牌也可以主动开启滚动。' : design.scroll ? '预览为静态排版，进入展示后开始滚动。' : ''; warning.classList.toggle('has-warning', overflow); }
}
function render() {
  app.innerHTML = page === 'home' ? home() : page === 'saved' ? saved() : editor();
  paint();
}
function chooseTemplate(id: TemplateId) {
  const next = createDesign(id);
  const old = getTemplate(design.templateId);
  const t = getTemplate(id);
  const compatible = t.palettes.find(p => p.id === design.paletteId);
  design = { ...next, id: page === 'editor' ? design.id : next.id, text: design.text, friendly: design.friendly, layout: old.category === t.category ? design.layout : 'single', ...(compatible ? { paletteId: compatible.id, background: compatible.background, foreground: compatible.foreground } : {}) };
  category = t.category;
  page = 'editor';
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
function openOverlay(html: string) {
  closeOverlay();
  lastFocus = document.activeElement as HTMLElement;
  overlay.innerHTML = html;
  document.body.classList.add('has-overlay');
  app.setAttribute('aria-hidden', 'true');
  const focusable = overlay.querySelector<HTMLElement>('button, input');
  if (focusable) focusable.focus();
}
function closeOverlay() {
  if (overlayCleanup) { overlayCleanup(); overlayCleanup = null; }
  cancelAnimationFrame(frame);
  exhibition = false;
  exportCanvas = null;
  overlay.innerHTML = '';
  document.body.classList.remove('has-overlay');
  app.removeAttribute('aria-hidden');
  if (lastFocus && document.body.contains(lastFocus)) lastFocus.focus();
  lastFocus = null;
}
function tips(start = false) {
  openOverlay(`<div class="modal-backdrop"><section class="notice-modal" role="dialog" aria-modal="true" aria-labelledby="notice-title"><span class="notice-symbol">${icon('heart')}</span><h2 id="notice-title">加油，也照顾身边的人。</h2><p>是否允许举牌，以当场规定为准。<br>回合中请收起，不高举遮挡后排视线。</p><ul><li>展示默认静态，不闪烁、无声音。</li><li>亮度与自动锁屏，请在系统设置中手动调整。</li><li>长时间使用记得留意电量，提前存图作为备用。</li></ul>${btn(start ? '记住了，进入展示' : '记住了', start ? 'accept-show' : 'close', 'primary-button wide')}${start ? btn('返回编辑', 'close', 'text-button wide') : ''}</section></div>`);
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
      const metrics = renderBoard(canvas, design, dimensions);
      const distance = (dimensions.width + metrics.textWidth) / 2 + metrics.fontSize * 0.25;
      progress += elapsed / 1000 * [0, 55, 85, 120, 170, 230][design.speed] * dimensions.height / 720;
      if (progress > distance * 2) { if (design.loop) progress = 0; else stopped = true; }
      renderBoard(canvas, design, { ...dimensions, offset: (distance - progress) * (design.direction === 'left' ? 1 : -1) });
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
const exportOptions = [ ['board', '横版图片', '1920 × 1080'], ['comment', '评论晒图卡', '1080 × 1080'], ['note', '笔记分享卡', '1080 × 1440'], ['a4', 'A4 打印图', '3508 × 2480'], ['memory', '观赛返图卡', '自填地点与日期'] ];
function exportsDialog() {
  if (!design.text.trim()) { toast('先写一句话，再保存图片。'); return; }
  openOverlay(`<div class="modal-backdrop"><section class="export-modal" role="dialog" aria-modal="true" aria-labelledby="export-title"><div class="modal-header"><div><h2 id="export-title">把这份喜欢带走</h2><p>存图备用，或分享你的加油牌。</p></div>${btn(icon('close'), 'close', 'icon-button', 'aria-label="关闭保存窗口"')}</div><div class="export-layout"><div class="export-preview"><img id="export-image" alt="导出图片预览"></div><div class="export-settings"><div class="export-options">${exportOptions.map(([id, label, size]) => btn(`<span>${label}<small>${size}</small></span>${exportFormat === id ? icon('check') : ''}`, 'format', exportFormat === id ? 'selected' : '', `data-id="${id}" aria-pressed="${exportFormat === id}"`)).join('')}</div>${exportFormat === 'memory' ? `<div class="memory-fields"><label>地点（选填）<input id="memory-place" value="${escape(memory.place)}" maxlength="30" placeholder="写下你真实去过的地方"></label><label>日期（选填）<input id="memory-date" type="date" value="${escape(memory.date)}"></label><small>这是设计纪念卡，不是现场合照。</small></div>` : ''}<div class="export-buttons">${btn(`${icon('download')}${isNative() ? '保存到相册' : '下载图片'}`, 'save-image', 'primary-button wide')}${exportFormat === 'comment' ? btn('打开评论草稿', 'share-comment', 'secondary-button wide') : exportFormat === 'note' || exportFormat === 'memory' ? btn('打开笔记草稿', 'share-note', 'secondary-button wide') : ''}</div><p class="export-hint">${exportFormat === 'a4' ? '打印选择 A4 横向、适合页面；实体物料是否可带入请确认当场规定。' : exportFormat === 'comment' || exportFormat === 'note' || exportFormat === 'memory' ? '分享需在小红书内使用；草稿不等于发布，请在发布页检查工具挂件。' : '图片不含操作按钮与宣传水印。可提前存好，现场备用。'}</p></div></div></section></div>`);
  updateExport();
}
function updateExport() {
  try { exportCanvas = renderExport(design, exportFormat, memory); const img = overlay.querySelector<HTMLImageElement>('#export-image'); if (img) img.src = exportCanvas.toDataURL('image/png'); } catch (error) { exportCanvas = null; const img = overlay.querySelector<HTMLImageElement>('#export-image'); if (img) { img.removeAttribute('src'); img.alt = error instanceof Error ? error.message : '暂时无法导出'; } overlay.querySelectorAll<HTMLButtonElement>('.export-buttons button').forEach(b => { b.disabled = true; }); fail(error); }
}
async function deliver(kind: 'save' | 'comment' | 'note') {
  if (busy || !exportCanvas) return;
  busy = true;
  overlay.querySelectorAll<HTMLButtonElement>('.export-buttons button').forEach(b => { b.disabled = true; });
  try {
    const data = exportCanvas.toDataURL('image/png');
    if (kind !== 'save') { clearTimeout(draftTimer); await saveLocal('draft-v1', { ...design }).catch(() => toast('草稿未保存，建议先存图备用。')); }
    if (kind === 'save') { await saveImage(data); toast(isNative() ? '已保存到相册' : '图片已下载'); }
    else { await shareImage(data, kind, design); toast('已打开分享流程；是否发布请在小红书内确认。'); }
  } catch (error) { fail(error); }
  finally { busy = false; overlay.querySelectorAll<HTMLButtonElement>('.export-buttons button').forEach(b => { b.disabled = false; }); }
}
async function action(button: HTMLElement) {
  const a = button.dataset.action; const id = button.dataset.id;
  switch (a) {
    case 'home': page = 'home'; render(); window.scrollTo(0, 0); break;
    case 'saved': page = 'saved'; render(); window.scrollTo(0, 0); break;
    case 'category': category = id as Category; render(); break;
    case 'template': chooseTemplate(id as TemplateId); window.scrollTo(0, 0); break;
    case 'tab': tab = id!; render(); break;
    case 'editor-category': category = id as Category; render(); break;
    case 'layout': design.layout = id as Design['layout']; dirty(); render(); break;
    case 'slogan-category': sloganCategory = id!; render(); break;
    case 'slogan': design.text = button.dataset.text!; dirty(); render(); break;
    case 'palette': { const p = getTemplate(design.templateId).palettes.find(p => p.id === id); if (p) { design.paletteId = p.id; design.foreground = p.foreground; design.background = p.background; dirty(); render(); } break; }
    case 'sticker': design.sticker = id as Design['sticker']; dirty(); render(); break;
    case 'direction': design.direction = id as Design['direction']; dirty(); render(); break;
    case 'archive': await archive(); break;
    case 'archive-new': await archive(true); break;
    case 'open': case 'show-record': { const item = records.find(d => d.id === id); if (item) { design = { ...item }; category = getTemplate(design.templateId).category; page = 'editor'; dirty(); render(); window.scrollTo(0, 0); if (a === 'show-record') tryShow(); } break; }
    case 'reload-records': await loadRecords(); break;
    case 'delete': { if (!recordsReady || archiveBusy) break; archiveBusy = true; try { const next = records.filter(d => d.id !== id); await saveLocal('boards-v1', next); records = next; render(); toast('已移除这块牌'); } finally { archiveBusy = false; } break; }
    case 'show': tryShow(); break;
    case 'accept-show': if (noticeSaving) break; noticeSaving = true; noticeSeen = true; void saveLocal('notice-v1', true).catch(() => {}); showBoard(); noticeSaving = false; break;
    case 'tips': tips(); break;
    case 'close': closeOverlay(); break;
    case 'export': exportFormat = 'board'; exportsDialog(); break;
    case 'export-more': exportFormat = 'comment'; exportsDialog(); break;
    case 'format': exportFormat = id as typeof exportFormat; exportsDialog(); break;
    case 'save-image': await deliver('save'); break;
    case 'share-comment': await deliver('comment'); break;
    case 'share-note': await deliver('note'); break;
  }
}
document.addEventListener('click', event => { const button = (event.target as HTMLElement).closest<HTMLElement>('[data-action]'); if (button && !button.hasAttribute('disabled')) void action(button).catch(fail); });
document.addEventListener('input', event => {
  const target = event.target as HTMLInputElement;
  switch (target.id) {
    case 'board-text': design.text = target.value; dirty(); paintPreview(); { const count = document.querySelector('#text-count'); if (count) count.textContent = Array.from(design.text).length + ' / 2000'; } break;
    case 'slogan-search': search = target.value; { const list = document.querySelector('#slogans'); if (list) list.innerHTML = sloganList(); } break;
    case 'foreground': case 'background': design[target.id] = target.value; design.paletteId = 'custom'; dirty(); paintPreview(); break;
    case 'memory-place': memory.place = target.value; updateExport(); break;
    case 'memory-date': memory.date = target.value; updateExport(); break;
  }
});
document.addEventListener('change', event => {
  const target = event.target as HTMLInputElement;
  switch (target.id) {
    case 'border': case 'scroll': case 'loop': case 'friendly': design[target.id] = target.checked; dirty(); render(); break;
    case 'speed': design.speed = Number(target.value); dirty(); render(); break;
  }
});
document.addEventListener('keydown', event => {
  if (!overlay.innerHTML) return;
  if (event.key === 'Escape') { event.preventDefault(); closeOverlay(); }
  if (event.key === 'Tab') {
    const items = Array.from(overlay.querySelectorAll<HTMLElement>('button:not([disabled]), input, [tabindex="0"]'));
    const first = items[0]; const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});
async function loadRecords(preferSaved = false) {
  recordsError = false;
  try { records = await readRecords(); recordsReady = true; if (preferSaved && records.length && editRevision === 0 && page === 'home') page = 'saved'; }
  catch { recordsReady = false; recordsError = true; toast('原存档未能读取，已暂停修改存档；仍可制作和存图。'); }
  render();
}
async function start() {
  const probe = document.createElement('div'); probe.style.cssText = 'display:flex;flex-direction:column;row-gap:1px;position:absolute;visibility:hidden'; probe.innerHTML = '<i style="height:1px"></i><i style="height:1px"></i>'; document.body.appendChild(probe); if (probe.scrollHeight !== 3) document.documentElement.classList.add('no-flex-gap'); probe.remove();
  render();
  const initialRevision = editRevision;
  void loadRecords(true);
  void loadLocal('draft-v1').then(value => {
    const draft = validateDesign(value);
    if (draft && editRevision === initialRevision && page !== 'editor') { design = draft; category = getTemplate(design.templateId).category; render(); }
  }).catch(() => {});
  void loadLocal('notice-v1').then(value => { noticeSeen = value === true; }).catch(() => {});
  const refreshInsets = () => { void getInsets().then(insets => { (['top', 'right', 'bottom', 'left'] as const).forEach(key => document.documentElement.style.setProperty('--native-' + key, insets[key] + 'px')); }).catch(() => {}); };
  refreshInsets();
  let resizeTimer = 0;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = window.setTimeout(refreshInsets, 200); });
}
void start();
