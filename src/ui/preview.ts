import { createDesign, type Category } from '../catalog';
import { renderBoard } from '../renderer';
import { drawBoardDecorations } from '../decorations';

// The home illustration is a live canvas composition, not a flattened UI image.
export function renderHeroPreview(canvas: HTMLCanvasElement, category: Category): void {
  if (category === 'banner') {
    renderBoard(canvas, { ...createDesign('H1'), text: '钦尽全力', sticker: 'paddle' }, { width: 1040, height: 440 });
    return;
  }
  canvas.width = 1040; canvas.height = 440;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.fillStyle = '#000000'; context.fillRect(0, 0, 1040, 440);
  const demo = { ...createDesign('L3'), decorationId: 'none' as const, fontScale: 100, dotDensity: 1, dotStyle: 'fluorescent' as const };
  const parts = [
    { text: '孙颖莎', foreground: '#FFF12A', x: 73, width: 535 },
    { text: '加油', foreground: '#FF3C88', x: 608, width: 358 },
  ];
  for (const part of parts) {
    const layer = document.createElement('canvas');
    renderBoard(layer, { ...demo, text: part.text, foreground: part.foreground }, { width: part.width, height: 300 });
    context.drawImage(layer, part.x, 70);
  }
  drawBoardDecorations(context, { ...demo, foreground: '#FFF12A', accent: '#FF3C88', decorationId: 'hearts', decorationSeed: 1 }, { width: 1040, height: 440 });
}
