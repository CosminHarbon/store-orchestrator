/**
 * Local B1 checkout-draft + store-api proxy (no service-role required).
 *
 * Canonicalises carts via the merchant's public store-api key (same trust
 * boundary as /templates?api_key=). HMAC-signs draft tokens locally.
 * Other paths proxy to production store-api.
 *
 *   node --env-file=.env tools/b1-checkout-draft-server/server.mjs
 *
 * Point the app at this proxy:
 *   VITE_STORE_API_BASE=http://127.0.0.1:8787/functions/v1/store-api
 *   VITE_CHECKOUT_APP_ORIGIN=http://127.0.0.1:8080
 */
import http from 'node:http';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const PORT = Number(process.env.B1_DRAFT_PORT || 8787);
const UPSTREAM =
  process.env.STORE_API_UPSTREAM ||
  'https://mkkqbekhvcnwcheegjpy.supabase.co/functions/v1/store-api';
const CHECKOUT_APP_ORIGIN = (
  process.env.CHECKOUT_APP_ORIGIN ||
  process.env.VITE_CHECKOUT_APP_ORIGIN ||
  'http://127.0.0.1:8080'
).replace(/\/$/, '');
const TTL = 30 * 60;
const MAX_LINES = 50;
const MAX_UNITS = 999;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ALLOWLIST = new Set(
  [
    'http://127.0.0.1:8080',
    'http://localhost:8080',
    'http://127.0.0.1:5173',
    'http://localhost:5173',
    'http://127.0.0.1:4177',
    'http://localhost:4177',
    'http://127.0.0.1:4173',
    'http://localhost:4173',
    CHECKOUT_APP_ORIGIN,
    ...(process.env.CHECKOUT_ORIGIN_ALLOWLIST || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  ].map((s) => s.replace(/\/$/, '')),
);

const HMAC_SECRET =
  (process.env.CHECKOUT_DRAFT_HMAC_SECRET || '').trim().length >= 32
    ? process.env.CHECKOUT_DRAFT_HMAC_SECRET.trim()
    : `sv-checkout-draft-v1:local-dev-only:${CHECKOUT_APP_ORIGIN}:${UPSTREAM}`;

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function mintToken(payload) {
  const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  const sig = createHmac('sha256', HMAC_SECRET).update(`v1.${body}`).digest('base64url');
  return `v1.${body}.${sig}`;
}

function verifyToken(token) {
  if (typeof token !== 'string' || !token.trim()) {
    return { ok: false, status: 400, code: 'DRAFT_TOKEN_REQUIRED', error: 'draft token required' };
  }
  const parts = token.trim().split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') {
    return { ok: false, status: 401, code: 'DRAFT_TOKEN_INVALID', error: 'Invalid draft token' };
  }
  const [, body, sig] = parts;
  const expected = createHmac('sha256', HMAC_SECRET).update(`v1.${body}`).digest();
  let actual;
  try {
    actual = Buffer.from(sig, 'base64url');
  } catch {
    return { ok: false, status: 401, code: 'DRAFT_TOKEN_INVALID', error: 'Invalid draft token' };
  }
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, status: 401, code: 'DRAFT_TOKEN_TAMPERED', error: 'Invalid draft token' };
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, status: 401, code: 'DRAFT_TOKEN_INVALID', error: 'Invalid draft token' };
  }
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) {
    return { ok: false, status: 410, code: 'DRAFT_EXPIRED', error: 'Checkout draft has expired' };
  }
  return { ok: true, payload };
}

function validateOrigin(raw) {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { ok: false, code: 'INVALID_RETURN_ORIGIN', error: 'return_origin is required' };
  }
  if (/^(javascript|data|vbscript|file|blob):/i.test(raw)) {
    return { ok: false, code: 'UNSAFE_RETURN_ORIGIN', error: 'Unsafe return URL scheme' };
  }
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, code: 'INVALID_RETURN_ORIGIN', error: 'Invalid return_origin' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, code: 'UNSAFE_RETURN_ORIGIN', error: 'return_origin must be http(s)' };
  }
  if (url.username || url.password) {
    return { ok: false, code: 'UNSAFE_RETURN_ORIGIN', error: 'return_origin must not include credentials' };
  }
  if (!ALLOWLIST.has(url.origin)) {
    return { ok: false, code: 'RETURN_ORIGIN_NOT_ALLOWED', error: 'return_origin is not on the allowlist' };
  }
  return { ok: true, origin: url.origin };
}

function validatePath(raw) {
  if (raw == null || raw === '') return { ok: true, path: '/' };
  if (typeof raw !== 'string') return { ok: false, code: 'INVALID_RETURN_PATH', error: 'Invalid return_path' };
  const p = raw.trim() || '/';
  if (!p.startsWith('/') || p.startsWith('//') || p.includes('\\') || p.includes('://') || p.length > 512) {
    return { ok: false, code: 'INVALID_RETURN_PATH', error: 'Invalid return_path' };
  }
  return { ok: true, path: p };
}

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

async function storeApi(apiKey, pathAndQuery, init = {}) {
  const res = await fetch(`${UPSTREAM}${pathAndQuery.startsWith('/') ? '' : '/'}${pathAndQuery}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'X-API-Key': apiKey,
      ...(init.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

async function canonicaliseViaStoreApi(apiKey, rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { ok: false, status: 400, body: { error: 'Order must contain at least one item', code: 'INVALID_ITEMS' } };
  }
  if (rawItems.length > MAX_LINES) {
    return { ok: false, status: 400, body: { error: 'Too many items in a single order', code: 'INVALID_ITEMS' } };
  }

  const requested = new Map();
  for (const raw of rawItems) {
    const productId = typeof raw?.product_id === 'string' ? raw.product_id.trim() : '';
    if (!UUID_RE.test(productId)) {
      return {
        ok: false,
        status: 400,
        body: { error: 'One or more items in your cart are no longer available', code: 'INVALID_PRODUCT' },
      };
    }
    let variantId = null;
    if (raw?.variant_id != null && raw.variant_id !== '') {
      if (typeof raw.variant_id !== 'string' || !UUID_RE.test(raw.variant_id.trim())) {
        return {
          ok: false,
          status: 400,
          body: { error: 'The selected options are no longer available', code: 'INVALID_VARIANT' },
        };
      }
      variantId = raw.variant_id.trim();
    }
    const qty = Number(raw?.quantity);
    if (!Number.isInteger(qty) || qty < 1) {
      return {
        ok: false,
        status: 400,
        body: { error: 'Item quantity must be a whole number of at least 1', code: 'INVALID_QUANTITY' },
      };
    }
    const key = variantId ? `${productId}:${variantId}` : productId;
    const next = (requested.get(key)?.quantity || 0) + qty;
    if (next > MAX_UNITS) {
      return {
        ok: false,
        status: 400,
        body: { error: `Quantity per product is limited to ${MAX_UNITS}`, code: 'INVALID_QUANTITY' },
      };
    }
    requested.set(key, { productId, variantId, quantity: next });
  }

  const { res: listRes, data: listData } = await storeApi(apiKey, '/products');
  if (!listRes.ok) {
    return { ok: false, status: 502, body: { error: 'Failed to verify cart items' } };
  }
  const listed = Array.isArray(listData.products) ? listData.products : Array.isArray(listData) ? listData : [];
  const listById = new Map(listed.map((p) => [p.id, p]));

  const items = [];
  let subtotal = 0;
  for (const row of requested.values()) {
    if (!listById.has(row.productId)) {
      return {
        ok: false,
        status: 400,
        body: { error: 'One or more items in your cart are no longer available', code: 'INVALID_PRODUCT' },
      };
    }
    const { res: detailRes, data: detailData } = await storeApi(
      apiKey,
      `/product?id=${encodeURIComponent(row.productId)}`,
    );
    if (!detailRes.ok) {
      return {
        ok: false,
        status: 400,
        body: { error: 'One or more items in your cart are no longer available', code: 'INVALID_PRODUCT' },
      };
    }
    const product = detailData.product || detailData;
    const title = String(product.title || product.name || 'Product');
    const hasVariants = Boolean(product.has_variants) || (Array.isArray(product.variants) && product.variants.length > 0);
    const image =
      product.primary_image ||
      product.image ||
      (Array.isArray(product.images) && (product.images.find((i) => i.is_primary)?.image_url || product.images[0]?.image_url)) ||
      null;

    if (hasVariants) {
      if (!row.variantId) {
        return { ok: false, status: 400, body: { error: 'Please select product options', code: 'VARIANT_REQUIRED' } };
      }
      const variants = Array.isArray(product.variants) ? product.variants : [];
      const variant = variants.find((v) => v.id === row.variantId);
      if (!variant || variant.active === false) {
        return {
          ok: false,
          status: 400,
          body: { error: 'The selected options are no longer available', code: 'INVALID_VARIANT' },
        };
      }
      const stock = Number(variant.stock ?? 0);
      if (stock < row.quantity) {
        return {
          ok: false,
          status: 409,
          body: {
            error: `Insufficient stock for ${title}`,
            code: 'INSUFFICIENT_STOCK',
            available: stock,
            requested: row.quantity,
          },
        };
      }
      const price = roundMoney(
        typeof variant.final_price === 'number'
          ? variant.final_price
          : typeof variant.effective_price === 'number'
            ? variant.effective_price
            : Number(variant.price_override ?? product.final_price ?? product.price),
      );
      items.push({
        product_id: product.id,
        variant_id: variant.id,
        title,
        price,
        quantity: row.quantity,
        stock,
        image_url: image,
      });
      subtotal = roundMoney(subtotal + price * row.quantity);
    } else {
      if (row.variantId) {
        return {
          ok: false,
          status: 400,
          body: { error: 'The selected options are no longer available', code: 'INVALID_VARIANT' },
        };
      }
      const stock = Number(product.stock ?? 0);
      if (stock < row.quantity) {
        return {
          ok: false,
          status: 409,
          body: {
            error: `Insufficient stock for ${title}`,
            code: 'INSUFFICIENT_STOCK',
            available: stock,
            requested: row.quantity,
          },
        };
      }
      const price = roundMoney(Number(product.final_price ?? product.price));
      items.push({
        product_id: product.id,
        variant_id: null,
        title,
        price,
        quantity: row.quantity,
        stock,
        image_url: image,
      });
      subtotal = roundMoney(subtotal + price * row.quantity);
    }
  }
  return { ok: true, items, subtotal };
}

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

async function handleDraftPost(req, res) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || typeof apiKey !== 'string') return json(res, 401, { error: 'API key is required' });

  const { res: cfgRes, data: cfg } = await storeApi(apiKey, '/config');
  if (!cfgRes.ok) return json(res, 401, { error: 'Invalid API key' });

  let body;
  try {
    body = await readBody(req);
  } catch {
    return json(res, 400, { error: 'Invalid JSON body' });
  }

  const originCheck = validateOrigin(body.return_origin);
  if (!originCheck.ok) return json(res, 400, { error: originCheck.error, code: originCheck.code });
  const pathCheck = validatePath(body.return_path);
  if (!pathCheck.ok) return json(res, 400, { error: pathCheck.error, code: pathCheck.code });

  let hostedOrigin = CHECKOUT_APP_ORIGIN;
  if (body.hosted_checkout_origin) {
    const h = validateOrigin(body.hosted_checkout_origin);
    if (!h.ok) return json(res, 400, { error: h.error, code: h.code });
    hostedOrigin = h.origin;
  }

  const canonical = await canonicaliseViaStoreApi(apiKey, body.items);
  if (!canonical.ok) return json(res, canonical.status, canonical.body);

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    v: 1,
    merchant_user_id: cfg.user_id,
    store_api_key: apiKey,
    store_name: cfg.store_name || 'Store',
    items: canonical.items.map((i) => ({
      product_id: i.product_id,
      variant_id: i.variant_id,
      quantity: i.quantity,
    })),
    return_origin: originCheck.origin,
    return_path: pathCheck.path,
    iat: now,
    exp: now + TTL,
    jti: randomUUID(),
  };
  const token = mintToken(payload);
  return json(res, 201, {
    draft_token: token,
    checkout_url: `${hostedOrigin}/checkout?draft=${encodeURIComponent(token)}`,
    expires_at: new Date(payload.exp * 1000).toISOString(),
    item_count: canonical.items.reduce((n, i) => n + i.quantity, 0),
    line_count: canonical.items.length,
    subtotal: canonical.subtotal,
    currency: 'RON',
    store_name: cfg.store_name || 'Store',
  });
}

async function handleDraftGet(req, res, url) {
  const token = url.searchParams.get('token') || url.searchParams.get('draft') || '';
  const verified = verifyToken(token);
  if (!verified.ok) return json(res, verified.status, { error: verified.error, code: verified.code });
  const { payload } = verified;

  const { res: cfgRes, data: cfg } = await storeApi(payload.store_api_key, '/config');
  if (!cfgRes.ok || cfg.user_id !== payload.merchant_user_id) {
    return json(res, 401, { error: 'Draft merchant mismatch', code: 'DRAFT_MERCHANT_MISMATCH' });
  }

  const canonical = await canonicaliseViaStoreApi(payload.store_api_key, payload.items);
  if (!canonical.ok) return json(res, canonical.status, canonical.body);

  const homeFee = Number(
    cfg.delivery?.home_fee ?? cfg.delivery?.home_delivery_fee ?? cfg.home_delivery_fee ?? 0,
  );
  const lockerFee = Number(
    cfg.delivery?.locker_fee ?? cfg.delivery?.locker_delivery_fee ?? cfg.locker_delivery_fee ?? 0,
  );
  const cashEnabled = cfg.payment?.cash_enabled ?? cfg.cash_payment_enabled ?? true;
  const cashFee = cashEnabled ? Number(cfg.payment?.cash_fee ?? cfg.cash_payment_fee ?? 0) : 0;
  const cardEnabled = cfg.payment?.card_enabled === true;
  const lockerEnabled = cfg.delivery?.locker_enabled !== false;

  return json(res, 200, {
    store_name: cfg.store_name || payload.store_name || 'Store',
    store_api_key: payload.store_api_key,
    preferred_language: cfg.preferred_language || 'ro',
    currency: 'RON',
    expires_at: new Date(payload.exp * 1000).toISOString(),
    return_origin: payload.return_origin,
    return_path: payload.return_path || '/',
    items: canonical.items.map((item) => ({
      product_id: item.product_id,
      variant_id: item.variant_id,
      title: item.title,
      quantity: item.quantity,
      unit_price: item.price,
      line_total: roundMoney(item.price * item.quantity),
      image_url: item.image_url || null,
      stock: item.stock,
    })),
    subtotal: canonical.subtotal,
    home_delivery_fee: homeFee,
    locker_delivery_fee: lockerFee,
    cash_payment_fee: cashFee,
    cash_payment_enabled: Boolean(cashEnabled),
    estimated_total: roundMoney(canonical.subtotal + homeFee + cashFee),
    supported: {
      home_delivery: true,
      cash: Boolean(cashEnabled),
      card: Boolean(cardEnabled),
      locker: Boolean(lockerEnabled),
    },
  });
}

async function proxy(req, res, suffixAndQuery) {
  const target = `${UPSTREAM}${suffixAndQuery.startsWith('/') ? '' : '/'}${suffixAndQuery}`;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const upstream = await fetch(target, {
    method: req.method,
    headers: {
      'X-API-Key': req.headers['x-api-key'] || '',
      Accept: 'application/json',
      'Content-Type': req.headers['content-type'] || 'application/json',
    },
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
  });
  const buf = Buffer.from(await upstream.arrayBuffer());
  res.writeHead(upstream.status, {
    'Content-Type': upstream.headers.get('content-type') || 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  });
  res.end(buf);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      });
      return res.end();
    }
    const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
    const parts = url.pathname.split('/').filter(Boolean);
    let apiPath = parts[parts.length - 1] || '';
    if (parts.includes('store-api')) {
      apiPath = parts.slice(parts.indexOf('store-api') + 1).join('/') || '';
    }
    if (apiPath === 'checkout-draft' && req.method === 'POST') return handleDraftPost(req, res);
    if (apiPath === 'checkout-draft' && req.method === 'GET') return handleDraftGet(req, res, url);

    const after = parts.includes('store-api')
      ? parts.slice(parts.indexOf('store-api') + 1).join('/')
      : parts.join('/');
    return proxy(req, res, `/${after}${url.search}`);
  } catch (e) {
    console.error(e);
    json(res, 500, { error: 'Internal error' });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[b1-draft] http://127.0.0.1:${PORT}/functions/v1/store-api`);
  console.log(`[b1-draft] checkout app origin ${CHECKOUT_APP_ORIGIN}`);
  console.log(`[b1-draft] hmac fp ${createHash('sha256').update(HMAC_SECRET).digest('hex').slice(0, 12)}`);
});
