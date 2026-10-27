import { getTemplate, SLOGAN_CATEGORIES, getSloganPage, findSloganByText, type Design, type SloganFilter, type TemplateId } from '../catalog';
import { MIN_FONT_SCALE, MAX_FONT_SCALE } from '../design-values';
import { DECORATION_SETS } from '../decorations';
import { button, escapeHTML as escape, icon } from './primitives';

export interface TextPanelState { design: Design; category: SloganFilter; search: string; page: number }

export function renderSloganList(state: TextPanelState): { html: string; page: number } {
  const result = getSloganPage(state.category, state.search, state.page);
  const current = findSloganByText(state.design.text);
  const html = result.total ? `<p class="sr-only" role="status">共 ${result.total} 句</p><div class="cb-slogan-grid">${result.items.map(s => button(escape(s.text), 'slogan', `slogan ${current?.id === s.id ? 'selected' : ''}`, `data-text="${escape(s.text)}" aria-pressed="${current?.id === s.id}"`)).join('')}</div>${result.pageCount > 1 ? `<div class="slogan-pagination">${button('上一页', 'slogan-page', '', `data-id="${result.page - 1}" ${result.page === 0 ? 'disabled' : ''}`)}<span>${result.page + 1} / ${result.pageCount}</span>${button('下一页', 'slogan-page', '', `data-id="${result.page + 1}" ${result.page + 1 === result.pageCount ? 'disabled' : ''}`)}</div>` : ''}` : '<p class="empty-hint">没找到喜欢的？在上面写一句吧。</p>';
  return { html, page: result.page };
}

export function renderSloganVariants(design: Design): string {
  const current = findSloganByText(design.text);
  if (!current?.variants.length) return '';
  return `<details class="cb-variants"><summary>这句话的其他写法</summary><div class="cb-slogan-grid">${[current.text, ...current.variants].map(text => button(escape(text), 'slogan', `slogan ${design.text === text ? 'selected' : ''}`, `data-text="${escape(text)}"`)).join('')}</div></details>`;
}

export function renderTextPanel(state: TextPanelState): string {
  const { design } = state;
  return `<div class="cb-text-row"><div class="cb-text-input"><label class="sr-only" for="board-text">写下你的加油</label><textarea id="board-text" rows="${design.layout === 'double' ? 2 : 1}" placeholder="写下你的加油" spellcheck="false" aria-describedby="text-count">${escape(design.text)}</textarea>${icon('edit')}<span id="text-count" class="sr-only">${Array.from(design.text).length} / 2000</span></div><div class="segmented" role="group" aria-label="文字排版">${button('单行', 'layout', design.layout === 'single' ? 'selected' : '', 'data-id="single"')}${button('双行', 'layout', design.layout === 'double' ? 'selected' : '', 'data-id="double"')}</div></div><div class="cb-search-row"><label class="cb-search">${icon('search')}<input id="slogan-search" type="search" placeholder="搜索短句" value="${escape(state.search)}" aria-label="搜索口号"></label><div class="slogan-categories" role="group" aria-label="文案分类">${['全部', ...SLOGAN_CATEGORIES].map(category => button(category, 'slogan-category', state.category === category ? 'selected' : '', `data-id="${category}" aria-pressed="${state.category === category}"`)).join('')}</div></div><div id="slogans" class="slogans">${renderSloganList(state).html}</div><div id="slogan-variants">${renderSloganVariants(design)}</div>`;
}

export function rangeField(id: string, label: string, value: number, min: number, max: number, ends?: [string, string], suffix = '%'): string {
  return `<div class="range-field"><label for="${id}">${label}</label><div class="cb-slider-row"><input style="--range-progress:${Math.max(0, Math.min(100, (value - min) / (max - min) * 100))}%" id="${id}" type="range" min="${min}" max="${max}" step="1" value="${value}"><output id="${id}-value" for="${id}" data-suffix="${suffix}">${value}${suffix}</output></div>${ends ? `<div class="range-ends"><span>${ends[0]}</span><span>${ends[1]}</span></div>` : ''}</div>`;
}

function dotProfileControls(design: Design): string {
  return `<div class="cb-detail-row"><span>点阵质感</span><div class="segmented">${[['fine', '纤细'], ['fluorescent', '荧光'], ['classic', '经典']].map(([id, name]) => button(name, 'dot-style', design.dotStyle === id ? 'selected' : '', `data-id="${id}" aria-pressed="${design.dotStyle === id}"`)).join('')}</div></div>`;
}

export function dotControls(design: Design): string {
  return `<div class="cb-detail-row"><span>点阵形状</span><div class="dot-shapes">${[['circle', '●', '圆形'], ['square', '■', '方形'], ['heart', '♥', '心形'], ['star', '★', '星形'], ['emoji', design.dotEmoji, 'Emoji']].map(([id, glyph, name]) => button(`<span>${escape(glyph)}</span>`, 'dot-shape', design.dotShape === id ? 'selected' : '', `data-id="${id}" aria-label="${name}" aria-pressed="${design.dotShape === id}"`)).join('')}</div></div>${design.dotShape === 'emoji' ? `<div class="emoji-editor"><label for="dot-emoji">你的 Emoji</label><input id="dot-emoji" value="${escape(design.dotEmoji)}" maxlength="128" autocomplete="off"><div class="emoji-presets">${['🏓', '❤️', '⭐', '🍟', '🦈', '🦁'].map(glyph => button(glyph, 'dot-emoji-preset', '', `data-id="${glyph}" aria-label="使用${glyph}点阵"`)).join('')}</div><p class="input-help">Emoji 保留自身颜色，可单独更改背景。</p></div>` : ''}<div class="cb-detail-row"><span>光点大小</span><div class="segmented">${[['0', '特大'], ['1', '大'], ['2', '中'], ['3', '小']].map(([id, name]) => button(name, 'dot-density', design.dotDensity === Number(id) ? 'selected' : '', `data-id="${id}" aria-pressed="${design.dotDensity === Number(id)}"`)).join('')}</div></div>`;
}

export function renderColorPanel(design: Design): string {
  const emoji = design.templateId === 'L3' && design.dotShape === 'emoji';
  const ghost = design.templateId === 'L5';
  return `${emoji ? '<p class="input-help">Emoji 保留原色，文字配色暂不可用。</p>' : ''}<fieldset class="cb-palette-field" ${emoji ? 'disabled' : ''}><legend class="sr-only">配色方案</legend><div class="palette-list">${getTemplate(design.templateId).palettes.map(p => button(`<span class="swatch" style="background:${p.background};color:${p.foreground}">Aa<i style="background:${p.accent}"></i></span><span>${p.name}</span>`, 'palette', `palette ${design.paletteId === p.id ? 'selected' : ''}`, `data-id="${p.id}" ${emoji ? 'disabled' : ''}`)).join('')}</div></fieldset><div class="custom-colors"><label>${ghost ? '左上颜色' : '文字颜色'}<input type="color" id="foreground" value="${design.foreground}" ${emoji ? 'disabled' : ''}></label>${ghost || design.templateId === 'L2' ? `<label>${ghost ? '右下颜色' : '描边颜色'}<input type="color" id="accent" value="${design.accent}"></label>` : ''}<label>背景颜色<input type="color" id="background" value="${design.background}"></label></div>${ghost ? '<p class="input-help">两层颜色相叠，交叠处自然变亮。</p>' : `<label class="toggle-row"><span>渐变文字</span><input id="gradient" type="checkbox" ${design.gradient ? 'checked' : ''} ${emoji ? 'disabled' : ''}><span class="toggle"></span></label>${design.gradient ? `<div class="custom-colors"><label>渐变终点<input type="color" id="gradient-end" value="${design.gradientEnd}" ${emoji ? 'disabled' : ''}></label></div><div class="sheet-field"><label for="gradient-angle">渐变方向</label><select id="gradient-angle" ${emoji ? 'disabled' : ''}>${[[0, '从左到右'], [90, '从上到下'], [45, '斜向渐变']].map(([angle, name]) => `<option value="${angle}" ${design.gradientAngle === angle ? 'selected' : ''}>${name}</option>`).join('')}</select></div>` : ''}`}`;
}

export function renderDecorations(design: Design): string {
  return `<section class="cb-decoration-section"><div class="cb-detail-heading"><h3>装饰</h3>${button(`${icon('shuffle')}随机换一套`, 'decoration-random', 'cb-shuffle-button')}</div><div class="cb-decoration-sets" role="group" aria-label="装饰套组">${DECORATION_SETS.map(set => button(`<canvas data-decoration-preview="${set.id}" aria-hidden="true"></canvas><span>${set.name}</span>`, 'decoration', design.decorationId === set.id ? 'selected' : '', `data-id="${set.id}" aria-pressed="${design.decorationId === set.id}"`)).join('')}</div></section>`;
}

export function renderGraphicPanel(design: Design): string {
  return `${getTemplate(design.templateId).category === 'light' ? renderDecorations(design) : `<div class="sticker-grid">${[['none', '不添加', '—'], ['star', '星星', '✦'], ['heart', '爱心', '♡'], ['fries', '薯条', '🍟'], ['paddle', '球拍', '🏓'], ['ball', '乒乓球', '●']].map(([id, name, glyph]) => button(`<span>${glyph}</span>${name}`, 'sticker', design.sticker === id ? 'selected' : '', `data-id="${id}"`)).join('')}</div>`}<label class="toggle-row"><span>装饰边框</span><input id="border" type="checkbox" ${design.border ? 'checked' : ''}><span class="toggle"></span></label><label class="toggle-row"><span>展示时保留场馆提醒</span><input id="friendly" type="checkbox" ${design.friendly ? 'checked' : ''}><span class="toggle"></span></label>`;
}

export function renderLightStylePanel(design: Design): string {
  const names: Record<string, string> = { L3: '点阵', L2: '描边', L4: '霓虹', L1: '纯色', L5: '重影' };
  return `<div class="light-effect-grid" role="group" aria-label="灯牌效果">${(['L3', 'L2', 'L4', 'L1', 'L5'] as TemplateId[]).map(id => button(`<span class="cb-effect-preview"><canvas data-light-effect="${id}" aria-hidden="true"></canvas></span><span>${names[id]}</span>`, 'template', `light-effect-option ${design.templateId === id ? 'selected' : ''}`, `data-id="${id}" aria-pressed="${design.templateId === id}"`)).join('')}</div><div class="range-field cb-style-font-scale">${rangeField('font-scale', '字号', design.fontScale, MIN_FONT_SCALE, MAX_FONT_SCALE, undefined, '')}</div>${design.templateId === 'L3' ? `<div class="cb-dot-profile">${dotProfileControls(design)}</div>` : ''}${renderDecorations(design)}<div class="cb-style-more">${design.templateId === 'L3' ? dotControls(design) : ''}${design.templateId === 'L4' ? rangeField('glow', '光晕强度', design.glow, 0, 100, ['清晰', '柔和']) : ''}${renderColorPanel(design)}<label class="toggle-row"><span>装饰边框</span><input id="border" type="checkbox" ${design.border ? 'checked' : ''}><span class="toggle"></span></label></div>`;
}
