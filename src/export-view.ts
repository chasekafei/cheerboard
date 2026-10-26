import { button, escapeHTML, icon, sheet } from './ui/primitives.ts';

export type ExportFormat = 'board' | 'comment' | 'note' | 'a4' | 'memory';
export type ExportViewOptions = {
  format: ExportFormat;
  formats: readonly (readonly string[])[];
  memory: { place: string; date: string };
};

export function localDateInputValue(date = new Date()): string {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0')
    + '-' + String(date.getDate()).padStart(2, '0');
}

export function renderExportView({ format, formats, memory }: ExportViewOptions): string {
  const selected = formats.find(option => option[0] === format);
  const formatButtons = formats.map(([id = '', label = '', size = '']) =>
    button(`<span>${escapeHTML(label)}<small>${escapeHTML(size)}</small></span>`, 'format', `export-format-tab${format === id ? ' selected' : ''}`, `data-id="${escapeHTML(id)}" aria-pressed="${format === id}" aria-controls="export-image"`),
  ).join('');
  const fields = format === 'memory'
    ? `<div class="memory-fields"><label>地点（选填）<input id="memory-place" value="${escapeHTML(memory.place)}" maxlength="30" placeholder="写下观赛地点"></label><label>日期<input id="memory-date" type="date" value="${escapeHTML(memory.date)}"></label></div>` : '';
  const hint = format === 'a4' ? '打印请按图片方向选择 A4 纸张，并使用“适合页面”。' : '发布图文会打开小红书发布页，你可以继续编辑。';
  return sheet({
    title: '分享我的加油牌',
    titleId: 'export-title',
    kind: 'share',
    className: 'share-modal',
    bodyClass: 'share-body',
    headerIcon: 'close',
    headerLabel: '',
    headerExtra: 'aria-label="关闭分享"',
    body: `<div class="export-format-tabs" role="group" aria-label="图片类型">${formatButtons}</div><div class="export-layout export-layout-image-first"><div class="export-preview"><img id="export-image" alt="${escapeHTML(selected?.[1] || '加油牌图片')}预览"></div>${fields ? `<div class="export-settings">${fields}</div>` : ''}</div><p class="export-hint">${hint}</p>`,
    footerClass: 'export-buttons export-main-actions share-footer',
    footer: button(icon('download') + '<span>保存到相册</span>', 'save-image', 'primary-button wide')
      + button(icon('share') + '<span>发布图文</span>', 'share-note', 'secondary-button wide'),
  });
}
