/** Environment doctor — never prints secret values. */
import { createRequire } from 'node:module';

async function main() {
  const key = process.env.CURSOR_API_KEY?.trim();
  console.log('node', process.version);
  console.log('CURSOR_API_KEY', key ? `set (len=${key.length})` : 'NOT SET');
  console.log(
    'CURSOR_RUNTIME_REPO_URL',
    process.env.CURSOR_RUNTIME_REPO_URL ? 'set' : 'not set (no-repo proof OK)',
  );

  try {
    const require = createRequire(import.meta.url);
    const pkgPath = require.resolve('@cursor/sdk/package.json');
    const pkg = JSON.parse(await import('node:fs').then((fs) => fs.readFileSync(pkgPath, 'utf8'))) as { version?: string };
    console.log('@cursor/sdk', pkg.version || 'present');
  } catch {
    try {
      await import('@cursor/sdk');
      console.log('@cursor/sdk', 'present');
    } catch {
      console.log('@cursor/sdk', 'MISSING — run npm install');
    }
  }

  if (key) {
    try {
      const { CursorCloudClient } = await import('./cursorCloudClient.ts');
      const client = new CursorCloudClient({ apiKey: key });
      const me = await client.getMe();
      console.log(
        'api /v1/me',
        'OK',
        typeof me === 'object' ? Object.keys(me as object).slice(0, 8) : typeof me,
      );
    } catch (e) {
      console.log('api /v1/me', 'FAIL', e instanceof Error ? e.message : e);
    }
  } else {
    console.log('Skip live API check until CURSOR_API_KEY is exported.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
