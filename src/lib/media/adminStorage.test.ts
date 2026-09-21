import assert from 'node:assert/strict';
import { compressionPercent, groupProductStorage, type ProductStorageRow } from './adminStorage';
import { formatBytes } from './constants';

const MB = 1024 * 1024;
const KB = 1024;

const row = (over: Partial<ProductStorageRow>): ProductStorageRow => ({
  product_id: 'p1',
  product_title: 'Nike Air Max',
  asset_id: crypto.randomUUID(),
  product_image_id: null,
  public_url: null,
  is_primary: null,
  display_order: null,
  original_size_bytes: null,
  stored_size_bytes: 0,
  quota_size_bytes: 0,
  saved_bytes: 0,
  status: 'active',
  ...over,
});

// Nike Air Max: image 1 5.2 MB -> 1.1 MB, image 2 3.8 MB -> 760 KB
const o1 = Math.round(5.2 * MB);
const s1 = Math.round(1.1 * MB);
const o2 = Math.round(3.8 * MB);
const s2 = 760 * KB;
const groups = groupProductStorage([
  row({ original_size_bytes: o1, stored_size_bytes: s1, quota_size_bytes: o1, saved_bytes: o1 - s1 }),
  row({ original_size_bytes: o2, stored_size_bytes: s2, quota_size_bytes: o2, saved_bytes: o2 - s2 }),
]);
assert.equal(groups.length, 1);
const g = groups[0];
assert.equal(g.images.length, 2);
assert.equal(g.quotaBytes, o1 + o2, 'product quota/original total');
assert.equal(g.storedBytes, s1 + s2, 'product stored total');
assert.equal(g.savedBytes, o1 + o2 - s1 - s2, 'product saved total');
assert.equal(formatBytes(g.quotaBytes, 2), '9 MB');
assert.equal(formatBytes(g.storedBytes, 2), '1.84 MB');
assert.equal(compressionPercent(g.measuredQuotaBytes, g.measuredStoredBytes), 79.5);

// Legacy rows: counted in totals, excluded from the compression basis, never reported as savings.
const mixed = groupProductStorage([
  row({ original_size_bytes: 5 * MB, stored_size_bytes: 1 * MB, quota_size_bytes: 5 * MB, saved_bytes: 4 * MB }),
  row({ original_size_bytes: null, stored_size_bytes: 3 * MB, quota_size_bytes: 3 * MB, saved_bytes: 0 }),
])[0];
assert.equal(mixed.legacyImages, 1);
assert.equal(mixed.quotaBytes, 8 * MB);
assert.equal(mixed.storedBytes, 4 * MB);
assert.equal(mixed.savedBytes, 4 * MB);
assert.equal(compressionPercent(mixed.measuredQuotaBytes, mixed.measuredStoredBytes), 80);

// Products are separated, unattributed media kept apart, biggest quota first.
const split = groupProductStorage([
  row({ product_id: 'a', quota_size_bytes: 1, stored_size_bytes: 1 }),
  row({ product_id: 'b', quota_size_bytes: 9, stored_size_bytes: 1 }),
  row({ product_id: null, product_title: null, quota_size_bytes: 5, stored_size_bytes: 1 }),
]);
assert.deepEqual(split.map((x) => x.productId), ['b', null, 'a']);

assert.equal(compressionPercent(0, 0), null);
assert.equal(compressionPercent(100, 250), 0, 'stored > quota never yields negative savings');

console.log('admin storage analytics tests passed');
