export function escapeHTML(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

const ICON_PATHS: Record<string, string> = {
  search: '<circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/>',
  edit: '<path d="m15.5 3.5 5 5-12 12-6 1 1-6Z M12.5 6.5l5 5"/>',
  text: '<path d="M4 5h16M12 5v15M8 20h8"/>',
  rotate: '<path d="M4 8a8.5 8.5 0 0 1 14.5-3L21 7M21 2v5h-5M20 16a8.5 8.5 0 0 1-14.5 3L3 17M3 22v-5h5"/>',
  landscape: '<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M7 9v6M10.5 12H18m-2.5-2.5L18 12l-2.5 2.5"/>',
  motion: '<path d="M3 6.5h10M3 12h17M3 17.5h10m3-10 4.5 4.5-4.5 4.5"/>',
  speed: '<path d="M4.5 19a9 9 0 1 1 15 0M12 12l5-5M4 13h2m12 0h2M7.5 5.5 9 7M15 7l1.5-1.5"/>',
  sliders: '<path d="M3 6h18M3 12h18M3 18h18M8 3v6M16 9v6M10 15v6"/>',
  settings: '<path d="m10 2-.6 2.5-2.1 1.2-2.5-.7-2 3.5 1.8 1.8v2.4l-1.8 1.8 2 3.5 2.5-.7 2.1 1.2.6 2.5h4l.6-2.5 2.1-1.2 2.5.7 2-3.5-1.8-1.8v-2.4L21.2 8l-2-3.5-2.5.7-2.1-1.2L14 2Z"/><circle cx="12" cy="11.5" r="3.4"/>',
  bell: '<path d="M5 10a7 7 0 0 1 14 0v4l2 3H3l2-3Zm4.5 10a2.8 2.8 0 0 0 5 0M12 1v2"/>',
  share: '<path d="M12 15V3m-5 5 5-5 5 5M4 13v7h16v-7"/>',
  paddle: '<ellipse cx="9" cy="9" rx="6" ry="7" transform="rotate(-35 9 9)"/><path d="m11 15 5 6 3-2-5-6M4.5 5l9 9"/><circle cx="20" cy="5" r="2.5"/>',
  bulb: '<path d="M8 16c0-2-3-3.8-3-7a7 7 0 0 1 14 0c0 3.2-3 5-3 7v2H8Zm1 6h6M8 18h8M12 0v1M1 9h1m20 0h1M3 2l1.5 1.5M21 2l-1.5 1.5"/>',
  banner: '<path d="M4 3c5 1.4 11-1.4 16 0l-1 17-7-3-9 3Z"/><circle cx="4" cy="3" r="1.3"/><circle cx="20" cy="3" r="1.3"/><circle cx="19" cy="20" r="1.3"/><circle cx="3" cy="20" r="1.3"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  back: '<path d="m14.5 5-7 7 7 7"/>',
  'chevron-right': '<path d="m9.5 5 7 7-7 7"/>',
  star: '<path d="m12 2.5 2.9 6 6.6 1-4.8 4.6 1.1 6.6-5.8-3.1-5.8 3.1 1.1-6.6-4.8-4.6 6.6-1Z"/>',
  sparkle: '<path d="m12 2 2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6Z"/>',
  bookmark: '<path d="M6 3h12v19l-6-4-6 4Z"/>',
  close: '<path d="m5.5 5.5 13 13m0-13-13 13"/>',
  download: '<path d="M12 2v13m-5-5 5 5 5-5M3.5 16v5h17v-5"/>',
  show: '<rect x="2.5" y="4.5" width="19" height="14" rx="3"/><path d="M8 22h8m-4-3.5V22"/>',
  check: '<path d="m4.5 12 5 5 10-11"/>',
  heart: '<path d="M20.5 4.5a5.4 5.4 0 0 0-7.6 0L12 5.4l-.9-.9a5.4 5.4 0 0 0-7.6 7.6L12 21l8.5-8.9a5.4 5.4 0 0 0 0-7.6Z"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1.3" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" rx="1.3" fill="currentColor" stroke="none"/>',
  play: '<path d="m7 3 14 9-14 9Z"/>',
  direction: '<path d="M3 7h17m-4-4 4 4-4 4M21 17H4m4-4-4 4 4 4"/>',
  'direction-left': '<path d="M21 12H3m6-6-6 6 6 6"/>',
  'direction-right': '<path d="M3 12h18m-6-6 6 6-6 6"/>',
  ellipsis: '<circle cx="12" cy="4" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="20" r="1.6" fill="currentColor" stroke="none"/>',
  shuffle: '<path d="M3 5h3c4 0 8 14 12 14h3m-4-4 4 4-4 3M3 19h3c1.8 0 3.6-2.6 5.3-5.5M14 8c1.4-1.8 2.7-3 4-3h3m-4-3 4 3-4 4"/>',
};

export function icon(name: string, cls = ''): string {
  return `<svg class="cb-icon${cls ? ' ' + escapeHTML(cls) : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON_PATHS[name] || ICON_PATHS.star}</svg>`;
}

// label and extra are trusted application HTML; escape user text before passing it.
export function button(label: string, action: string, cls = '', extra = ''): string {
  return `<button type="button" class="cb-button${cls ? ' ' + escapeHTML(cls) : ''}" data-action="${escapeHTML(action)}"${extra ? ' ' + extra : ''}>${label}</button>`;
}

export type SheetOptions = {
  title: string;
  body: string;
  kind: string;
  headerAction?: string;
  headerLabel?: string;
  headerIcon?: string;
  headerExtra?: string;
  footer?: string;
  className?: string;
  bodyClass?: string;
  bodyId?: string;
  footerClass?: string;
  backdropClass?: string;
  titleId?: string;
  closeAction?: string;
};

export function sheet(options: SheetOptions): string {
  const kind = options.kind.replace(/[^a-zA-Z0-9_-]/g, '-') || 'notice';
  const titleId = options.titleId || 'cb-sheet-' + kind + '-title';
  const label = options.headerLabel ?? '完成';
  const action = options.headerAction || options.closeAction || 'close';
  const closeAction = options.closeAction || 'close';
  const actionClass = label === '完成' ? 'cb-sheet-done' : options.headerIcon ? 'cb-sheet-close' : 'cb-sheet-action';
  const content = (options.headerIcon ? icon(options.headerIcon) : '') + (label ? `<span>${escapeHTML(label)}</span>` : '');
  const extra = options.headerExtra || '';
  const accessibleLabel = /\baria-label\s*=/.test(extra) ? '' : `aria-label="${escapeHTML(label || '关闭' + options.title)}"`;
  const headerButton = button(content, action, actionClass, [accessibleLabel, extra].filter(Boolean).join(' '));
  const footer = options.footer ? `<footer class="cb-sheet-footer${options.footerClass ? ' ' + escapeHTML(options.footerClass) : ''}">${options.footer}</footer>` : '';
  return `<div class="cb-sheet-backdrop cb-sheet-backdrop--${kind}${options.backdropClass ? ' ' + escapeHTML(options.backdropClass) : ''}" data-action="${escapeHTML(closeAction)}"><section class="cb-sheet cb-sheet--${kind}${options.className ? ' ' + escapeHTML(options.className) : ''}" role="dialog" aria-modal="true" aria-labelledby="${escapeHTML(titleId)}"><header class="cb-sheet-header"><h2 class="cb-sheet-title" id="${escapeHTML(titleId)}">${escapeHTML(options.title)}</h2>${headerButton}</header><div class="cb-sheet-body${options.bodyClass ? ' ' + escapeHTML(options.bodyClass) : ''}"${options.bodyId ? ` id="${escapeHTML(options.bodyId)}"` : ''}>${options.body}</div>${footer}</section></div>`;
}
