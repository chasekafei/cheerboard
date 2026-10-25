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

function escapeHTML(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

export function renderExportView({ format, formats, memory }: ExportViewOptions): string {
  const selected = formats.find(option => option[0] === format);
  const formatButtons = formats.map(([id = '', label = '', size = '']) =>
    `<button type="button" data-action="format" data-id="${escapeHTML(id)}" class="${format === id ? 'selected' : ''}" aria-pressed="${format === id}"><span>${escapeHTML(label)}<small>${escapeHTML(size)}</small></span></button>`,
  ).join('');
  const fields = format === 'memory'
    ? `<div class="memory-fields"><label>地点（选填）<input id="memory-place" value="${escapeHTML(memory.place)}" maxlength="30" placeholder="写下观赛地点"></label><label>日期<input id="memory-date" type="date" value="${escapeHTML(memory.date)}"></label></div>` : '';
  const hint = format === 'a4' ? '打印请按图片方向选择 A4 纸张，并使用“适合页面”。' : '发布图文会打开小红书发布页，你可以继续编辑。';
  return `<div class="modal-backdrop export-backdrop"><section class="export-modal share-modal" role="dialog" aria-modal="true" aria-labelledby="export-title"><div class="modal-header"><div><h2 id="export-title">分享我的加油牌</h2><p>${escapeHTML(selected?.[1] || '加油牌图片')}</p></div><button type="button" data-action="close" class="icon-button" aria-label="关闭分享">×</button></div><div class="export-layout export-layout-image-first"><div class="export-preview"><img id="export-image" alt="加油牌图片预览"></div><div class="export-settings">${fields}<details class="export-more-formats"><summary>更多图片样式与打印</summary><div class="export-options">${formatButtons}</div></details></div></div><div class="export-buttons export-main-actions"><button type="button" data-action="save-image" class="primary-button wide">保存到相册</button><button type="button" data-action="share-note" class="secondary-button wide">发布图文</button></div><p class="export-hint">${hint}</p></section></div>`;
}
