export type BoardFontId = 'sans' | 'serif' | 'handwritten';
export type BoardFont = { id: BoardFontId; name: string; family: string; weight: number };

export const TUBE_FONT: BoardFont = {
  id: 'sans',
  name: '无衬线灯管',
  family: '"Cheerboard Tube", "Cheerboard Sans", "PingFang SC", "Microsoft YaHei", sans-serif',
  weight: 100,
};

export const BOARD_FONTS: readonly BoardFont[] = [
  { id: 'sans', name: '清晰黑体', family: '"Cheerboard Sans", "PingFang SC", "Microsoft YaHei", sans-serif', weight: 700 },
  { id: 'serif', name: '宋体（系统）', family: '"Songti SC", SimSun, "Noto Serif CJK SC", serif', weight: 700 },
  { id: 'handwritten', name: '手写文楷', family: '"Cheerboard Handwriting", "Kaiti SC", KaiTi, serif', weight: 300 },
];

export function getBoardFont(id: unknown): BoardFont {
  return BOARD_FONTS.find(font => font.id === id) || BOARD_FONTS[0];
}

let loading: Promise<void> | null = null;

export function loadBoardFonts(): Promise<void> {
  if (loading) return loading;
  if (typeof document === 'undefined' || !document.fonts || typeof document.fonts.load !== 'function') {
    return Promise.resolve();
  }
  try {
    const sample = '莎出重围孙颖莎王楚钦';
    const fonts = document.fonts;
    loading = Promise.all(['400 24px "Cheerboard Sans"', '300 24px "Cheerboard Handwriting"', '100 24px "Cheerboard Tube"'].map(request =>
      Promise.resolve().then(() => fonts.load(request, sample)).then(() => {}, () => {}),
    )).then(() => {});
  } catch {
    loading = Promise.resolve();
  }
  return loading;
}
