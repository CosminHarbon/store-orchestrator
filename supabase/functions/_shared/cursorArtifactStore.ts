/**
 * Download a Cursor storefront-build.tar.gz → validate → private SV storage → extract site/ → ready.
 */

import { isStorefrontBuildArchive } from './cursorArtifactPaths.ts';
import { assertProtectedCommerceHashes } from './cursorProtectedCommerce.ts';

export const CURSOR_ARTIFACTS_BUCKET = 'cursor-storefront-artifacts';
export const STOREFRONT_ARCHIVE_FILENAME = 'storefront-build.tar.gz';

type AdminClient = {
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        body: ArrayBuffer | Uint8Array | Blob,
        opts?: { contentType?: string; upsert?: boolean },
      ) => Promise<{ error: { message: string } | null }>;
      download: (
        path: string,
      ) => Promise<{ data: Blob | null; error: { message: string } | null }>;
      createSignedUrl: (
        path: string,
        expiresIn: number,
      ) => Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
    };
  };
  from: (table: string) => {
    update: (row: Record<string, unknown>) => {
      eq: (col: string, val: string) => Promise<{ error: unknown }>;
    };
  };
};

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const digest = await crypto.subtle.digest('SHA-256', view);
  return toHex(digest);
}

export function artifactStorageDir(opts: {
  userId: string;
  sessionId: string;
  versionId: string;
}): string {
  return `${opts.userId}/${opts.sessionId}/${opts.versionId}`;
}

export function artifactStoragePath(opts: {
  userId: string;
  sessionId: string;
  versionId: string;
  filename?: string;
}): string {
  const name = opts.filename || STOREFRONT_ARCHIVE_FILENAME;
  return `${artifactStorageDir(opts)}/${name}`;
}

export function siteObjectPath(dir: string, relPath: string): string {
  const clean = relPath.replace(/^(\.\/)+/, '').replace(/^\/+/, '');
  return `${dir}/site/${clean}`;
}

/** True when bytes look like gzip (storefront-build.tar.gz). */
export function looksLikeGzip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

export function isSafeTarEntryPath(name: string): boolean {
  if (!name || name.includes('\0')) return false;
  const n = name.replace(/\\/g, '/');
  if (n.startsWith('/') || n.startsWith('~/')) return false;
  if (/^[a-zA-Z]:\//.test(n)) return false;
  const parts = n.split('/');
  if (parts.some((p) => p === '..')) return false;
  return true;
}

function readOctal(bytes: Uint8Array, start: number, len: number): number {
  let s = '';
  for (let i = start; i < start + len; i++) {
    const c = bytes[i]!;
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  s = s.trim();
  if (!s) return 0;
  return parseInt(s, 8) || 0;
}

function readCString(bytes: Uint8Array, start: number, len: number): string {
  let end = start;
  const max = start + len;
  while (end < max && bytes[end] !== 0) end++;
  return new TextDecoder().decode(bytes.subarray(start, end));
}

export type TarEntry = {
  path: string;
  typeflag: string;
  size: number;
  content: Uint8Array;
  isDir: boolean;
};

/**
 * Minimal ustar parser for typeflag 0/48 (regular file) and 5 (directory).
 * Rejects unsafe paths. Does not follow links.
 */
export function extractTarToFiles(tarBytes: Uint8Array): TarEntry[] {
  const entries: TarEntry[] = [];
  let offset = 0;
  const block = 512;

  while (offset + block <= tarBytes.length) {
    const header = tarBytes.subarray(offset, offset + block);
    offset += block;

    // End of archive: two zero blocks (we stop on first all-zero header).
    let allZero = true;
    for (let i = 0; i < block; i++) {
      if (header[i] !== 0) {
        allZero = false;
        break;
      }
    }
    if (allZero) break;

    const name = readCString(header, 0, 100);
    const prefix = readCString(header, 345, 155);
    const size = readOctal(header, 124, 12);
    const typeflagCode = header[156] ?? 0;
    const typeflag = typeflagCode === 0 ? '0' : String.fromCharCode(typeflagCode);
    const rawPath = prefix ? `${prefix}/${name}` : name;
    const pathName = rawPath.replace(/^\.\//, '');

    const dataSize = size;
    const padded = Math.ceil(dataSize / block) * block;
    const content = tarBytes.subarray(offset, offset + dataSize);
    offset += padded;

    // Skip extended headers / links we don't support.
    if (typeflag === 'x' || typeflag === 'g' || typeflag === 'L' || typeflag === 'K') {
      continue;
    }
    if (typeflag === '1' || typeflag === '2') {
      throw new Error(`tar_link_not_allowed:${pathName}`);
    }

    if (!isSafeTarEntryPath(pathName)) {
      throw new Error(`tar_unsafe_path:${pathName}`);
    }

    const isDir = typeflag === '5' || pathName.endsWith('/');
    if (typeflag === '0' || typeflagCode === 0 || isDir) {
      entries.push({
        path: pathName.replace(/\/$/, ''),
        typeflag,
        size: isDir ? 0 : dataSize,
        content: isDir ? new Uint8Array(0) : new Uint8Array(content),
        isDir,
      });
    }
  }

  return entries;
}

export async function gunzipBytes(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('gzip_unsupported');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const ab = await new Response(stream).arrayBuffer();
  return new Uint8Array(ab);
}

export type ValidateStorefrontTarResult =
  | {
      ok: true;
      entries: TarEntry[];
      files: TarEntry[];
      fileCount: number;
      totalUncompressedBytes: number;
      hasIndexHtml: boolean;
    }
  | { ok: false; error: string };

/**
 * Validate a (possibly gzipped) storefront tar: safe paths, require index.html.
 */
export async function validateStorefrontTar(
  bytes: Uint8Array,
): Promise<ValidateStorefrontTarResult> {
  try {
    let tar = bytes;
    if (looksLikeGzip(bytes)) {
      tar = await gunzipBytes(bytes);
    }

    const entries = extractTarToFiles(tar);
    const files = entries.filter((e) => !e.isDir);
    for (const e of entries) {
      if (!isSafeTarEntryPath(e.path)) {
        return { ok: false, error: `tar_unsafe_path:${e.path}` };
      }
    }

    const hasIndexHtml = files.some(
      (f) => f.path === 'index.html' || f.path.endsWith('/index.html'),
    );
    if (!hasIndexHtml) {
      return { ok: false, error: 'tar_missing_index_html' };
    }

    const totalUncompressedBytes = files.reduce((n, f) => n + f.size, 0);
    return {
      ok: true,
      entries,
      files,
      fileCount: files.length,
      totalUncompressedBytes,
      hasIndexHtml: true,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'tar_validate_failed';
    return { ok: false, error: msg };
  }
}

function contentTypeForPath(p: string): string {
  const lower = p.toLowerCase();
  if (lower.endsWith('.html')) return 'text/html; charset=utf-8';
  if (lower.endsWith('.js') || lower.endsWith('.mjs')) return 'text/javascript; charset=utf-8';
  if (lower.endsWith('.css')) return 'text/css; charset=utf-8';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.woff2')) return 'font/woff2';
  if (lower.endsWith('.woff')) return 'font/woff';
  if (lower.endsWith('.map')) return 'application/json';
  return 'application/octet-stream';
}

export async function markVersionFailed(admin: AdminClient, versionId: string, detail: string) {
  await admin
    .from('cursor_storefront_versions')
    .update({
      status: 'failed',
      build_status: 'failed',
      metadata: { ingest_error: detail },
    })
    .eq('id', versionId);
}

export async function ingestCursorArtifact(opts: {
  admin: AdminClient;
  downloadUrl: string;
  userId: string;
  sessionId: string;
  versionId: string;
  cursorArtifactPath?: string | null;
  contentType?: string;
  /** Optional companion storefront-manifest.json bytes (already downloaded). */
  companionManifestBytes?: Uint8Array | null;
  /** Existing version.manifest to merge with. */
  existingManifest?: Record<string, unknown> | null;
}): Promise<{
  storagePath: string;
  contentSha256: string;
  contentSizeBytes: number;
  fileCount: number;
  totalUncompressedBytes: number;
}> {
  const pathHint = opts.cursorArtifactPath || '';
  const shouldValidate =
    isStorefrontBuildArchive(pathHint) || pathHint.endsWith('.tar.gz') || pathHint.endsWith('.tgz');

  await opts.admin
    .from('cursor_storefront_versions')
    .update({ build_status: 'verifying', status: 'captured' })
    .eq('id', opts.versionId);

  const res = await fetch(opts.downloadUrl);
  if (!res.ok) {
    await markVersionFailed(opts.admin, opts.versionId, `artifact_download_failed:${res.status}`);
    throw new Error(`artifact_download_failed:${res.status}`);
  }
  const ab = await res.arrayBuffer();
  const bytes = new Uint8Array(ab);

  // If path wasn't a tar but content is gzip, still validate as storefront package.
  const treatAsPackage = shouldValidate || looksLikeGzip(bytes);
  if (!treatAsPackage) {
    await markVersionFailed(opts.admin, opts.versionId, 'artifact_not_storefront_package');
    throw new Error('artifact_not_storefront_package');
  }

  const validated = await validateStorefrontTar(bytes);
  if (!validated.ok) {
    await markVersionFailed(opts.admin, opts.versionId, validated.error);
    throw new Error(validated.error);
  }

  const contentSha256 = await sha256Hex(bytes);
  const dir = artifactStorageDir({
    userId: opts.userId,
    sessionId: opts.sessionId,
    versionId: opts.versionId,
  });
  const storagePath = `${dir}/${STOREFRONT_ARCHIVE_FILENAME}`;

  const { error: upErr } = await opts.admin.storage.from(CURSOR_ARTIFACTS_BUCKET).upload(
    storagePath,
    bytes,
    {
      contentType: opts.contentType || 'application/gzip',
      upsert: true,
    },
  );
  if (upErr) {
    await markVersionFailed(opts.admin, opts.versionId, `artifact_upload_failed:${upErr.message}`);
    throw new Error(`artifact_upload_failed:${upErr.message}`);
  }

  // Extract safe files under .../site/ for preview serving.
  for (const file of validated.files) {
    const objectPath = siteObjectPath(dir, file.path);
    const { error: fileErr } = await opts.admin.storage.from(CURSOR_ARTIFACTS_BUCKET).upload(
      objectPath,
      file.content,
      {
        contentType: contentTypeForPath(file.path),
        upsert: true,
      },
    );
    if (fileErr) {
      await markVersionFailed(opts.admin, opts.versionId, `site_upload_failed:${fileErr.message}`);
      throw new Error(`site_upload_failed:${fileErr.message}`);
    }
  }

  let packageManifest: Record<string, unknown> | null = null;
  if (opts.companionManifestBytes && opts.companionManifestBytes.byteLength > 0) {
    try {
      packageManifest = JSON.parse(
        new TextDecoder().decode(opts.companionManifestBytes),
      ) as Record<string, unknown>;
    } catch {
      packageManifest = { parse_error: true };
    }
  }

  const commerceGate = assertProtectedCommerceHashes(packageManifest);
  if (!commerceGate.ok) {
    const detail = `${commerceGate.error}:${commerceGate.mismatches.join(';')}`;
    await markVersionFailed(opts.admin, opts.versionId, detail);
    throw new Error(commerceGate.error);
  }

  const mergedManifest = {
    ...(opts.existingManifest || {}),
    package: packageManifest,
    artifact_format_version: packageManifest?.artifactFormatVersion ?? 1,
    entrypoint: 'index.html',
    archive_filename: STOREFRONT_ARCHIVE_FILENAME,
    file_count: validated.fileCount,
    total_uncompressed_bytes: validated.totalUncompressedBytes,
    site_prefix: `${dir}/site`,
  };

  const { error: rowErr } = await opts.admin
    .from('cursor_storefront_versions')
    .update({
      storage_bucket: CURSOR_ARTIFACTS_BUCKET,
      storage_path: storagePath,
      content_sha256: contentSha256,
      content_size_bytes: bytes.byteLength,
      status: 'stored',
      cursor_artifact_path: opts.cursorArtifactPath ?? null,
      build_status: 'ready',
      preview_path: 'index.html',
      manifest: mergedManifest,
    })
    .eq('id', opts.versionId);

  if (rowErr) {
    await markVersionFailed(opts.admin, opts.versionId, 'version_update_failed');
    throw new Error('version_update_failed');
  }

  return {
    storagePath,
    contentSha256,
    contentSizeBytes: bytes.byteLength,
    fileCount: validated.fileCount,
    totalUncompressedBytes: validated.totalUncompressedBytes,
  };
}

export async function createArtifactSignedUrl(
  admin: AdminClient,
  storagePath: string,
  expiresInSeconds = 120,
): Promise<string | null> {
  const { data, error } = await admin.storage
    .from(CURSOR_ARTIFACTS_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** Safe relative path for site/ preview objects (no ..). */
export function sanitizePreviewRelPath(raw: string | null | undefined): string | null {
  const input = (raw || 'index.html').trim() || 'index.html';
  const n = input.replace(/\\/g, '/').replace(/^(\.\/)+/, '');
  if (!n || n.startsWith('/') || n.includes('..') || n.includes('\0')) return null;
  if (n.split('/').some((p) => p === '' || p === '.' || p === '..')) return null;
  return n;
}
