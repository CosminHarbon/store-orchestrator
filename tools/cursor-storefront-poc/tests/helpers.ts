import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export async function tmpDir(prefix = 'sv-poc-'): Promise<string> {
  // realpath: macOS tmpdir is a symlink (/var → /private/var); the policy resolves real paths.
  return fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), prefix)));
}

export async function write(dir: string, rel: string, content = 'x\n'): Promise<void> {
  const abs = path.join(dir, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, 'utf8');
}

/** A tiny stand-in template (no dependencies) for fast pipeline tests. */
export async function makeFakeTemplate(): Promise<string> {
  const dir = await tmpDir('sv-tpl-');
  await write(dir, 'package.json', '{"name":"t","private":true}\n');
  await write(dir, 'index.html', '<div id="root"></div>\n');
  await write(dir, 'vite.config.ts', 'export default {};\n');
  await write(dir, 'tsconfig.json', '{}\n');
  await write(dir, 'src/main.tsx', '// protected\n');
  await write(dir, 'src/speedvendors/commerce.ts', '// protected commerce\n');
  await write(dir, 'src/speedvendors/index.ts', '// protected\n');
  await write(dir, 'src/storefront/App.tsx', 'export default function App() { return null; }\n');
  await write(dir, 'src/components/Header.tsx', '// header\n');
  await write(dir, 'src/styles/storefront.css', 'body{}\n');
  await write(dir, 'public/favicon.svg', '<svg/>\n');
  return dir;
}

export async function cleanup(...dirs: string[]): Promise<void> {
  for (const d of dirs) await fs.rm(d, { recursive: true, force: true });
}
