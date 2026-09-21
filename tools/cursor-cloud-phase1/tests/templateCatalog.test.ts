/**
 * Website Builder template catalog filter/categories.
 * Run from tools/cursor-cloud-phase1: npm test
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TEMPLATE_CATALOG,
  availableTemplateCategories,
  filterTemplates,
  getTemplateById,
} from '../../../src/lib/website-builder/templateCatalog.ts';

describe('templateCatalog', () => {
  it('lists non-empty filter categories from catalog', () => {
    const cats = availableTemplateCategories();
    assert.ok(cats.includes('all'));
    assert.ok(cats.includes('minimal'));
    assert.ok(cats.includes('ai'));
    assert.equal(cats[0], 'all');
  });

  it('filterTemplates(all) returns full catalog', () => {
    assert.equal(filterTemplates('all').length, TEMPLATE_CATALOG.length);
  });

  it('filterTemplates(minimal) includes elementar only', () => {
    const rows = filterTemplates('minimal');
    assert.deepEqual(
      rows.map((r) => r.id),
      ['elementar'],
    );
  });

  it('getTemplateById resolves known ids', () => {
    assert.equal(getTemplateById('floral')?.id, 'floral');
    assert.equal(getTemplateById('missing'), undefined);
  });
});
