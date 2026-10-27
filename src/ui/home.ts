import type { Category, Design } from '../catalog.ts';
import { button, escapeHTML, icon } from './primitives.ts';

export type HomeOptions = {
  category: Category;
  records: Design[];
  draft: Design | null;
  recordsReady: boolean;
  recordsError: boolean;
};

function brandLogo(): string {
  return '<img class="cb-logo cb-logo-original" src="./artwork/design-brand.webp" alt="" aria-hidden="true" width="806" height="197">';
}

function bannerArtwork(): string {
  return '<img class="cb-banner-art" src="./artwork/design-banner.webp" alt="" aria-hidden="true" width="545" height="290">';
}

function recordDate(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return '时间未记录';
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '时间未记录';
  const today = new Date();
  if (date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate()) {
    return '今天 ' + String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
  }
  return (date.getFullYear() === today.getFullYear() ? '' : date.getFullYear() + '年')
    + (date.getMonth() + 1) + '月' + date.getDate() + '日';
}

function recordCard(design: Design, draft: boolean): string {
  const label = design.text.replace(/\s*\n\s*/g, ' ').trim() || '还没写下的文案';
  const id = escapeHTML(design.id);
  const title = escapeHTML(label);
  const canvasData = draft ? 'data-home-draft' : `data-record="${id}"`;
  return `<article class="cb-record-card${draft ? ' cb-record-card--draft' : ''}">${button(`<span class="cb-record-preview"><canvas ${canvasData} aria-label="${title}预览"></canvas></span><span class="cb-record-info"><strong class="cb-record-name">${title}</strong><span class="cb-record-date">${draft ? '草稿 · ' : ''}${recordDate(design.updatedAt)}</span></span>`, draft ? 'resume-draft' : 'open', 'cb-record-open', `data-id="${id}" aria-label="继续编辑：${title}"`)}${button(icon('ellipsis'), 'record-menu', 'cb-record-menu', `data-id="${id}"${draft ? ' data-draft="true"' : ''} aria-label="更多操作：${title}" aria-haspopup="menu"`)}</article>`;
}

export function renderHome({ category, records, draft, recordsReady, recordsError }: HomeOptions): string {
  const cards = records.slice(0, 3).map(design => ({ design, draft: false }));
  if (cards.length < 3 && draft && !records.some(record => record.id === draft.id)) cards.push({ design: draft, draft: true });
  const light = category === 'light';
  const startLabel = light ? '开始制作灯牌' : '开始制作手幅';
  const count = recordsReady || records.length || recordsError ? String(records.length) : '…';
  const collection = cards.length
    ? `<div class="cb-record-grid">${cards.map(card => recordCard(card.design, card.draft)).join('')}</div>`
    : recordsError
      ? `<div class="cb-home-empty cb-home-empty--error"><span class="cb-empty-symbol" aria-hidden="true">${icon('bookmark')}</span><h3>暂时无法读取你的牌</h3><p>可以先制作新牌，或重新读取本地存档。</p>${button('重新读取', 'reload-records', 'secondary-button')}</div>`
      : `<div class="cb-home-empty${recordsReady ? '' : ' cb-home-empty--loading'}"><span class="cb-empty-symbol" aria-hidden="true">${icon('bookmark')}</span><h3>${recordsReady ? '第一块牌，留给今天的喜欢' : '正在取出你的牌'}</h3><p>${recordsReady ? '写下想说的话，做好后保存到这里。' : '已有的作品会在读取后显示。'}</p></div>`;
  const busy = !recordsReady && !recordsError;
  return `<main class="cb-home" data-category="${category}"><header class="cb-home-header"><h1 class="cb-brand"><span class="cb-sr-only">CHEERBOARD 举个牌</span>${brandLogo()}</h1>${button(icon('bell'), 'tips', 'cb-home-settings cb-home-reminder', 'aria-label="使用提醒与场馆提示"')}</header><div class="cb-home-categories" role="group" aria-label="选择制作类型">${button(icon('bulb') + '<span>灯牌</span>', 'home-category', `cb-home-category cb-home-category--light${light ? ' cb-home-category--selected' : ''}`, `data-id="light" aria-pressed="${light}"`)}${button(icon('banner') + '<span>手幅</span>', 'home-category', `cb-home-category cb-home-category--banner${light ? '' : ' cb-home-category--selected'}`, `data-id="banner" aria-pressed="${!light}"`)}</div><section class="cb-home-hero${light ? ' cb-home-hero--art' : ' cb-home-hero--banner'}" aria-label="${light ? '灯牌' : '手幅'}效果预览">${light ? '<img class="cb-home-hero-asset" src="./artwork/design-hero.webp" width="830" height="443" alt="孙颖莎加油荧光灯牌示例">' : '<div class="cb-hero-board"><canvas class="cb-hero-canvas" id="hero-board" aria-label="手幅预览"></canvas></div>'}${button('<span>开始制作</span>' + icon('arrow'), 'home-start', 'cb-home-start', `aria-label="${startLabel}"`)}</section><section class="cb-home-records" aria-labelledby="cb-my-boards" aria-busy="${busy}"><div class="cb-records-heading"><h2 id="cb-my-boards">我的牌<span class="cb-record-count" aria-label="${recordsReady || records.length || recordsError ? records.length + '块已保存的牌' : '正在读取已保存的牌'}">${count}</span></h2>${button('<span>最近编辑</span>' + icon('chevron-right', 'cb-records-chevron'), 'saved', 'cb-records-recent')}</div>${collection}</section><section class="cb-banner-promo" aria-label="试试手幅">${bannerArtwork()}<div class="cb-banner-copy"><h2>用手幅<br>传递更大的心意</h2>${button('<span>试试手幅</span>' + icon('arrow'), 'template', 'cb-banner-cta', 'data-id="H1"')}</div></section></main>`;
}
