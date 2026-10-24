export type Category = 'light' | 'banner';
export type TemplateId = 'L1' | 'L2' | 'L3' | 'H1' | 'H2' | 'H3';
export type Design = {
  id: string;
  text: string;
  templateId: TemplateId;
  paletteId: string;
  foreground: string;
  background: string;
  layout: 'single' | 'double';
  sticker: 'star' | 'heart' | 'fries' | 'none';
  border: boolean;
  scroll: boolean;
  speed: number;
  direction: 'left' | 'right';
  loop: boolean;
  friendly: boolean;
  updatedAt: number;
};
export type Palette = { id: string; name: string; background: string; foreground: string; accent: string };
export type Template = { id: TemplateId; name: string; category: Category; description: string; palettes: Palette[] };

const BASE_PALETTES: Palette[] = [
  { id: 'white', name: '纯白', background: '#080A12', foreground: '#FFFFFF', accent: '#70A7FF' },
  { id: 'red', name: '中国红', background: '#080808', foreground: '#FF3838', accent: '#2F7BFF' },
  { id: 'gold', name: '薯条金', background: '#1C1008', foreground: '#F5C842', accent: '#FF7749' },
  { id: 'red-blue', name: '红蓝', background: '#080A12', foreground: '#FF5A5A', accent: '#498DFF' },
  { id: 'pink', name: '霓虹粉', background: '#100916', foreground: '#FF76D5', accent: '#6DDFFF' },
];

export const TEMPLATES: Template[] = [
  { id: 'L1', name: '清晰大字', category: 'light', description: '厚实字芯，简单有力', palettes: BASE_PALETTES },
  { id: 'L2', name: '彩色描边', category: 'light', description: '撞色轮廓，把心意点亮', palettes: [
    { id: 'electric', name: '蓝橙电光', background: '#080D24', foreground: '#FFD786', accent: '#597FFF' },
    { id: 'ice-pink', name: '粉蓝电光', background: '#120D23', foreground: '#FFB8E7', accent: '#64D9FF' },
    ...BASE_PALETTES,
  ] },
  { id: 'L3', name: '点阵灯牌', category: 'light', description: '一颗颗光点，汇成加油声', palettes: [
    { id: 'amber', name: '琥珀光点', background: '#10100D', foreground: '#FFD76A', accent: '#FF784F' },
    { id: 'mint', name: '薄荷光点', background: '#071915', foreground: '#9CFFD5', accent: '#89BDFF' },
    ...BASE_PALETTES,
  ] },
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

const BASELINE_SOURCE = '执行版 v2 · 第 4 节，Jeremy 已确认基线';
export const SLOGANS: { text: string; category: string; confirmed: boolean; source: string }[] = [
  ...['加油', '可以', '相信自己', 'China', '雄起', 'Fighting'].map((text) => ({ text, category: '通用', confirmed: true, source: BASELINE_SOURCE })),
  ...['王楚钦加油', '孙颖莎加油', '莎莎加油', '莎头加油', 'lion heart', 'WCQ', 'SYS'].map((text) => ({ text, category: '选手及组合', confirmed: true, source: BASELINE_SOURCE })),
  ...['5114', '🍟'].map((text) => ({ text, category: '数字与符号', confirmed: true, source: BASELINE_SOURCE })),
];

export function getTemplate(id: TemplateId): Template {
  return TEMPLATES.find((template) => template.id === id) || TEMPLATES[3];
}

export function createDesign(templateId: TemplateId = 'H1'): Design {
  const template = getTemplate(templateId);
  const palette = template.palettes[0];
  return {
    id: 'board-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
    text: template.category === 'light' ? '王楚钦加油' : '孙颖莎加油',
    templateId: template.id,
    paletteId: palette.id,
    foreground: palette.foreground,
    background: palette.background,
    layout: 'single',
    sticker: template.id === 'H2' ? 'heart' : template.id === 'L1' ? 'none' : 'star',
    border: true,
    scroll: false,
    speed: 3,
    direction: 'left',
    loop: true,
    friendly: true,
    updatedAt: Date.now(),
  };
}
