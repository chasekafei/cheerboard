import { SLOGANS } from './slogans.ts';
import { DEFAULT_DOT_EMOJI, DEFAULT_LIGHT_TEXT } from './design-values.ts';
import type { BoardFontId } from './fonts.ts';
export type { BoardFontId } from './fonts.ts';
export { SLOGANS, SLOGAN_CATEGORIES, findSlogans, getSloganPage, findSloganByText, type Slogan, type SloganCategory, type SloganFilter } from './slogans.ts';

export type Category = 'light' | 'banner';
export type TemplateId = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'H1' | 'H2' | 'H3';
export type DotShape = 'circle' | 'square' | 'heart' | 'star' | 'emoji';
export type Design = {
  id: string;
  text: string;
  templateId: TemplateId;
  paletteId: string;
  foreground: string;
  background: string;
  accent: string;
  dotShape: DotShape;
  dotEmoji: string;
  dotDensity: number;
  glow: number;
  fontScale: number;
  fontId: BoardFontId;
  gradient: boolean;
  gradientEnd: string;
  gradientAngle: number;
  orientation: 'portrait' | 'landscape';
  layout: 'single' | 'double';
  sticker: 'star' | 'heart' | 'fries' | 'paddle' | 'ball' | 'none';
  border: boolean;
  scroll: boolean;
  speed: number;
  direction: 'left' | 'right';
  loop: boolean;
  friendly: boolean;
  updatedAt: number;
};
export type Palette = { id: string; name: string; background: string; foreground: string; accent: string; gradientEnd?: string; gradientAngle?: number };
export type Template = { id: TemplateId; name: string; category: Category; description: string; palettes: Palette[] };

const BASE_PALETTES: Palette[] = [
  { id: 'white', name: '纯白', background: '#080A12', foreground: '#FFFFFF', accent: '#70A7FF' },
  { id: 'red', name: '中国红', background: '#080808', foreground: '#FF3838', accent: '#2F7BFF' },
  { id: 'gold', name: '薯条金', background: '#1C1008', foreground: '#F5C842', accent: '#FF7749' },
  { id: 'red-blue', name: '红蓝', background: '#080A12', foreground: '#FF5A5A', accent: '#498DFF' },
  { id: 'pink', name: '霓虹粉', background: '#100916', foreground: '#FF76D5', accent: '#6DDFFF' },
];

const LIGHT_PALETTES: Palette[] = [
  ...BASE_PALETTES.map(palette => ({ ...palette, name: palette.id === 'red-blue' ? '珊瑚红' : palette.name, background: '#000000' })),
  { id: 'gradient-pink-blue', name: '粉蓝渐变', background: '#000000', foreground: '#FF76D5', accent: '#75DFFF', gradientEnd: '#75DFFF', gradientAngle: 0 },
  { id: 'gradient-sunset', name: '橙金渐变', background: '#000000', foreground: '#FF804D', accent: '#FFD86B', gradientEnd: '#FFD86B', gradientAngle: 0 },
  { id: 'gradient-ocean', name: '蓝紫渐变', background: '#000000', foreground: '#71E7FF', accent: '#7E87FF', gradientEnd: '#7E87FF', gradientAngle: 0 },
  { id: 'gradient-lime', name: '青绿渐变', background: '#000000', foreground: '#B8F66C', accent: '#65E6C4', gradientEnd: '#65E6C4', gradientAngle: 0 },
  { id: 'gradient-violet', name: '紫粉渐变', background: '#000000', foreground: '#D39BFF', accent: '#FF77B9', gradientEnd: '#FF77B9', gradientAngle: 0 },
];

export const TEMPLATES: Template[] = [
  { id: 'L3', name: '点阵灯牌', category: 'light', description: '一颗颗光点，汇成加油声', palettes: [
    { id: 'amber', name: '琥珀光点', background: '#000000', foreground: '#FFD76A', accent: '#FF784F' },
    { id: 'mint', name: '薄荷光点', background: '#000000', foreground: '#9CFFD5', accent: '#89BDFF' },
    ...LIGHT_PALETTES,
  ] },
  { id: 'L2', name: '描边灯牌', category: 'light', description: '清晰字芯，撞色轮廓', palettes: [
    { id: 'electric', name: '蓝橙电光', background: '#000000', foreground: '#FFD786', accent: '#597FFF' },
    { id: 'ice-pink', name: '粉蓝电光', background: '#000000', foreground: '#FFB8E7', accent: '#64D9FF' },
    ...LIGHT_PALETTES,
  ] },
  { id: 'L4', name: '霓虹灯牌', category: 'light', description: '柔和光晕，点亮文字', palettes: [
    { id: 'cyan-neon', name: '青色霓虹', background: '#000000', foreground: '#62F7FF', accent: '#62F7FF' },
    { id: 'pink-neon', name: '粉色霓虹', background: '#000000', foreground: '#FF76D5', accent: '#FF76D5' },
    ...LIGHT_PALETTES,
  ] },
  { id: 'L5', name: '红蓝重影', category: 'light', description: '青左上、红右下，交叠相加成白', palettes: [
    { id: 'red-cyan', name: '黑底红青', background: '#000000', foreground: '#25F4EE', accent: '#FE2C55' },
    { id: 'red-cyan-purple', name: '深紫红青', background: '#160D24', foreground: '#25F4EE', accent: '#FE2C55' },
    { id: 'red-cyan-navy', name: '藏蓝红青', background: '#071323', foreground: '#25F4EE', accent: '#FE2C55' },
  ] },
  { id: 'L1', name: '纯色灯牌', category: 'light', description: '黑底白字，简单清楚', palettes: LIGHT_PALETTES },
  { id: 'H1', name: '撞色涂鸦', category: 'banner', description: '一点不规矩，一整块热爱', palettes: [
    { id: 'cobalt', name: '蓝黄涂鸦', background: '#3355ED', foreground: '#FFF185', accent: '#FFB451' },
    { id: 'orange-blue', name: '蓝橙涂鸦', background: '#FF9D5D', foreground: '#FFF7D0', accent: '#3355ED' },
    { id: 'lavender', name: '紫绿涂鸦', background: '#7358BA', foreground: '#E9FF9B', accent: '#B5C8FF' },
  ] },
  { id: 'H2', name: '轻甜拼贴', category: 'banner', description: '奶油色和贴纸，装下喜欢', palettes: [
    { id: 'cream', name: '奶油粉蓝', background: '#FFF8E8', foreground: '#4767D5', accent: '#F5AFBE' },
    { id: 'peach', name: '蜜桃粉黄', background: '#FFE6DB', foreground: '#9A568F', accent: '#F8CD64' },
    { id: 'lilac', name: '淡紫青绿', background: '#EFE7FF', foreground: '#476C5B', accent: '#B5D4B0' },
  ] },
  { id: 'H3', name: '运动字牌', category: 'banner', description: '斜切色块，利落上场', palettes: [
    { id: 'sport', name: '橙黑赛场', background: '#F47B3F', foreground: '#FFF5DF', accent: '#232726' },
    { id: 'track', name: '绿黑跑道', background: '#C8EB6C', foreground: '#FDF9E9', accent: '#172E2B' },
    { id: 'blue-track', name: '蓝白看台', background: '#4773DB', foreground: '#FFFFFF', accent: '#1C2540' },
  ] },
];

export function getTemplate(id: TemplateId): Template {
  return TEMPLATES.find((template) => template.id === id) || TEMPLATES.find(template => template.id === 'L3')!;
}

export function createDesign(templateId: TemplateId = 'L3'): Design {
  const template = getTemplate(templateId);
  const palette = template.palettes[0];
  return {
    id: 'board-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
    text: template.category === 'light' ? DEFAULT_LIGHT_TEXT : SLOGANS.find(slogan => slogan.id === 'C003')!.text,
    templateId: template.id,
    paletteId: palette.id,
    foreground: palette.foreground,
    background: palette.background,
    accent: palette.accent,
    dotShape: 'circle',
    dotEmoji: DEFAULT_DOT_EMOJI,
    dotDensity: 2,
    glow: 65,
    fontScale: 100,
    fontId: 'sans',
    gradient: Boolean(palette.gradientEnd),
    gradientEnd: palette.gradientEnd || palette.accent,
    gradientAngle: palette.gradientAngle ?? 0,
    orientation: 'landscape',
    layout: 'single',
    sticker: template.category === 'light' ? 'none' : template.id === 'H2' ? 'heart' : 'star',
    border: template.category !== 'light',
    scroll: false,
    speed: 3,
    direction: 'left',
    loop: true,
    friendly: true,
    updatedAt: Date.now(),
  };
}
