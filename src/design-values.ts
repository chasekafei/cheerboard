export const DEFAULT_DOT_EMOJI = '🏓';
export const DEFAULT_LIGHT_TEXT = '点击屏幕查看菜单';
export const MIN_FONT_SCALE = 70;
export const MAX_FONT_SCALE = 200;
export const MIN_DOT_DENSITY = 0;
export const MAX_DOT_DENSITY = 3;
export const DOT_STYLES = [
  { id: 'classic', name: '经典点阵' },
  { id: 'fluorescent', name: '荧光亮点' },
  { id: 'fine', name: '细线点阵' },
] as const;
export type DotStyle = typeof DOT_STYLES[number]['id'];
const MAX_EMOJI_CODE_POINTS = 32;

function regionalIndicator(code: number): boolean {
  return code >= 0x1f1e6 && code <= 0x1f1ff;
}

function graphemeExtension(code: number): boolean {
  return (code >= 0x300 && code <= 0x36f)
    || (code >= 0x1ab0 && code <= 0x1aff)
    || (code >= 0x1dc0 && code <= 0x1dff)
    || (code >= 0x20d0 && code <= 0x20ff)
    || (code >= 0xfe00 && code <= 0xfe0f)
    || (code >= 0xfe20 && code <= 0xfe2f)
    || (code >= 0x1f3fb && code <= 0x1f3ff)
    || (code >= 0xe0020 && code <= 0xe007f)
    || (code >= 0xe0100 && code <= 0xe01ef);
}

// Chrome 61 has no Intl.Segmenter. Keep a joined emoji intact instead of
// cutting its UTF-16 representation or allowing an unbounded dot label.
export function normalizeDotEmoji(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_DOT_EMOJI;
  let result = '';
  let count = 0;
  let previous = 0;
  let regionalCount = 0;
  for (const character of value.trim()) {
    const code = character.codePointAt(0)!;
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f) || (code >= 0xd800 && code <= 0xdfff)) {
      return result && previous !== 0x200d ? result : DEFAULT_DOT_EMOJI;
    }
    if (!count) {
      if (code === 0x200d || graphemeExtension(code)) return DEFAULT_DOT_EMOJI;
    } else if (!(graphemeExtension(code) || code === 0x200d || previous === 0x200d
      || (regionalIndicator(code) && regionalCount === 1))) {
      break;
    }
    if (count === MAX_EMOJI_CODE_POINTS) return DEFAULT_DOT_EMOJI;
    result += character;
    count++;
    if (regionalIndicator(code)) regionalCount++;
    previous = code;
  }
  return result && previous !== 0x200d ? result : DEFAULT_DOT_EMOJI;
}
