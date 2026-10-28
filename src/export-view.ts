import { button, escapeHTML, icon, sheet } from './ui/primitives.ts';

export type ExportFormat = 'board' | 'comment' | 'note' | 'a4' | 'memory';
export type ExportViewOptions = {
  format: ExportFormat;
  formats: readonly (readonly string[])[];
  memory: { place: string; date: string; name: string };
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
    ? `<div class="memory-fields"><label>地点（选填）<input id="memory-place" value="${escapeHTML(memory.place)}" maxlength="30" placeholder="写下观赛地点"></label><label>日期<input id="memory-date" type="date" value="${escapeHTML(memory.date)}"></label><label>观众姓名（选填）<input id="memory-name" value="${escapeHTML(memory.name)}" maxlength="20" placeholder="写下你的名字"></label></div>` : '';
  const hint = format === 'a4'
    ? '适合打印的 A4 版本。请按图片方向选择纸张，并勾选“适合页面”。'
    : format === 'comment'
      ? '图片会带入评论编辑器；发布前可以补充文字，是否发布由你确认。'
      : format === 'memory'
        ? '填好日期、地点和姓名，留下一张横向观赛票根，也可以保存或发布。'
        : format === 'board'
          ? '导出当前方向的完整牌面，适合保存、发笔记或现场展示。'
          : '把这张加油图带入小红书发布页，可继续补充正文和话题。';
  return sheet({
    title: '分享这块牌',
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
