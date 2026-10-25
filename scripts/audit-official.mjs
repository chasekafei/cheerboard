import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const skill = new URL('../.codex/minitool-zip-builder/', import.meta.url);

export async function auditOfficialArtifact(target) {
  let metadata;
  try {
    metadata = JSON.parse(await readFile(new URL('skill-package.json', skill), 'utf8'));
  } catch {
    throw new Error('缺少官方 minitool-zip-builder Skill；请按上传页口令解压到工作区 .codex/ 后再打包。');
  }
  if (metadata.name !== 'minitool-zip-builder' || metadata.version !== '1.8.0') {
    throw new Error('本轮构建固定使用上传页指定的 minitool-zip-builder 1.8.0，请核对 Skill 版本。');
  }
  const path = target instanceof URL ? fileURLToPath(target) : resolve(target);
  const result = execFileSync(process.execPath, [fileURLToPath(new URL('scripts/audit_artifact.mjs', skill)), path], { encoding: 'utf8' });
  console.log(`官方 Skill ${metadata.version} 体积审计：${relative(process.cwd(), path)}`);
  process.stdout.write(result);
  return result.trim();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  for (const target of process.argv.slice(2).length ? process.argv.slice(2) : ['dist', 'release/cheerboard.zip']) {
    await auditOfficialArtifact(target);
  }
}
