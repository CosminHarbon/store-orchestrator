/**
 * Client-side media pipeline self-test (no vitest/jsdom needed).
 * Run: npx --yes tsx src/lib/media/uploadPipeline.test.ts
 *
 * Drives the REAL compressImage + uploadMedia + deleteMediaAsset with a stub canvas and a stub
 * `fetch` that plays the Edge Function / Storage, and checks what would be sent over the wire.
 */
import assert from 'node:assert/strict';

const OUT_BYTES = 921600; // "900 KB" compressed output
const ORIGINAL_BYTES = 5 * 1024 * 1024; // "5 MB" picked file

/* ---------- browser stubs (installed before the modules under test load) ---------- */
const mem = new Map<string, string>();
const storageStub = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
};
const g = globalThis as Record<string, unknown>;
g.localStorage = storageStub;
g.sessionStorage = storageStub;
g.window = globalThis;
g.createImageBitmap = async () => ({ width: 4000, height: 3000, close() {} });
let encodeCalls = 0;
g.document = {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => ({
      imageSmoothingEnabled: false,
      imageSmoothingQuality: '',
      drawImage() {},
      getImageData: () => ({ data: new Uint8ClampedArray(4 * 64 * 64).fill(255) }),
    }),
    toDataURL: (mime: string) => `data:${mime};base64,AAAA`,
    toBlob: (cb: (b: Blob) => void, mime: string) => {
      encodeCalls += 1;
      cb(new Blob([new Uint8Array(OUT_BYTES)], { type: mime }));
    },
  }),
};

/* ---------- fake backend ---------- */
type Call = { action?: string; body: Record<string, unknown> };
const edgeCalls: Call[] = [];
const storageUploads: number[] = [];
let authorizeResponse: () => Response;

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

g.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.includes('/functions/v1/media-authorize-upload')) {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    edgeCalls.push({ action: body.action as string, body });
    if (body.action === 'authorize') return authorizeResponse();
    if (body.action === 'finalize') {
      return jsonResponse({
        ok: true,
        asset_id: 'asset-1',
        storage_path: 'm/products/p/x.webp',
        bucket: 'product-images',
        public_url: 'https://pub/x.webp',
        mime_type: 'image/webp',
        size_bytes: OUT_BYTES,
      });
    }
    return jsonResponse({ ok: true });
  }
  if (url.includes('/storage/v1/object/upload/sign/')) {
    const form = init?.body as FormData;
    storageUploads.push((form.get('') as Blob).size);
    return jsonResponse({ Key: 'product-images/m/products/p/x.webp' });
  }
  throw new Error(`unexpected fetch: ${url}`);
};

const okAuthorize = () =>
  jsonResponse({
    reservation_id: 'e0000000-0000-4000-8000-000000000001',
    bucket: 'product-images',
    storage_path: 'm/products/p/x.webp',
    token: 'tok',
    signed_url: 'https://signed',
    public_url: 'https://pub/x.webp',
  });

const { takeInputFiles } = await import('./inputFiles');
const { compressImage } = await import('./compressImage');
const { uploadMedia } = await import('./uploadMedia');
const { deleteMediaAsset } = await import('./deleteMedia');
const { MediaError } = await import('./errors');

/* ---------- 1. Quick Action picker: FileList must be copied before value is reset ---------- */
{
  const live = (files: File[]) => {
    const list = [...files];
    return {
      get files() {
        return list;
      },
      get value() {
        return list.length ? 'C:\\fakepath\\a.jpg' : '';
      },
      set value(v: string) {
        if (v === '') list.length = 0; // browsers empty the live FileList when value is cleared
      },
    };
  };
  const pick = new File([new Uint8Array(10)], 'a.jpg', { type: 'image/jpeg' });

  const buggy = live([pick]);
  const ref = buggy.files;
  buggy.value = '';
  assert.equal(ref.length, 0, 'sanity: the previous handler pattern lost the selection');

  const input = live([pick]);
  const taken = takeInputFiles(input);
  assert.equal(taken.length, 1, 'takeInputFiles keeps the picked file');
  assert.equal(taken[0], pick);
  assert.equal(input.value, '', 'input is reset so the same file can be re-picked');
  assert.deepEqual(takeInputFiles({ files: null, value: 'x' }), []);
}

/* ---------- 2. Compression still happens and the original size is captured first ---------- */
const photo = new File([new Uint8Array(ORIGINAL_BYTES)], 'photo.jpg', { type: 'image/jpeg' });
{
  const out = await compressImage(photo, 'product');
  assert.ok(encodeCalls > 0, 'image was re-encoded');
  assert.equal(out.originalSizeBytes, ORIGINAL_BYTES, 'original size = size of the File the merchant picked');
  assert.equal(out.sizeBytes, OUT_BYTES, 'stored size = size of the compressed blob');
  assert.equal(out.blob.size, OUT_BYTES);
  assert.ok(out.sizeBytes < out.originalSizeBytes, 'output is smaller than the input');
  assert.equal(out.mimeType, 'image/webp');
  assert.deepEqual([out.width, out.height], [2000, 1500], 'resized to the product preset');

  const tooBig = new File([new Uint8Array(11 * 1024 * 1024)], 'huge.jpg', { type: 'image/jpeg' });
  await assert.rejects(() => compressImage(tooBig, 'product'), (e: unknown) => e instanceof MediaError && e.code === 'SOURCE_TOO_LARGE');
}

/* ---------- 3. uploadMedia: authorize carries BOTH sizes, only the compressed file is uploaded ---------- */
{
  edgeCalls.length = 0;
  storageUploads.length = 0;
  authorizeResponse = okAuthorize;

  const res = await uploadMedia({ file: photo, mediaType: 'product', relatedEntityId: 'b1000000-0000-4000-8000-000000000001' });

  const authorize = edgeCalls.find((c) => c.action === 'authorize')!.body;
  assert.equal(authorize.original_size_bytes, ORIGINAL_BYTES, 'original size sent to the server');
  assert.equal(authorize.expected_size_bytes, OUT_BYTES, 'compressed size sent to the server');
  assert.equal(authorize.related_entity_id, 'b1000000-0000-4000-8000-000000000001', 'image tied to the intended product');
  assert.equal(authorize.media_type, 'product');
  assert.equal(authorize.mime_type, 'image/webp');

  assert.deepEqual(storageUploads, [OUT_BYTES], 'exactly one object stored, and it is the compressed file');
  assert.ok(edgeCalls.some((c) => c.action === 'finalize'));
  assert.equal(res.sizeBytes, OUT_BYTES);
  assert.equal(res.originalSizeBytes, ORIGINAL_BYTES);
  assert.equal(res.assetId, 'asset-1');
}

/* ---------- 4. Quota rejection: nothing is uploaded ---------- */
{
  edgeCalls.length = 0;
  storageUploads.length = 0;
  authorizeResponse = () => jsonResponse({ error: 'quota_exceeded', quota_bytes: 104857600 }, 409);
  await assert.rejects(
    () => uploadMedia({ file: photo, mediaType: 'product', relatedEntityId: 'b1000000-0000-4000-8000-000000000001' }),
    (e: unknown) => e instanceof MediaError && e.code === 'QUOTA' && e.quotaBytes === 104857600,
  );
  assert.equal(storageUploads.length, 0, 'no Storage write after a quota rejection');
  assert.ok(!edgeCalls.some((c) => c.action === 'finalize'));
}

/* ---------- 5. Replace = upload new, then delete the previous asset by its public URL ---------- */
{
  edgeCalls.length = 0;
  await deleteMediaAsset({ publicUrl: 'https://pub/old.webp' });
  const del = edgeCalls.find((c) => c.action === 'delete')!.body;
  assert.equal(del.public_url, 'https://pub/old.webp');
}

console.log('media upload pipeline tests passed');
process.exit(0);
