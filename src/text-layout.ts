import { SLOGANS } from './slogans.ts';
import { DEFAULT_LIGHT_TEXT } from './design-values.ts';

// A prefix is the first display line; null deliberately keeps a complete short
// phrase/name together, or defers to the source's explicit newlines. These rules
// are display metadata: the reviewed slogan text is never rewritten.
export const SLOGAN_BREAK_PREFIXES: Readonly<Record<string, string | null>> = {
  C166: null, C167: null, C168: null,
  C001: null, C002: null, C003: null, C004: null, C005: null, C006: null,
  C007: '我们', C008: null, C009: null, C010: '痛苦之上', C011: '今天的太阳',
  C012: null, C013: null, C014: '当身体达到了极限', C015: '谁敢横刀立马',
  C016: '赫杯之上', C017: '如我面对太阳，', C018: '钦尽全力', C019: '目标',
  C020: 'Sun &', C021: null, C022: null, C023: null, C024: 'One',
  C025: null, C026: '乒超撐', C027: 'welcome to', C028: '努力', C029: '专注',
  C030: null, C031: '我好钟意', C032: '希望我哋', C033: null, C034: '你们在',
  C035: null, C036: '楚钦', C037: '看你们打球', C038: '莎头', C039: null,
  C040: null, C041: 'LOVE FOR', C042: 'LOVE FOR', C043: null, C044: null,
  C045: null, C046: null, C047: null, C048: '追着光生长、', C049: '聚沙成塔、',
  C050: null, C051: '保持热爱，', C052: '感谢你', C053: null, C054: null,
  C055: null, C056: null, C057: null, C058: null, C059: null, C060: null,
  C061: null, C062: '镌刻的是', C063: null, C064: 'Keep', C065: null,
  C066: '王楚钦加油', C067: null, C068: '竭尽全力', C069: null, C070: null,
  C071: '乒乓世界迷人眼，', C072: 'ALL FOR', C073: '王楚钦你最棒，', C074: 'ALL FOR',
  C075: '莎莎', C076: '他说', C077: '拥有你们', C078: '钦听幸福的声音',
  C079: '养只猫猫', C080: '你告诉他们', C081: '一颗真心', C082: null,
  C083: '愛是两颗相擁的', C084: '我们心脏同频', C085: '東京的雨', C086: '家有',
  C087: '颤抖的镜头', C088: '他们质疑真心', C089: '这一次', C090: '想用手机记录你',
  C091: '邓布利多 你说的对', C092: '镜头翻转', C093: '好微妙啊', C094: '莎莎的',
  C095: '这枚金牌', C096: '我俩说打冠军', C097: '这次她也心甘情愿', C098: null,
  C099: '你不会过了五年', C100: '天才', C101: '注意称呼', C102: '九珍',
  C103: '你是世界上', C104: '叫谁', C105: '他老爱', C106: '赢了',
  C107: '杭州', C108: '我们', C109: '回去请吃饭吧', C110: '新的开始',
  C111: '他在我身边', C112: '坚定昂！', C113: '我们两个是从无到有',
  C114: '我搭档呢 也挺可爱的', C115: '残缺的玉叫做王', C116: '什么年少轻狂',
  C117: '别定义我', C118: '实力一直有', C119: '25岁', C120: '议论我有什么用',
  C121: '我从先农台来', C122: '不为盛名而来，', C123: '明亮的心将指引着她',
  C124: '开了花的', C125: '拼了命的', C126: '许一个左手奇迹', C127: '用一颗心脏',
  C128: '南阳十二颠', C129: '祖国荣誉', C130: '少年没有乌托邦', C131: '一切都是',
  C132: '赢了', C133: '聚沙成塔', C134: null, C135: '太阳永不坠落', C136: '与你',
  C137: null, C138: '那就祝我们都有光明的未来', C139: '眼神注视的方向',
  C140: '同频共振的人', C141: '坚持你所热爱的，', C142: '她是烈焰，', C143: null,
  C144: '希望你能学会快乐', C145: '愿我的人生', C146: null, C147: 'TEAM',
  C148: '你不要低估一颗 胜利者 的心，', C149: 'AS I FACING', C150: 'AS I CHASING',
  C151: '山河楚天阔，', C152: '混双', C153: '八年确实和', C154: '闪耀',
  C155: '重庆的“重”是重逢的“重”', C156: '钦尽全力', C157: '莎出重围',
  C158: '球不落地', C159: 'never', C160: '风从青奥起', C161: '两个人相互辉映，',
  C162: '良人扶我青云志，', C163: '爱是赛场上', C164: '在天才云集的天坛东路',
  C165: '布宜诺斯艾利斯刮起的青春风暴',
};

export const VARIANT_BREAK_PREFIXES: Readonly<Record<string, string | null>> = {
  '孙颖莎加油': null, 莎莎加油: null, '王楚钦加油': null, 楚钦加油: null,
  中国队加油: null, '中国乒乓球队！加油！': null, 中国乒乓球队加油: null,
  'Sun.Y.S.': null, SunYingsha: null, SUNYINGSHA: null, 'CHINA SUN Y.S.': 'CHINA',
  'Sun YingSha': null, 'Sun Y.S.': null, 莎: null,
  'Wang.C.Q': null, WangChuqin: null, WANGCHUQIN: null, 钦: null,
  'BE FIRM AND CONFIDENT': 'BE FIRM', 相信自己: null,
  来日方长: null, '我们 来日方长': '我们',
  'Beyond pain lies the dawn.': 'Beyond pain', 'ABOVE THE PAIN LIES THE DAWN': 'ABOVE THE PAIN',
  'The sun is bigger today than it was yesterday': 'The sun is bigger today',
  Sunhope: null, SUNHOPE: null, 'SUN\nHOPE': null, 'SUN AND HOPE': 'SUN AND',
  '少年热血，顶峰相见': '少年热血，', 'Glow with your effort': 'Glow with',
  'Stay focused, stay humble': 'Stay focused,', sun: null,
  '颖莎楚钦 我好喜欢你们啊': '颖莎楚钦', 莎莎楚钦: '莎莎', 颖莎楚钦: '颖莎',
  SHATOU: null, 'SUNYINGSHA&WANGCHUQIN': 'SUNYINGSHA&',
  '楚钦颖莎\n看你们打球好幸福': null, '看你们打球 超级幸福啊': '看你们打球',
  '楚钦颖莎 看你们打球好幸福': '楚钦颖莎', 'FIGH\nTING': null, fighting: null,
  'GROW TOWARD THE LIGHT\nBECOME YOUR OWN SUN': null, 专注自己的热爱: '专注自己的',
  '孙颖莎\n生日快乐': null, 'Happy Birthday': 'Happy', '生日快乐～': null,
  'HAPPY BIRTHDAY\n生日快乐': null, 'HAPPY BIRTHDAY': 'HAPPY',
  '2000.11.04': null, 'WIN UNTIL THEY GET USED TO IT': 'WIN UNTIL THEY',
  中国乒乓球男队队长: '中国乒乓球', 'CAPTAIN KING': 'CAPTAIN',
  '我们未来\n继续努力': null, 明亮的心指引着胜利: '明亮的心',
  '明亮的心 将指引着她 把胜利带回': '明亮的心 将指引着她',
  '许一个左手的奇迹，续一个右手的荣耀': '许一个左手的奇迹，',
  '少年没有乌托邦 心向骄阳自明朗': '少年没有乌托邦',
  'Share the glory with you': 'Share the glory',
  '希望你学会快乐 未来见': '希望你学会快乐', '学会快乐 未来见': '学会快乐',
  我的人生没有极限: '我的人生', '给你发了八年确实和发了八天的不一样': '给你发了八年',
  '风从青奥起，吹到洛杉矶': '风从青奥起，', '良人扶我青云志 相逢已是上上签': '良人扶我青云志',
};

const reviewed = new Map<string, string | null>([[DEFAULT_LIGHT_TEXT, '点击屏幕']]);
for (const slogan of SLOGANS) {
  if (Object.prototype.hasOwnProperty.call(SLOGAN_BREAK_PREFIXES, slogan.id)) reviewed.set(slogan.text, SLOGAN_BREAK_PREFIXES[slogan.id]);
  for (const variant of slogan.variants) {
    if (Object.prototype.hasOwnProperty.call(VARIANT_BREAK_PREFIXES, variant)) reviewed.set(variant, VARIANT_BREAK_PREFIXES[variant]);
  }
}

function graphemes(text: string): string[] {
  const result: string[] = [];
  let regional = false;
  for (const character of Array.from(text)) {
    const code = character.codePointAt(0) || 0;
    const previous = result[result.length - 1] || '';
    const flag = code >= 0x1f1e6 && code <= 0x1f1ff;
    const extension = code === 0x200d || /\u200d$/.test(previous) || code === 0xfe0f || code === 0xfe0e
      || (code >= 0x300 && code <= 0x36f) || (code >= 0x1f3fb && code <= 0x1f3ff) || (flag && regional);
    if (result.length && extension) result[result.length - 1] += character;
    else result.push(character);
    regional = flag && !regional;
  }
  return result;
}

const protectedPhrases = ['来日方长', '全力以赴', '坚定自信', '健康涨球', '顶峰相见', '孙颖莎', '王楚钦',
  '莎出重围', '钦尽全力', '未来可期', '一路繁花', '平安健康', '永不放弃', '胜者为王', '洛杉矶', '布宜诺斯艾利斯'];

function customLines(text: string): string[] {
  const parts = graphemes(text);
  if (parts.length <= 4) return [text];
  const protectedRanges: Array<[number, number]> = [];
  for (const phrase of protectedPhrases) {
    let at = text.indexOf(phrase);
    while (at >= 0) { protectedRanges.push([at, at + phrase.length]); at = text.indexOf(phrase, at + phrase.length); }
  }
  let offset = 0;
  let best = -1;
  let bestScore = Infinity;
  for (let index = 1; index < parts.length; index++) {
    offset += parts[index - 1].length;
    if (protectedRanges.some(([start, end]) => offset > start && offset < end)) continue;
    const before = parts[index - 1];
    const after = parts[index];
    if (/[A-Za-z\d]$/.test(before) && /^[A-Za-z\d]/.test(after)) continue;
    if (/^[，。！？、,.!?;；:：）】”’]/.test(after) || /[（【“‘]$/.test(before)) continue;
    const punctuation = /[，。！？、,.!?;；:：]$/.test(before);
    const space = /\s/.test(before) || /\s/.test(after);
    const score = Math.abs(index - parts.length / 2) - (punctuation ? 0.3 : space ? 0.2 : 0) * parts.length;
    if (score < bestScore) { best = index; bestScore = score; }
  }
  return best < 0 ? [text] : [parts.slice(0, best).join('').trim(), parts.slice(best).join('').trim()];
}

export function getTextLines(text: string, layout: 'single' | 'double'): string[] {
  if (!text.trim()) return ['加油'];
  const normalized = text.replace(/\r\n?/g, '\n');
  if (layout === 'single') return [normalized.trim().replace(/\n/g, ' ')];
  if (normalized.includes('\n')) return normalized.split('\n');
  const clean = normalized.trim();
  if (reviewed.has(clean)) {
    const prefix = reviewed.get(clean);
    if (prefix === null) return [clean];
    if (prefix && clean.startsWith(prefix)) return [prefix.replace(/\s+$/, ''), clean.slice(prefix.length).replace(/^\s+/, '')];
  }
  return customLines(clean);
}
