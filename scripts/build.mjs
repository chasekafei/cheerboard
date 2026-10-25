import { build } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
import { verifyDirectory } from './verify.mjs';
import { auditOfficialArtifact } from './audit-official.mjs';

await build();

const source = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const moduleEntry = /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']\/?src\/main\.ts["'][^>]*>\s*<\/script>/i;
if (!moduleEntry.test(source)) {
  throw new Error('index.html 缺少开发入口 <script type="module" src="/src/main.ts"></script>');
}

const html = source
  .replace(moduleEntry, '<script src="./assets/app.js" defer></script>')
  .replace('</head>', '  <link rel="stylesheet" href="./assets/app.css">\n</head>');

await writeFile(new URL('../dist/index.html', import.meta.url), html);
await verifyDirectory(new URL('../dist/', import.meta.url));
await auditOfficialArtifact(new URL('../dist/', import.meta.url));
