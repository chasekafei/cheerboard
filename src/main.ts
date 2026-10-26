import './styles.css';
import './fonts.css';
import { createDesign, getTemplate, TEMPLATES, SLOGAN_CATEGORIES, getSloganPage, findSloganByText, type Design, type Category, type TemplateId, type SloganFilter } from './catalog';
import { measureBoard, renderBoard, renderExport, invalidateFontCache, resolveRepeatPeriod } from './renderer';
import { loadLocal, saveLocal, saveImage, shareImage, getInsets, isBrowserPreview } from './platform';
import { readRecords, writeRecord, validateDesign } from './records';
import { normalizeDotEmoji, DEFAULT_LIGHT_TEXT, MIN_FONT_SCALE, MAX_FONT_SCALE } from './design-values';
import { BOARD_FONTS, TUBE_FONT, loadBoardFonts } from './fonts';
import { mountLightScene, lightGeometry, scrollPixelsPerSecond } from './light-scene';
import { localDateInputValue, renderExportView } from './export-view';

const app = document.querySelector<HTMLDivElement>('#app')!;
const overlay = document.querySelector<HTMLDivElement>('#overlay')!;
const toastEl = document.querySelector<HTMLDivElement>('#toast')!;
let page: 'home' | 'editor' | 'saved' | 'light' = 'home';
let category: Category = 'light';
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
let exportFormat: 'board' | 'comment' | 'note' | 'a4' | 'memory' = 'board';
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
const icons: Record<string, string> = {
  edit: '<path d="m16 3 5 5-12 12-6 1 1-6Z M13 6l5 5"/>',
  rotate: '<path d="M4 8a9 9 0 0 1 15-3l2 2M21 2v5h-5M20 16a9 9 0 0 1-15 3l-2-2M3 22v-5h5"/>',
  motion: '<path d="M3 7h10M3 12h18M3 17h10m3-10 5 5-5 5"/>',
  speed: '<path d="M5 19a9 9 0 1 1 14 0M12 12l5-5M5 14h1m12 0h1M8 7l1 1"/>',
  sliders: '<path d="M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6"/>',
  share: '<path d="M12 16V3m-5 5 5-5 5 5M4 13v8h16v-8"/>',
  paddle: '<ellipse cx="10" cy="9" rx="6.5" ry="7" transform="rotate(-35 10 9)"/><path d="m12 15 5 6 3-2-5-6M5 5l9 9"/><circle cx="20" cy="5" r="2.5"/>',
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
  draftAvailable = true;
  design.updatedAt = Date.now();
  clearTimeout(draftTimer);
  if (!draftReady) return;
  if (design.text.length > 2000) { toast('文字超过 2000 字，草稿尚未保存，请先精简。'); return; }
  draftTimer = window.setTimeout(() => { void saveLocal('draft-v1', design).catch(() => toast('草稿未保存，请先保存图片。')); }, 500);
}
function header() {
  return `<header class="site-header"><button class="brand" data-action="home" aria-label="手机手幅首页"><span class="brand-mark">${icon('paddle')}</span><span>手机手幅<span class="brand-en">乒乓球迷的加油工具</span></span></button><nav aria-label="主导航">${btn('首页', 'home', page === 'home' ? 'nav-link active' : 'nav-link')}${btn(`${icon('bookmark')}我的牌${records.length ? `<span class="count">${records.length}</span>` : ''}`, 'saved', page === 'saved' ? 'nav-link active' : 'nav-link')}</nav></header>`;
}
function templateCard(id: TemplateId, compact = false) {
  const t = getTemplate(id);
  return `<button class="template-card ${compact ? 'compact' : ''} ${page === 'editor' && design.templateId === id ? 'selected' : ''}" data-action="template" data-id="${id}" aria-label="使用${t.name}" aria-pressed="${page === 'editor' && design.templateId === id}"><div class="template-art"><canvas data-template="${id}" aria-label="${t.name}效果预览"></canvas>${page === 'editor' && design.templateId === id ? `<span class="template-check">${icon('check')}</span>` : ''}</div><span class="template-info"><strong>${t.name}</strong>${!compact ? `<small>${t.description}</small>` : ''}</span></button>`;
}
function home() {
  const recent = draftAvailable ? design : records[0];
  return `${header()}<main class="home tool-home"><div class="home-heading"><div><h1>今天，为谁加油？</h1><p>选一块牌，把喜欢亮出来。</p></div><span class="court-symbol" aria-hidden="true">${icon('paddle')}</span></div><section class="tool-entries" aria-label="开始制作"><button class="light-entry" data-action="light-start" aria-label="做灯牌"><div class="entry-heading"><span class="entry-icon">${icon('show')}</span><div><h2>灯牌</h2><p>点阵 · 描边 · 霓虹 · 重影 · 纯色</p></div><span class="entry-arrow">${icon('arrow')}</span></div><div class="entry-board"><canvas id="hero-board" aria-label="乒乓加油点阵灯牌示例"></canvas><i class="board-corner" aria-hidden="true"></i></div><div class="entry-bottom"><span>让喜欢，在看台发光</span><strong>做灯牌 ${icon('arrow')}</strong></div></button><button class="banner-entry" data-action="template" data-id="H1" aria-label="做手幅"><div class="entry-heading"><div><h2>手幅</h2><p>选文案、配颜色，做好存图</p></div><span class="entry-arrow">${icon('arrow')}</span></div><div class="banner-entry-art"><canvas id="home-banner" aria-label="乒乓加油手幅示例"></canvas></div></button></section>${recent ? `<section class="home-recent"><div class="section-heading"><h2>继续做我的牌</h2>${btn('全部作品', 'saved', 'text-button')}</div><button class="recent-work" data-action="${draftAvailable ? 'resume-draft' : 'open'}" data-id="${recent.id}"><canvas ${draftAvailable ? 'data-home-draft' : `data-record="${recent.id}"`} aria-label="上次的加油牌"></canvas><div><strong>${escape(recent.text.replace(/\n/g, ' '))}</strong><small>${getTemplate(recent.templateId).name} · ${draftAvailable ? '上次编辑' : '已保存'}</small></div>${icon('arrow')}</button></section>` : `<section class="home-quick-tip">${icon('paddle')}<div><h2>看台小提醒</h2><p>回合中收起加油牌，把掌声留给好球。</p></div></section>`}<footer class="home-footer"><span>为每一次挥拍加油。</span>${btn('使用小提醒', 'tips', 'text-button')}</footer></main>`;
}
function sloganList() {
  const result = getSloganPage(sloganCategory, search, sloganPage);
  sloganPage = result.page;
  const current = findSloganByText(design.text);
  return result.total ? `<p class="slogan-count" role="status">共 ${result.total} 句 · 点一下套用</p>${result.items.map(s => btn(escape(s.text), 'slogan', `slogan ${current?.id === s.id ? 'selected' : ''}`, `data-text="${escape(s.text)}"`)).join('')}${result.pageCount > 1 ? `<div class="slogan-pagination" role="group" aria-label="文案分页">${btn('上一页', 'slogan-page', '', `data-id="${result.page - 1}" ${result.page === 0 ? 'disabled' : ''}`)}<span>${result.page + 1} / ${result.pageCount}</span>${btn('下一页', 'slogan-page', '', `data-id="${result.page + 1}" ${result.page + 1 === result.pageCount ? 'disabled' : ''}`)}</div>` : ''}` : '<p class="empty-hint">还没有这句话，直接在上面写吧。</p>';
}
function updateSloganList() {
  const list = document.querySelector('#slogans');
  if (list) { list.innerHTML = sloganList(); list.scrollTop = 0; }
}
function sloganVariants() {
  const current = findSloganByText(design.text);
  if (!current?.variants.length) return '';
  return `<div class="slogan-variants"><p>这句话的其他写法</p><div class="slogan-variant-list">${[current.text, ...current.variants].map(text => btn(escape(text), 'slogan', `slogan ${design.text === text ? 'selected' : ''}`, `data-text="${escape(text)}"`)).join('')}</div></div>`;
}
function textPanel() {
  return `<div class="panel-heading"><label for="board-text">写下你的加油</label><span id="text-count">${Array.from(design.text).length} / 2000</span></div><textarea id="board-text" rows="2" placeholder="想说的话，大字写出来" spellcheck="false">${escape(design.text)}</textarea><div class="field-line"><span>排版</span><div class="segmented">${btn('单行', 'layout', design.layout === 'single' ? 'selected' : '', 'data-id="single"')}${btn('双行', 'layout', design.layout === 'double' ? 'selected' : '', 'data-id="double"')}</div></div><p class="input-help">双行可直接换行；不换行时会自动分行。</p><div id="slogan-variants">${sloganVariants()}</div><div class="panel-divider"></div><div class="panel-heading"><span>灵感从这里开始</span><span>点一下套用</span></div><input class="search" id="slogan-search" type="search" placeholder="找一句加油…" value="${escape(search)}" aria-label="搜索口号"><div class="slogan-categories" role="group" aria-label="文案分类">${['全部', ...SLOGAN_CATEGORIES].map(c => btn(c, 'slogan-category', sloganCategory === c ? 'selected' : '', `data-id="${c}" aria-pressed="${sloganCategory === c}"`)).join('')}</div><div class="slogans" id="slogans">${sloganList()}</div>`;
}
function rangeField(id: string, label: string, value: number, min: number, max: number, ends: [string, string], suffix = '%') {
  return `<div class="range-field"><label for="${id}">${label}<output id="${id}-value" for="${id}">${value}${suffix}</output></label><input id="${id}" type="range" min="${min}" max="${max}" step="1" value="${value}"><div class="range-ends"><span>${ends[0]}</span><span>${ends[1]}</span></div></div>`;
}
function fontField() {
  return `<div class="sheet-field"><label for="board-font">字体</label><select id="board-font">${(design.templateId === 'L4' ? [TUBE_FONT] : BOARD_FONTS).map(font => `<option value="${font.id}" ${(design.templateId === 'L4' ? font.id === 'sans' : design.fontId === font.id) ? 'selected' : ''}>${font.name}</option>`).join('')}</select><p class="input-help">${design.templateId === 'L4' ? '灯管使用无衬线字形；手写与宋体可在其他效果中选择。' : '少见字使用系统字体补全。'}</p></div>`;
}
function dotControls() {
  return `<div class="panel-heading"><span>点阵形状</span></div><div class="dot-shapes" role="group" aria-label="点阵形状">${[['circle', '●', '圆形'], ['square', '■', '方形'], ['heart', '♥', '心形'], ['star', '★', '星形'], ['emoji', design.dotEmoji, 'Emoji']].map(([id, glyph, label]) => btn(`<span class="shape-glyph">${escape(glyph)}</span><small>${label}</small>`, 'dot-shape', design.dotShape === id ? 'shape-option selected' : 'shape-option', `data-id="${id}" aria-pressed="${design.dotShape === id}"`)).join('')}</div>${design.dotShape === 'emoji' ? `<div class="emoji-editor"><label for="dot-emoji">你的 Emoji 点阵</label><input id="dot-emoji" type="text" value="${escape(design.dotEmoji)}" maxlength="128" aria-describedby="emoji-help" autocomplete="off"><div class="emoji-presets" role="group" aria-label="常用 Emoji">${['🏓', '❤️', '⭐', '🍟', '🦈', '🦁'].map(glyph => btn(glyph, 'dot-emoji-preset', design.dotEmoji === glyph ? 'selected' : '', `data-id="${glyph}" aria-label="使用${glyph}点阵" aria-pressed="${design.dotEmoji === glyph}"`)).join('')}</div><p id="emoji-help" class="input-help">输入或粘贴一个 Emoji，使用它自身的颜色。</p></div>` : ''}<div class="field-line"><span>光点大小</span><div class="segmented" role="group" aria-label="光点大小">${[['0', '特大'], ['1', '大'], ['2', '中'], ['3', '小']].map(([id, label]) => btn(label, 'dot-density', design.dotDensity === Number(id) ? 'selected' : '', `data-id="${id}" aria-pressed="${design.dotDensity === Number(id)}"`)).join('')}</div></div>`;
}
function stylePanel() {
  return `<div class="panel-heading"><span>手幅样式</span></div><div class="mini-templates">${TEMPLATES.filter(t => t.category === category).map(t => templateCard(t.id, true)).join('')}</div><section class="effect-settings">${fontField()}${rangeField('font-scale', '文字大小', design.fontScale, MIN_FONT_SCALE, MAX_FONT_SCALE, ['更小', '更大'])}</section>`;
}
function colorPanel() {
  if (design.templateId === 'L5') {
    return `<p class="input-help">左上青色与右下红色相叠，交叠处亮成白色；自定义两色会改变混合后的颜色。</p><div class="palette-list">${getTemplate('L5').palettes.map(p => `<button data-action="palette" data-id="${p.id}" class="palette ${design.paletteId === p.id ? 'selected' : ''}" aria-pressed="${design.paletteId === p.id}"><span class="swatch ghost-swatch" style="background:${p.background};color:${p.foreground};text-shadow:2px 2px ${p.accent}">Aa</span><span>${p.name}</span>${design.paletteId === p.id ? icon('check') : ''}</button>`).join('')}</div><div class="custom-colors"><label>左上颜色<input type="color" id="foreground" value="${design.foreground}"></label><label>右下颜色<input type="color" id="accent" value="${design.accent}"></label><label>背景颜色<input type="color" id="background" value="${design.background}"></label></div>`;
  }
  const emoji = design.templateId === 'L3' && design.dotShape === 'emoji';
  const disabled = emoji ? 'disabled' : '';
  return `${emoji ? '<p class="emoji-color-hint">Emoji 保留原色，文字配色暂不可用；仍可修改背景。</p>' : ''}<fieldset class="color-palette-group" ${disabled} aria-label="文字配色"><div class="palette-list">${getTemplate(design.templateId).palettes.map(p => `<button data-action="palette" data-id="${p.id}" class="palette ${design.paletteId === p.id ? 'selected' : ''}" aria-pressed="${design.paletteId === p.id}" ${disabled}><span class="swatch" style="background:${p.gradientEnd ? `linear-gradient(${90 + (p.gradientAngle || 0)}deg,${p.foreground},${p.gradientEnd})` : p.background};color:${p.gradientEnd ? '#FFFFFF' : p.foreground}">Aa<span style="background:${p.accent}"></span></span><span>${p.name}</span>${design.paletteId === p.id ? icon('check') : ''}</button>`).join('')}</div></fieldset><div class="custom-colors"><label class="${emoji ? 'color-disabled' : ''}">${design.templateId === 'L4' ? '灯管颜色' : '文字颜色'}<input type="color" id="foreground" value="${design.foreground}" ${disabled}></label><label>背景颜色<input type="color" id="background" value="${design.background}"></label>${design.templateId === 'L2' ? `<label>描边颜色<input type="color" id="accent" value="${design.accent}"></label>` : ''}</div><fieldset class="color-gradient-group" ${disabled}><label class="toggle-row"><span>渐变文字</span><input id="gradient" type="checkbox" ${design.gradient ? 'checked' : ''} ${disabled}><span class="toggle"></span></label>${design.gradient ? `<div class="custom-colors"><label>渐变终点<input type="color" id="gradient-end" value="${design.gradientEnd}" ${disabled}></label></div><div class="sheet-field"><label for="gradient-angle">渐变方向</label><select id="gradient-angle" ${disabled}>${[[0, '从左到右'], [90, '从上到下'], [45, '斜向渐变']].map(([value, label]) => `<option value="${value}" ${design.gradientAngle === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>` : ''}</fieldset>`;
}
function lightStylePanel() {
  return `<div class="panel-heading"><span>灯牌效果</span><span>点选预览</span></div><div class="light-effect-grid" role="group" aria-label="灯牌效果">${(['L3', 'L2', 'L4', 'L1', 'L5'] as TemplateId[]).map(getTemplate).map(t => btn(`<canvas data-light-effect="${t.id}" aria-hidden="true"></canvas><span>${t.name}</span>${design.templateId === t.id ? icon('check') : ''}`, 'template', `light-effect-option ${design.templateId === t.id ? 'selected' : ''}`, `data-id="${t.id}" aria-pressed="${design.templateId === t.id}"`)).join('')}</div>${rangeField('font-scale', '文字大小', design.fontScale, MIN_FONT_SCALE, MAX_FONT_SCALE, ['更小', '更大'])}${fontField()}<section class="effect-settings">${design.templateId === 'L3' ? dotControls() : ''}${design.templateId === 'L4' ? rangeField('glow', '光晕强度', design.glow, 0, 100, ['清晰灯管', '弥散光晕']) : ''}</section><details class="sheet-colors"><summary>配色</summary>${colorPanel()}</details><details class="sheet-decoration"><summary>更多装饰</summary>${graphicPanel()}</details>`;
}
function paintLightEffects() {
  overlay.querySelectorAll<HTMLCanvasElement>('canvas[data-light-effect]').forEach(canvas => {
    const sample = createDesign(canvas.dataset.lightEffect as TemplateId);
    sample.text = '加油'; sample.sticker = 'none'; sample.border = false; sample.fontScale = 100;
    renderBoard(canvas, sample, { width: 360, height: 160 });
  });
}
function graphicPanel() {
  return `<div class="panel-heading"><span>一点看台小装饰</span></div><div class="sticker-grid">${[['none', '不添加', '—'], ['star', '星星', '✦'], ['heart', '爱心', '♡'], ['fries', '薯条', '🍟'], ['paddle', '球拍', '🏓'], ['ball', '乒乓球', '●']].map(([id, name, glyph]) => btn(`<span class="sticker-glyph">${glyph}</span>${name}`, 'sticker', design.sticker === id ? 'selected' : '', `data-id="${id}" aria-pressed="${design.sticker === id}"`)).join('')}</div><label class="toggle-row"><span>装饰边框<small>给加油牌加一道细框</small></span><input id="border" type="checkbox" ${design.border ? 'checked' : ''}><span class="toggle"></span></label><label class="toggle-row"><span>展示时保留场馆提醒<small>回合中收起，不遮挡后排视线</small></span><input id="friendly" type="checkbox" ${design.friendly ? 'checked' : ''}><span class="toggle"></span></label>`;
}
function lightPlayer() {
  return `<main class="light-player ${lightControls ? 'controls-visible' : ''}" id="light-player" style="background:${design.background}"><div class="light-canvas-wrap" id="light-canvas-wrap"><canvas id="light-board" tabindex="0" role="button" aria-label="点击屏幕显示或收起编辑按钮"></canvas></div><div class="light-control-frame"><div class="light-top-tools" aria-hidden="${!lightControls}">${btn(`${icon('back')}首页`, 'home', 'light-back')}${btn(`${icon('bookmark')}保存`, 'archive', 'light-save')}</div><div class="light-tools" aria-hidden="${!lightControls}">${lightToolButtons()}</div><p class="light-explanation">轻点屏幕，编辑文案或样式</p></div></main>`;
}
function lightToolButtons() {
  return `${btn(`${icon('edit')}<span>文字</span>`, 'light-text', '', 'aria-label="修改文字与文案灵感"')}${btn(`${icon('rotate')}<span>${design.orientation === 'landscape' ? '横屏' : '竖屏'}</span>`, 'light-orientation', '', `aria-label="切换到${design.orientation === 'landscape' ? '竖屏' : '横屏'}"`)}${btn(`${icon('motion')}<span>${design.scroll ? '静止' : '滚动'}</span>`, 'light-mode', '', `aria-label="${design.scroll ? '切换为静止显示' : '开启滚动模式'}"`)}${design.scroll ? `${btn(`${icon('speed')}<span>${design.speed} 档</span>`, 'light-speed', '', `aria-label="滚动速度 ${design.speed} 档，点击加快"`)}${btn(`<span class="direction-glyph" aria-hidden="true">${design.direction === 'left' ? '←' : '→'}</span><span>${design.direction === 'left' ? '向左' : '向右'}</span>`, 'light-direction', '', `aria-label="切换为向${design.direction === 'left' ? '右' : '左'}滚动"`)}` : ''}${btn(`${icon('sliders')}<span>样式</span>`, 'light-style')}${btn(`${icon('share')}<span>分享</span>`, 'export-more')}`;
}
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
  tools.style.gridTemplateColumns = geometry.cssWidth < 600 ? `repeat(${design.scroll ? 4 : 3}, minmax(0, 1fr))` : '';
}
function updateLightControls() {
  const root = document.querySelector<HTMLElement>('#light-player');
  if (!root) return;
  root.classList.toggle('controls-visible', lightControls);
  const hint = root.querySelector<HTMLElement>('.light-explanation');
  if (hint) hint.style.display = !lightControls && design.text === DEFAULT_LIGHT_TEXT ? '' : 'none';
  root.style.background = design.background;
  const tools = root.querySelector<HTMLElement>('.light-tools')!;
  const signature = [design.orientation, design.scroll, design.speed, design.direction].join(':');
  if (tools.dataset.signature !== signature) {
    const active = document.activeElement instanceof HTMLButtonElement && tools.contains(document.activeElement) ? document.activeElement.dataset.action : undefined;
    tools.innerHTML = lightToolButtons();
    tools.dataset.signature = signature;
    if (lightControls && active) Array.from(tools.querySelectorAll<HTMLButtonElement>('button')).find(button => button.dataset.action === active)?.focus();
  }
  root.querySelectorAll<HTMLElement>('.light-tools, .light-top-tools').forEach(el => el.setAttribute('aria-hidden', String(!lightControls)));
  root.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.tabIndex = lightControls ? 0 : -1; });
  positionLightControls();
}
function openLightSheet(kind: 'text' | 'style') {
  openOverlay(`<div class="light-sheet-backdrop" data-action="light-sheet-close"><section class="light-sheet" role="dialog" aria-modal="true" aria-labelledby="light-sheet-title"><div class="light-sheet-header"><h2 id="light-sheet-title">${kind === 'text' ? '文字与文案灵感' : '灯牌样式'}</h2>${btn('完成', 'light-sheet-close')}</div><div class="light-sheet-body" id="light-sheet-body">${kind === 'text' ? textPanel() : lightStylePanel()}</div></section></div>`);
  lightSheet = kind;
  paintLightEffects();
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
  return `${header()}<main class="editor-page editor-${t.category}"><div class="editor-title">${btn(`${icon('back')}首页`, 'home', 'back-link')}<h1>${t.category === 'light' ? '灯牌' : '手幅'}编辑器</h1>${btn(`${icon('bookmark')}保存到我的牌`, 'archive', 'save-record')}</div><div class="workspace"><section class="preview-column"><div class="preview-label"><span>${t.name}</span><span>实时预览</span></div><div class="preview-stage"><div class="board-frame"><canvas id="preview" aria-label="当前加油牌实时预览"></canvas></div><div class="preview-stage-bottom"><span class="preview-dot"></span>横持手机，举起你的加油${icon('paddle')}</div></div><p id="length-warning" class="length-warning" role="status"></p><p class="venue-note">回合中请收起，是否允许展示以场馆规定为准。</p><div class="editor-actions">${btn(`${icon('show')}进入展示`, 'show', 'primary-button')}${btn(`${icon('download')}保存图片`, 'export', 'secondary-button')}</div><div class="more-actions">${btn('另存为新牌', 'archive-new', 'text-button')}${btn('分享 / 打印 / 返图卡', 'export-more', 'text-button')}</div></section><section class="editor-panel"><div class="editor-tabs" role="tablist" aria-label="编辑选项">${['文字', '样式', '配色', '装饰'].map(label => btn(label, 'tab', tab === label ? 'selected' : '', `data-id="${label}" role="tab" aria-selected="${tab === label}" aria-controls="edit-panel"`)).join('')}</div><div class="panel-body" id="edit-panel" role="tabpanel">${tab === '文字' ? textPanel() : tab === '样式' ? stylePanel() : tab === '配色' ? colorPanel() : graphicPanel()}</div></section></div></main>`;
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
  if (hero) { const sample = createDesign('L3'); sample.text = '莎出重围'; renderBoard(hero, sample, { width: 1024, height: 480 }); }
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
    lightScene = mountLightScene(document.querySelector<HTMLElement>('#light-player')!, () => design, toggleLightControls);
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
    ...(sameCategory ? { layout: design.layout, sticker: design.sticker, border: design.border, scroll: design.scroll, speed: design.speed, direction: design.direction, loop: design.loop, fontScale: design.fontScale, dotShape: design.dotShape, dotEmoji: design.dotEmoji, dotDensity: design.dotDensity, glow: design.glow, fontId: id === 'L4' && design.templateId !== 'L4' ? next.fontId : design.fontId, orientation: design.orientation } : {}),
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
function openOverlay(html: string) {
  closeOverlay();
  lastFocus = document.activeElement as HTMLElement;
  overlay.innerHTML = html;
  document.body.classList.add('has-overlay');
  app.setAttribute('aria-hidden', 'true');
  lightScene?.setObscured(true);
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
  if (lastFocus && document.body.contains(lastFocus)) lastFocus.focus();
  else if (page === 'light') document.querySelector<HTMLCanvasElement>('#light-board')?.focus();
  lastFocus = null;
  armLightControlsHide();
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
  return [ ['board', portrait ? '竖版图片' : '横版图片', portrait ? '1080 × 1920' : '1920 × 1080'], ['comment', '评论晒图卡', '1080 × 1080'], ['note', '笔记分享卡', '1080 × 1440'], ['a4', 'A4 打印图', portrait ? '2480 × 3508' : '3508 × 2480'], ['memory', '观赛返图卡', '地点与日期'] ];
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
    case 'saved': page = 'saved'; render(); window.scrollTo(0, 0); break;
    case 'light-start': enterLight(); break;
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
    case 'resume-draft': page = getTemplate(design.templateId).category === 'light' ? 'light' : 'editor'; lightControls = false; category = getTemplate(design.templateId).category; tab = '文字'; render(); window.scrollTo(0, 0); break;
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
    case 'open': case 'show-record': { const item = records.find(d => d.id === id); if (item) { design = { ...item }; category = getTemplate(design.templateId).category; page = category === 'light' ? 'light' : 'editor'; lightControls = false; dirty(); render(); window.scrollTo(0, 0); if (a === 'show-record' && page === 'editor') tryShow(); } break; }
    case 'reload-records': await loadRecords(); break;
    case 'delete': { if (!recordsReady || archiveBusy) break; archiveBusy = true; try { const next = records.filter(d => d.id !== id); await saveLocal('boards-v1', next); records = next; render(); toast('已移除这块牌'); } finally { archiveBusy = false; } break; }
    case 'show': tryShow(); break;
    case 'accept-show': if (noticeSaving) break; noticeSaving = true; noticeSeen = true; void saveLocal('notice-v1', true).catch(() => {}); showBoard(); noticeSaving = false; break;
    case 'tips': tips(); break;
    case 'close': closeOverlay(); break;
    case 'export': exportFormat = 'board'; exportsDialog(); break;
    case 'export-more': exportFormat = 'board'; exportsDialog(); break;
    case 'format': exportFormat = id as typeof exportFormat; exportsDialog(); break;
    case 'save-image': await deliver('save'); break;
    case 'share-comment': await deliver('comment'); break;
    case 'share-note': await deliver('note'); break;
  }
}
document.addEventListener('click', event => { const button = (event.target as HTMLElement).closest<HTMLElement>('[data-action]'); if (button?.classList.contains('light-sheet-backdrop') && event.target !== button) return; if (button && !button.hasAttribute('disabled')) void action(button).catch(fail); });
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
    case 'foreground': case 'background': case 'accent': design[target.id] = target.value; design.paletteId = 'custom'; dirty(); paintPreview(); break;
    case 'gradient-end': design.gradientEnd = target.value; design.paletteId = 'custom'; dirty(); paintPreview(); break;
    case 'dot-emoji': if (!(event as InputEvent).isComposing) { design.dotEmoji = normalizeDotEmoji(target.value); dirty(); paintPreview(); } break;
    case 'font-scale': case 'glow': {
      const key = target.id === 'font-scale' ? 'fontScale' : 'glow';
      design[key] = Number(target.value);
      const output = document.getElementById(target.id + '-value');
      if (output) output.textContent = target.value + '%';
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
    case 'board-font': design.fontId = design.templateId === 'L4' ? 'sans' : target.value as Design['fontId']; dirty(); paintPreview(); break;
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
