import { mkdir, rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { verifyDirectory, MAX_PACKAGE_BYTES } from './verify.mjs';
import { auditOfficialArtifact } from './audit-official.mjs';

const dist = resolve('dist');
await verifyDirectory(dist);
await auditOfficialArtifact(dist);
await mkdir('release', { recursive: true });
const archive = resolve('release/cheerboard.zip');
await rm(archive, { force: true });
execFileSync('zip', ['-q', '-r', '-X', archive, '.'], { cwd: dist });
const entries = execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' }).trim().split('\n');
if (!entries.includes('index.html') || entries.filter((entry) => /\.html$/i.test(entry)).length !== 1) {
  throw new Error('ZIP 必须只有根目录 index.html 一个 HTML 文件');
}
if (entries.some((entry) => entry.startsWith('/') || entry.split('/').includes('..'))) {
  throw new Error('ZIP 里包含非法路径');
}
execFileSync('unzip', ['-tq', archive], { stdio: 'pipe' });
const bytes = (await stat(archive)).size;
if (bytes >= MAX_PACKAGE_BYTES) throw new Error('ZIP 超过项目 2 MB 上限');
await auditOfficialArtifact(archive);
console.log(`发布包：${archive}（${(bytes / 1024).toFixed(1)} KB）`);
