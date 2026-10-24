import { parse } from 'acorn';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MAX_PACKAGE_BYTES = 2 * 1024 * 1024;

const prohibitedIdentifiers = new Set([
  'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'RTCPeerConnection',
  'webkitRTCPeerConnection', 'Worker', 'SharedWorker', 'WebAssembly', 'eval',
  'Function', 'SharedArrayBuffer', 'DeviceMotionEvent', 'DeviceOrientationEvent',
]);
const prohibitedMethods = new Set([
  'requestFullscreen', 'webkitRequestFullscreen', 'webkitEnterFullscreen',
  'mozRequestFullScreen', 'msRequestFullscreen', 'sendBeacon',
]);

function fail(message) {
  throw new Error(`发布检查失败：${message}`);
}

async function filesIn(directory) {
  const files = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, item.name);
    if (item.isSymbolicLink()) fail(`不允许符号链接：${path}`);
    if (item.isDirectory()) files.push(...await filesIn(path));
    else if (item.isFile()) files.push(path);
  }
  return files;
}

function memberName(node) {
  if (node.type !== 'MemberExpression') return '';
  if (!node.computed && node.property.type === 'Identifier') return node.property.name;
  if (node.computed && node.property.type === 'Literal') return String(node.property.value);
  return '';
}

function isIdentifier(node, name) {
  return node?.type === 'Identifier' && node.name === name;
}

function checkJavaScript(source, file) {
  let tree;
  try {
    tree = parse(source, { ecmaVersion: 2017, sourceType: 'script', locations: true });
  } catch (error) {
    fail(`${file} 不符合 ES2017 classic script：${error.message}`);
  }
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'Identifier' && prohibitedIdentifiers.has(node.name)) {
      fail(`${file}:${node.loc.start.line} 出现禁止的 API ${node.name}`);
    }
    if (node.type === 'MemberExpression') {
      const name = memberName(node);
      if (prohibitedIdentifiers.has(name) || prohibitedMethods.has(name)) {
        fail(`${file}:${node.loc.start.line} 出现禁止的 API ${name}`);
      }
      if ((name === 'clipboard' || name === 'geolocation' || name === 'serviceWorker') &&
        isIdentifier(node.object, 'navigator')) {
        fail(`${file} 不允许 navigator.${name}`);
      }
      if (name === 'open' && isIdentifier(node.object, 'window')) fail(`${file} 不允许 window.open`);
      if (name === 'lock' && memberName(node.object) === 'orientation') fail(`${file} 不允许锁定屏幕方向`);
    }
    if (node.type === 'Literal' && typeof node.value === 'string' && /(?:https?|wss?):\/\//i.test(node.value)) {
      fail(`${file} 包含外部网络地址`);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  };
  visit(tree);
}

async function checkResource(reference, fromFile, root, allowData = false) {
  if (allowData && /^data:(?:image\/|font\/)/i.test(reference)) return;
  if (!reference || reference.startsWith('#')) return;
  if (/^(?:[a-z][a-z\d+.-]*:|\/)/i.test(reference)) fail(`资源必须使用本地相对路径：${reference}`);
  const clean = reference.split(/[?#]/)[0];
  let decoded;
  try { decoded = decodeURIComponent(clean); } catch { fail(`无法解析资源路径：${reference}`); }
  const destination = resolve(dirname(fromFile), decoded);
  if (relative(root, destination).split(sep).includes('..')) fail(`资源逃逸发布目录：${reference}`);
  try {
    if (!(await stat(destination)).isFile()) fail(`资源不是文件：${reference}`);
  } catch { fail(`资源不存在：${reference}`); }
}

export async function verifyDirectory(directory = resolve('dist')) {
  const root = directory instanceof URL ? fileURLToPath(directory) : resolve(directory);
  const files = await filesIn(root);
  const allowedExtensions = new Set(['.html', '.css', '.js', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.woff', '.woff2', '.json']);
  const htmlFiles = files.filter((file) => extname(file).toLowerCase() === '.html');
  if (htmlFiles.length !== 1 || htmlFiles[0] !== resolve(root, 'index.html')) {
    fail('只能有根目录 index.html 一个 HTML 文件');
  }
  let totalBytes = 0;
  for (const file of files) {
    if (!allowedExtensions.has(extname(file).toLowerCase())) fail(`不支持的发布文件：${relative(root, file)}`);
    totalBytes += (await stat(file)).size;
  }
  if (totalBytes >= MAX_PACKAGE_BYTES) fail(`未压缩资源 ${(totalBytes / 1024).toFixed(1)} KB，超过项目 2 MB 目标`);

  const index = resolve(root, 'index.html');
  const html = await readFile(index, 'utf8');
  if (/<(?:iframe|object|embed|base)\b/i.test(html)) fail('HTML 含不允许的嵌入或 base 元素');
  if (/\bon[a-z]+\s*=/i.test(html)) fail('HTML 含内联事件处理器');
  if (/\b(?:crossorigin|download)\b(?:\s*=|\s|>)/i.test(html)) fail('HTML 含 crossorigin 或下载属性');
  if (/\btarget\s*=\s*["']?_blank/i.test(html)) fail('HTML 不允许打开新窗口');
  if (/\b(?:modulepreload|type\s*=\s*["']module)/i.test(html)) fail('HTML 不能依赖 ES module');
  if (/<form\b[^>]*\baction\s*=/i.test(html)) fail('HTML 不允许表单跳转');
  const scriptTags = Array.from(html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi));
  if (scriptTags.length !== 1) fail('发布页必须恰好加载一个外置 classic script');
  for (const match of scriptTags) {
    const src = match[1].match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    if (!src || match[2].trim()) fail('禁止内联 script');
    const type = match[1].match(/\btype\s*=\s*["']([^"']+)["']/i);
    if (type && !['text/javascript', 'application/javascript'].includes(type[1])) fail('脚本类型必须为 classic');
    await checkResource(src[1], index, root);
  }
  for (const match of html.matchAll(/\b(?:src|href|poster)\s*=\s*["']([^"']+)["']/gi)) {
    await checkResource(match[1], index, root, true);
  }

  let jsCount = 0;
  let cssCount = 0;
  for (const file of files) {
    if (extname(file) === '.js') {
      jsCount += 1;
      checkJavaScript(await readFile(file, 'utf8'), relative(root, file));
    } else if (extname(file) === '.css') {
      cssCount += 1;
      const css = await readFile(file, 'utf8');
      if (/@import\b/i.test(css)) fail('CSS 不允许 @import');
      for (const match of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
        await checkResource(match[1].trim(), file, root, true);
      }
    } else if (extname(file) === '.svg') {
      const svg = await readFile(file, 'utf8');
      if (/<script\b|\bon[a-z]+\s*=|(?:https?|wss?):\/\//i.test(svg.replace(/xmlns=["'][^"']*["']/g, ''))) {
        fail('SVG 含可执行内容或远程地址');
      }
    }
  }
  if (jsCount !== 1 || cssCount !== 1) fail('发布包必须只有一个 JS 和一个 CSS 文件');
  console.log(`发布检查通过：1 HTML / 1 classic IIFE JS / 1 CSS；ES2017、相对资源、离线 API；${(totalBytes / 1024).toFixed(1)} KB`);
  return { bytes: totalBytes, files: files.map((file) => relative(root, file)) };
}

const calledDirectly = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (calledDirectly) {
  const directory = process.argv[2] || 'dist';
  if (!isAbsolute(directory) && directory.startsWith('-')) fail('目录参数不能以 - 开头');
  await verifyDirectory(directory);
}
