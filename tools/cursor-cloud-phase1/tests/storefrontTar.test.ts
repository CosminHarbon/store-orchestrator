/**
 * Artifact path picker + tar path safety unit tests.
 * Run from tools/cursor-cloud-phase1: npm test
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  pickArtifactPath,
  findCompanionManifestPath,
  isBuildBlockedArtifact,
} from '../../../supabase/functions/_shared/cursorArtifactPaths.ts';
import {
  isSafeTarEntryPath,
  extractTarToFiles,
  sanitizePreviewRelPath,
} from '../../../supabase/functions/_shared/cursorArtifactStore.ts';

describe('pickArtifactPath', () => {
  it('prefers storefront-build.tar.gz', () => {
    const path = pickArtifactPath([
      { path: 'artifacts/assets/index-abc.js' },
      { path: 'artifacts/storefront-build.tar.gz' },
      { path: 'artifacts/storefront-manifest.json' },
    ]);
    assert.equal(path, 'artifacts/storefront-build.tar.gz');
  });

  it('rejects BUILD_BLOCKED.txt and random js-only lists', () => {
    assert.equal(pickArtifactPath([{ path: 'artifacts/BUILD_BLOCKED.txt' }]), null);
    assert.equal(
      pickArtifactPath([{ path: 'artifacts/dist/assets/index-xyz.js' }]),
      null,
    );
    assert.equal(isBuildBlockedArtifact('foo/BUILD_BLOCKED.txt'), true);
  });

  it('falls back to manifest companion when no tar', () => {
    assert.equal(
      pickArtifactPath([{ path: 'artifacts/storefront-manifest.json' }]),
      'artifacts/storefront-manifest.json',
    );
  });

  it('finds companion manifest for a tar path', () => {
    assert.equal(
      findCompanionManifestPath(
        [
          { path: 'artifacts/storefront-build.tar.gz' },
          { path: 'artifacts/storefront-manifest.json' },
        ],
        'artifacts/storefront-build.tar.gz',
      ),
      'artifacts/storefront-manifest.json',
    );
  });
});

describe('tar path safety', () => {
  it('rejects traversal and absolute paths', () => {
    assert.equal(isSafeTarEntryPath('index.html'), true);
    assert.equal(isSafeTarEntryPath('assets/app.js'), true);
    assert.equal(isSafeTarEntryPath('../etc/passwd'), false);
    assert.equal(isSafeTarEntryPath('/etc/passwd'), false);
    assert.equal(isSafeTarEntryPath('foo/../../x'), false);
    assert.equal(isSafeTarEntryPath('C:/windows'), false);
  });

  it('sanitizePreviewRelPath blocks ..', () => {
    assert.equal(sanitizePreviewRelPath('index.html'), 'index.html');
    assert.equal(sanitizePreviewRelPath('assets/x.js'), 'assets/x.js');
    assert.equal(sanitizePreviewRelPath('../x'), null);
    assert.equal(sanitizePreviewRelPath('/abs'), null);
    assert.equal(sanitizePreviewRelPath(''), 'index.html');
  });

  it('extractTarToFiles parses a tiny ustar and rejects unsafe names', () => {
    const content = new TextEncoder().encode('<!doctype html><title>t</title>');
    const tar = craftUstar('index.html', content);
    const entries = extractTarToFiles(tar);
    assert.equal(entries.length, 1);
    assert.equal(entries[0]!.path, 'index.html');
    assert.equal(entries[0]!.size, content.length);

    const bad = craftUstar('../evil.html', content);
    assert.throws(() => extractTarToFiles(bad), /tar_unsafe_path/);
  });
});

/** Minimal ustar builder for tests (typeflag 0 regular file). */
function craftUstar(name: string, content: Uint8Array): Uint8Array {
  const block = 512;
  const header = new Uint8Array(block);
  const nameBytes = new TextEncoder().encode(name);
  header.set(nameBytes.subarray(0, Math.min(100, nameBytes.length)), 0);
  const mode = '0000644\0';
  header.set(new TextEncoder().encode(mode), 100);
  const sizeOct = content.length.toString(8).padStart(11, '0') + '\0';
  header.set(new TextEncoder().encode(sizeOct), 124);
  header[156] = '0'.charCodeAt(0);
  header.set(new TextEncoder().encode('ustar\0'), 257);
  header.set(new TextEncoder().encode('00'), 263);

  // checksum
  for (let i = 148; i < 156; i++) header[i] = 0x20;
  let sum = 0;
  for (let i = 0; i < block; i++) sum += header[i]!;
  const chk = sum.toString(8).padStart(6, '0') + '\0 ';
  header.set(new TextEncoder().encode(chk), 148);

  const padded = Math.ceil(content.length / block) * block;
  const out = new Uint8Array(block + padded + block * 2);
  out.set(header, 0);
  out.set(content, block);
  return out;
}
