import assert from 'node:assert/strict';
import {
  COMPRESS_PRESETS,
  HARD_OBJECT_LIMIT_BYTES,
  MEDIA_QUOTA_BYTES,
  computeFitSize,
  extensionForMime,
  formatBytes,
  mediaQuotaBytesForTier,
} from './constants';

assert.deepEqual(computeFitSize(100, 100, 2000), { width: 100, height: 100 });
assert.deepEqual(computeFitSize(4000, 2000, 2000), { width: 2000, height: 1000 });
assert.deepEqual(computeFitSize(800, 4000, 2000), { width: 400, height: 2000 });

assert.equal(mediaQuotaBytesForTier('start'), MEDIA_QUOTA_BYTES.start);
assert.equal(mediaQuotaBytesForTier('growth'), MEDIA_QUOTA_BYTES.growth);
assert.equal(mediaQuotaBytesForTier('scale'), MEDIA_QUOTA_BYTES.scale);
assert.equal(mediaQuotaBytesForTier(null), MEDIA_QUOTA_BYTES.start);
assert.equal(MEDIA_QUOTA_BYTES.start, 2147483648);
assert.equal(MEDIA_QUOTA_BYTES.growth, 16106127360);
assert.equal(MEDIA_QUOTA_BYTES.scale, 53687091200);
assert.equal(HARD_OBJECT_LIMIT_BYTES, 2 * 1024 * 1024);

assert.equal(extensionForMime('image/webp'), 'webp');
assert.equal(extensionForMime('image/png'), 'png');
assert.equal(extensionForMime('image/jpeg'), 'jpg');

assert.equal(formatBytes(512), '512 B');
assert.equal(formatBytes(1024), '1 KB');
assert.equal(COMPRESS_PRESETS.product.maxDimension, 2000);
assert.equal(COMPRESS_PRESETS.logo.preserveAlpha, true);
assert.equal(COMPRESS_PRESETS.hero.maxDimension, 2400);

console.log('media constants tests passed');
