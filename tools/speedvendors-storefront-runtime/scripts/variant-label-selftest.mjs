import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const runtimeRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(runtimeRoot, '../..');
const outdir = join(repoRoot, '.tmp/variant-label-selftest');
mkdirSync(outdir, { recursive: true });
const entry = join(outdir, 'entry.mjs');
writeFileSync(
  entry,
  `export {
  resolveVariantOptionLabel,
  formatCartVariantLine,
  selectOptionPrompt,
} from '../../tools/speedvendors-storefront-runtime/src/speedvendors/variantLabel.ts';`,
);
const outfile = join(outdir, 'bundle.mjs');
await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile });
const mod = await import(pathToFileURL(outfile).href + '?t=' + Date.now());

const colourProduct = {
  id: '1',
  title: 'Lamp',
  description: '',
  price: { amount: 10, currency: 'RON' },
  compareAtPrice: null,
  images: [],
  categoryId: '',
  inStock: true,
  optionNames: ['Colour'],
  variants: [{ id: 'v1', label: 'Oak', inStock: true, optionName: 'Colour' }],
};
assert.equal(mod.resolveVariantOptionLabel(colourProduct), 'Colour');
assert.equal(mod.selectOptionPrompt(colourProduct), 'Select a Colour');
assert.equal(mod.formatCartVariantLine('Oak', 'Colour'), 'Colour Oak');

const bare = {
  ...colourProduct,
  optionNames: [],
  variants: [{ id: 'v1', label: 'XL', inStock: true }],
};
assert.equal(mod.resolveVariantOptionLabel(bare), 'Option');
assert.equal(mod.selectOptionPrompt(bare), 'Select an option');
assert.equal(mod.formatCartVariantLine('XL', null), 'XL');

console.log('VARIANT_LABEL_SELFTEST_OK');
