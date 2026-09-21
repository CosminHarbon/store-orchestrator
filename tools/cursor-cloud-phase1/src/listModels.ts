/** List Cloud Agent models available to this API key. */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCursorCloudClientFromEnv } from './cursorCloudClient.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const client = createCursorCloudClientFromEnv();
  const models = await client.listModels();
  const outDir = path.resolve(__dirname, '../.proof-output');
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'models.json'), JSON.stringify(models, null, 2));
  const list = (models.items || models.models || []) as Array<{ id?: string }>;
  console.log(
    JSON.stringify(
      {
        defaultModelId: models.defaultModelId ?? null,
        count: list.length,
        ids: list.map((m) => m.id).filter(Boolean),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
