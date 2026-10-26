import type { Design } from '../catalog.ts';
import { button, escapeHTML, icon } from './primitives.ts';

type ActiveSheet = 'text' | 'style' | null;
type Tool = {
  name: string;
  action: string;
  glyph: string;
  label: string;
  ariaLabel: string;
  attributes?: string;
  glyphClass?: string;
  active?: boolean;
  disabled?: boolean;
};

function toolMarkup(design: Design, activeSheet: ActiveSheet, visible: boolean): string {
  const speed = Number.isFinite(design.speed) ? Math.max(1, Math.min(5, Math.round(design.speed))) : 1;
  const speedName = ['很慢', '慢', '中', '快', '很快'][speed - 1];
  const left = design.direction === 'left';
  const landscape = design.orientation === 'landscape';
  const tools: Tool[] = [
    { name: 'home', action: 'home', glyph: 'back', label: '返回', ariaLabel: '返回首页' },
    { name: 'text', action: 'light-text', glyph: 'text', label: '文案', ariaLabel: '编辑文案与查看灵感',
      attributes: `aria-haspopup="dialog" aria-expanded="${activeSheet === 'text'}"`, active: activeSheet === 'text' },
    { name: 'style', action: 'light-style', glyph: 'sparkle', label: '样式', ariaLabel: '修改灯牌样式与配色',
      attributes: `aria-haspopup="dialog" aria-expanded="${activeSheet === 'style'}"`, active: activeSheet === 'style' },
    { name: 'mode', action: 'light-mode', glyph: design.scroll ? 'pause' : 'play', label: design.scroll ? '静止' : '滚动',
      ariaLabel: design.scroll ? '当前滚动显示，点击切换为静止显示' : '当前静止显示，点击开启滚动模式',
    },
    { name: 'speed', action: 'light-speed', glyph: 'speed', label: `速度·${speedName}`,
      ariaLabel: `滚动速度第 ${speed} 档（${speedName}），共 5 档；${design.scroll ? `点击切换到第 ${speed % 5 + 1} 档` : '开启滚动后可调整'}`,
      disabled: !design.scroll },
    { name: 'direction', action: 'light-direction', glyph: left ? 'direction-left' : 'direction-right', label: left ? '向左' : '向右',
      ariaLabel: `滚动方向向${left ? '左' : '右'}，${design.scroll ? `点击切换为向${left ? '右' : '左'}滚动` : '开启滚动后可调整'}`,
      disabled: !design.scroll },
    { name: 'orientation', action: 'light-orientation', glyph: 'landscape', label: landscape ? '横屏' : '竖屏',
      ariaLabel: `当前${landscape ? '横屏' : '竖屏'}，点击切换为${landscape ? '竖屏' : '横屏'}`,
      glyphClass: landscape ? '' : 'is-portrait' },
    { name: 'share', action: 'export-more', glyph: 'share', label: '分享', ariaLabel: '分享或保存图片' },
    { name: 'save', action: 'archive', glyph: 'bookmark', label: '收藏', ariaLabel: '收藏到我的牌' },
  ];
  return tools.map(tool => {
    const classes = `light-tool light-tool-${tool.name}${tool.active ? ' is-active' : ''}`;
    const attributes = `aria-label="${escapeHTML(tool.ariaLabel)}" tabindex="${visible && !tool.disabled ? 0 : -1}"`
      + (tool.attributes ? ` ${tool.attributes}` : '')
      + (tool.disabled ? ' disabled aria-disabled="true"' : '');
    const glyph = icon(tool.glyph, `light-tool-glyph${tool.glyphClass ? ` ${tool.glyphClass}` : ''}`);
    return button(`<span class="light-tool-icon" aria-hidden="true">${glyph}</span><span class="light-tool-label">${escapeHTML(tool.label)}</span>`,
      tool.action, classes, attributes);
  }).join('');
}

/** Always renders nine real actions so changing display modes never moves a tool. */
export function renderLightToolButtons(design: Design, activeSheet: ActiveSheet = null): string {
  return toolMarkup(design, activeSheet, true);
}

export function renderLightPlayer(design: Design, controlsVisible: boolean): string {
  return `<main class="light-player${controlsVisible ? ' controls-visible' : ''}" id="light-player" style="background:${escapeHTML(design.background)}">`
    + `<div class="light-canvas-wrap" id="light-canvas-wrap"><canvas id="light-board" tabindex="0" role="button" aria-label="${controlsVisible ? '点击屏幕隐藏菜单' : '点击屏幕查看菜单'}"></canvas></div>`
    + '<div class="light-control-frame">'
    + '<p class="light-explanation" aria-hidden="true"><span class="light-hint-stroke light-hint-stroke-left"></span><span class="light-hint-label">点击屏幕隐藏菜单</span><span class="light-hint-stroke light-hint-stroke-right"></span></p>'
    + `<div class="light-tools" id="light-tools" role="group" aria-label="灯牌工具栏" aria-hidden="${!controlsVisible}">${toolMarkup(design, null, controlsVisible)}</div>`
    + '</div></main>';
}
