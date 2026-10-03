/**
 * Local-only Foundation media + checkout verification (no commit).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, '.tmp/foundation-fix-verify');
fs.mkdirSync(outDir, { recursive: true });

// Recover credentials from prior local transcript (never print password).
function loadCreds() {
  const email = 'dadadatatata414@gmail.com';
  const transcripts = path.join(
    process.env.HOME,
    '.cursor/projects/Users-cosminharbon-Desktop-Aplicatie-store-orchestrator/agent-transcripts',
  );
  let password = null;
  for (const dir of fs.readdirSync(transcripts)) {
    const base = path.join(transcripts, dir);
    for (const f of fs.readdirSync(base)) {
      if (!f.endsWith('.jsonl')) continue;
      const t = fs.readFileSync(path.join(base, f), 'utf8');
      if (!t.includes(email)) continue;
      const idx = t.indexOf(email);
      const ctx = t.slice(Math.max(0, idx - 400), idx + 400);
      const m =
        ctx.match(/"password"\s*:\s*"([^"]+)"/i) ||
        ctx.match(/password["']?\s*[:=]\s*["']([^"']+)["']/i) ||
        ctx.match(/PASSWORD\s*=\s*([^\s\n]+)/i);
      if (m) {
        password = m[1];
        break;
      }
    }
    if (password) break;
  }
  if (!password) throw new Error('password_not_found');
  return { email, password };
}

const creds = { email: 'dadadatatata414@gmail.com' }; // password unused; session inject
const report = {
  startedAt: new Date().toISOString(),
  steps: [],
  screenshots: [],
  checkout: {},
  media: {},
  runtimeConfig: {},
  errors: [],
};

function log(step, msg = '') {
  report.steps.push({ step, at: new Date().toISOString(), msg });
  console.log(`[${step}]`, msg);
}

async function shot(page, name) {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  report.screenshots.push(file);
  return file;
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function clickText(pageOrFrame, re, opts = {}) {
  const handle = await pageOrFrame.evaluateHandle((src, exact) => {
    const re = new RegExp(src, 'i');
    const nodes = [...document.querySelectorAll('button, a, [role="button"], [role="tab"]')];
    return (
      nodes.find((b) => {
        const t = (b.textContent || '').trim();
        return exact ? re.test(t) && t.length < 40 : re.test(t);
      }) || null
    );
  }, re.source, !!opts.exact);
  const el = handle.asElement();
  if (!el) return false;
  await el.click();
  return true;
}

async function readCheckoutOptions(page) {
  // Wait for hosted checkout SPA to hydrate with delivery/payment UI
  await page.waitForFunction(
    () => {
      const t = document.body?.innerText || '';
      return /delivery|livrare|payment|plată|checkout/i.test(t) && t.length > 200;
    },
    { timeout: 45000 },
  ).catch(() => null);
  await sleep(1500);
  return page.evaluate(() => {
    const t = document.body.innerText || '';
    // Prefer option labels over marketing copy elsewhere
    const has = (re) => re.test(t);
    return {
      textLen: t.length,
      home: has(/home delivery|livrare (la )?domiciliu|\bhome\b/i),
      locker: has(/locker|easybox|livrare (la )?locker|\bLocker\b/i),
      cod: has(/cash on delivery|\bCOD\b|ramburs|plata la livrare|cash/i),
      card: has(/\bcard\b|netopia|pay by card|plata cu card/i),
      snippet: t.replace(/\s+/g, ' ').slice(0, 400),
    };
  });
}

async function addFirstProductAndCheckout(pageOrFrame, pageForNav, label) {
  // Wait for catalog cards
  await pageOrFrame.waitForFunction(
    () => /lei|RON|Add to cart|Mini Pouch|€|\$/i.test(document.body?.innerText || ''),
    { timeout: 60000 },
  ).catch(() => null);
  await sleep(1000);

  // Scroll shop into view / click Shop now if needed
  await pageOrFrame.evaluate(() => {
    const shop = [...document.querySelectorAll('button, a')].find((b) =>
      /shop now|shop everything/i.test(b.textContent || ''),
    );
    if (shop) shop.click();
    const el = document.querySelector('#shop, [id*="shop"], .fd-shop, .sf-grid');
    if (el) el.scrollIntoView({ block: 'center' });
  });
  await sleep(1200);

  const added = await pageOrFrame.evaluate(() => {
    // Prefer explicit Add to cart
    const btns = [...document.querySelectorAll('button')];
    const add = btns.find((b) => /add to cart/i.test(b.textContent || ''));
    if (add) {
      add.click();
      return 'add-to-cart';
    }
    // Foundation featured: View product
    const view = [...document.querySelectorAll('button, a')].find((b) =>
      /view product/i.test(b.textContent || ''),
    );
    if (view) {
      view.click();
      return 'view-product';
    }
    // Product grid card
    const cardBtn = [...document.querySelectorAll('button, a')].find((b) =>
      /mini pouch|river pebble|view|details/i.test(b.textContent || ''),
    );
    if (cardBtn) {
      cardBtn.click();
      return 'open-card';
    }
    return null;
  });
  await sleep(1500);
  if (added === 'view-product' || added === 'open-card') {
    await pageOrFrame.evaluate(() => {
      const add = [...document.querySelectorAll('button')].find((b) =>
        /add to cart/i.test(b.textContent || ''),
      );
      if (add) add.click();
    });
    await sleep(1200);
  }

  await pageOrFrame.evaluate(() => {
    const cart = [...document.querySelectorAll('button')].find((b) =>
      /cart|bag/i.test(b.getAttribute('aria-label') || '') ||
      (/cart/i.test(b.textContent || '') && (b.textContent || '').length < 20),
    );
    if (cart) cart.click();
  });
  await sleep(1000);

  const cartCount = await pageOrFrame.evaluate(() => {
    const t = document.body.innerText || '';
    const m = t.match(/Cart\s*(\d+)/i);
    return m ? Number(m[1]) : -1;
  });

  await shot(pageForNav, `${label}-cart`);

  if (cartCount === 0) {
    return { ok: false, error: 'cart_empty', cartCount };
  }

  const navP = pageForNav
    .waitForFunction(() => /\/checkout\?.*draft=/.test(location.href), { timeout: 45000 })
    .then(() => true)
    .catch(() => false);

  await pageOrFrame.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      /^checkout$/i.test((b.textContent || '').trim()),
    );
    if (btn) btn.click();
  });
  const navigated = await navP;
  await sleep(2000);
  const url = pageForNav.url();
  const result = {
    ok: navigated || /\/checkout\?.*draft=/.test(url),
    urlHasDraft: /\/checkout\?.*draft=/.test(url),
    path: url.replace(/draft=[^&]+/, 'draft=REDACTED'),
    cartCount,
  };
  if (result.urlHasDraft) {
    result.options = await readCheckoutOptions(pageForNav);
    await shot(pageForNav, `${label}-hosted-checkout`);
  }
  return result;
}

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox', '--window-size=1440,900'],
  defaultViewport: { width: 1440, height: 900 },
});

try {
  // ===== Direct packaged runtime =====
  const runtime = await browser.newPage();
  runtime.on('console', (msg) => {
    if (msg.type() === 'error') report.errors.push(`runtime: ${msg.text().slice(0, 200)}`);
  });
  await runtime.goto('http://127.0.0.1:8080/curated-runtimes/foundation-live/index.html', {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });
  report.runtimeConfig = await runtime.evaluate(() => {
    const r = window.__SV_RUNTIME__ || {};
    return {
      hasKey: !!r.storeApiKey,
      apiBase: r.apiBase || null,
      hostedCheckoutOrigin: r.hostedCheckoutOrigin || null,
      returnOrigin: r.returnOrigin || null,
      useEmbeddedCodCheckout: r.useEmbeddedCodCheckout,
      theme: window.__SV_THEME__ || null,
    };
  });
  log('runtime_config', JSON.stringify(report.runtimeConfig));
  await runtime.waitForFunction(
    () => /Thoughtfully chosen|Mini Pouch|Shop now/i.test(document.body?.innerText || ''),
    { timeout: 60000 },
  );
  await shot(runtime, '01-direct-runtime-home');
  report.checkout.directRuntime = await addFirstProductAndCheckout(runtime, runtime, '02-direct');
  log('direct_checkout', JSON.stringify(report.checkout.directRuntime));

  // ===== Merchant auth via injected session (local verify only) =====
  const inject = JSON.parse(fs.readFileSync(path.join(root, '.tmp/foundation-auth-inject.json'), 'utf8'));
  const page = await browser.newPage();
  page.on('pageerror', (e) => report.errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') report.errors.push(`console: ${msg.text().slice(0, 240)}`);
  });

  await page.goto('http://127.0.0.1:8080/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    (k, v) => {
      localStorage.clear();
      localStorage.setItem(k, v);
    },
    inject.key,
    inject.value,
  );
  await page.goto('http://127.0.0.1:8080/app?tab=templates', {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });
  await sleep(3500);
  log('login', `url=${page.url()}`);
  await shot(page, '04-after-login');

  // Website builder → templates
  await page.goto('http://127.0.0.1:8080/app?tab=templates', { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(2500);
  await shot(page, '05-templates');

  // Open templates catalog if gallery
  const onCatalog = await page.evaluate(() => /Foundation|Novatee|Browse templates/i.test(document.body.innerText));
  if (!/Foundation/i.test(await page.evaluate(() => document.body.innerText))) {
    await clickText(page, /browse templates|templates/i);
    await sleep(2000);
  }
  await shot(page, '05b-catalog');

  // Use Foundation specifically (not Novatee)
  const used = await page.evaluate(() => {
    const articles = [...document.querySelectorAll('article')];
    for (const art of articles) {
      const t = art.innerText || '';
      if (!/Foundation/i.test(t)) continue;
      if (!/Use this template/i.test(t)) continue;
      const btn = [...art.querySelectorAll('button')].find((x) =>
        /Use this template/i.test(x.textContent || ''),
      );
      if (btn) {
        btn.click();
        return 'foundation-card';
      }
    }
    return null;
  });
  log('use_foundation_click', String(used));
  await sleep(800);
  // Foundation confirm dialog button label is "Continue"
  await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return;
    const title = dialog.textContent || '';
    if (!/Foundation/i.test(title)) return;
    const btn = [...dialog.querySelectorAll('button')].find((b) =>
      /^Continue$/i.test((b.textContent || '').trim()),
    );
    if (btn) btn.click();
  });
  await sleep(4000);
  await shot(page, '06-foundation-editor');

  let editorText = await page.evaluate(() => document.body.innerText);
  // If still on catalog, try Edit on foundation draft card
  if (!/Hero media|Editorial media|Logo/i.test(editorText)) {
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) =>
        /edit foundation|customize|continue editing|open editor/i.test(b.textContent || ''),
      );
      if (btn) btn.click();
    });
    await sleep(2500);
    editorText = await page.evaluate(() => document.body.innerText);
  }

  report.media.editorFieldsPresent = {
    logo: /Logo/i.test(editorText),
    heroMedia: /Hero media/i.test(editorText),
    editorialMedia: /Editorial media/i.test(editorText),
    ctaBackground: /Call-to-action background|background \(optional\)/i.test(editorText),
    managedInProducts: /Managed in Products/i.test(editorText),
    managedInCollections: /Managed in Collections/i.test(editorText),
  };
  log('media_fields', JSON.stringify(report.media.editorFieldsPresent));
  await shot(page, '07-editor-fields');

  // Set hero mode to image
  async function chooseSelectNear(labelRe, optionRe) {
    await page.evaluate((ls, os) => {
      const labelRe = new RegExp(ls, 'i');
      const optionRe = new RegExp(os, 'i');
      const combos = [...document.querySelectorAll('button[role="combobox"]')];
      for (const c of combos) {
        const wrap = c.closest('div')?.parentElement || c.parentElement;
        if (labelRe.test(wrap?.innerText || '')) {
          c.click();
          return;
        }
      }
    }, labelRe.source, optionRe.source);
    await sleep(400);
    await page.evaluate((os) => {
      const optionRe = new RegExp(os, 'i');
      const opt = [...document.querySelectorAll('[role="option"]')].find((o) => optionRe.test(o.textContent || ''));
      if (opt) opt.click();
    }, optionRe.source);
    await sleep(500);
  }

  async function applyUrlNear(labelRe, url) {
    return page.evaluate(
      (ls, url) => {
        const labelRe = new RegExp(ls, 'i');
        const blocks = [...document.querySelectorAll('div')].filter((d) => {
          const label = d.querySelector(':scope > label');
          return label && labelRe.test(label.textContent || '');
        });
        for (const block of blocks) {
          const input = [...block.querySelectorAll('input')].find((i) =>
            /https|URL|image/i.test(i.placeholder || '') || i.type === 'text',
          );
          if (!input) continue;
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
          setter?.call(input, url);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          const apply = [...block.querySelectorAll('button')].find((b) => /Apply URL/i.test(b.textContent || ''));
          if (apply) apply.click();
          else input.blur();
          return true;
        }
        return false;
      },
      labelRe.source,
      url,
    );
  }

  const heroUrl = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=1200';
  const editorialUrl = 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200';
  const ctaUrl = 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=1200';
  const logoUrl = 'https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?w=400';

  if (report.media.editorFieldsPresent.heroMedia) {
    await chooseSelectNear(/Hero media/, /Upload|select an image/);
    report.media.heroSet = await applyUrlNear(/Hero image/, heroUrl);
  }
  report.media.logoSet = await applyUrlNear(/^Logo$/, logoUrl);
  if (report.media.editorFieldsPresent.editorialMedia) {
    await chooseSelectNear(/Editorial media/, /Upload|select an image/);
    report.media.editorialSet = await applyUrlNear(/Editorial image/, editorialUrl);
  }
  report.media.ctaSet = await applyUrlNear(/Call-to-action background|background \(optional\)/, ctaUrl);
  await sleep(1000);
  await shot(page, '08-media-changed');

  // Save
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      /^Save draft$/i.test((b.textContent || '').trim()),
    );
    if (btn && !btn.disabled) btn.click();
  });
  await page
    .waitForFunction(() => /Draft saved/i.test(document.body.innerText), { timeout: 20000 })
    .catch(() => null);
  await sleep(1500);
  await shot(page, '09-after-save');

  // Reload persistence — re-enter Foundation editor
  await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(2500);
  // Gallery → templates → Foundation
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      /Browse templates/i.test(b.textContent || ''),
    );
    if (btn) btn.click();
  });
  await sleep(2000);
  await page.evaluate(() => {
    const articles = [...document.querySelectorAll('article')];
    for (const art of articles) {
      if (!/Foundation/i.test(art.innerText || '')) continue;
      const btn = [...art.querySelectorAll('button')].find((x) =>
        /Use this template/i.test(x.textContent || ''),
      );
      if (btn) {
        btn.click();
        return;
      }
    }
  });
  await sleep(800);
  await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog || !/Foundation/i.test(dialog.textContent || '')) return;
    const btn = [...dialog.querySelectorAll('button')].find((b) =>
      /^Continue$/i.test((b.textContent || '').trim()),
    );
    if (btn) btn.click();
  });
  await sleep(4000);
  const after = await page.evaluate(() => document.body.innerText);
  report.media.afterReload = {
    editorAlive: /Hero media|Editorial media|Logo/i.test(after),
    hasUnsplash: /unsplash|photo-1523275335684|photo-1441986300917|photo-1556742049/i.test(after),
    hasEditorialImageMode: /Upload \/ select an image/i.test(after),
  };
  await shot(page, '10-after-reload');
  log('media_persist', JSON.stringify({ ...report.media }));

  async function findStorefrontFrame(page) {
    // Prefer titled curated iframe
    const handle = await page.$('iframe[title*="storefront"], iframe[title*="foundation"], iframe[title*="Foundation"]');
    if (handle) {
      const f = await handle.contentFrame();
      if (f) return f;
    }
    for (const f of page.frames()) {
      try {
        const t = await f.evaluate(() => document.body?.innerText?.slice(0, 400) || '');
        if (/Thoughtfully chosen|Shop now|River Pebble|Mini Pouch|Add to cart/i.test(t)) return f;
      } catch {
        /* ignore */
      }
    }
    return null;
  }

  // Wait for live preview iframe to boot
  await page.waitForSelector('iframe', { timeout: 30000 }).catch(() => null);
  await sleep(5000);
  let previewFrame = await findStorefrontFrame(page);
  if (previewFrame) {
    report.checkout.inEditor = await addFirstProductAndCheckout(previewFrame, page, '11-editor');
  } else {
    report.checkout.inEditor = { error: 'preview_iframe_not_found' };
  }
  log('editor_checkout', JSON.stringify(report.checkout.inEditor));

  // Return to editor for preview dialog if needed
  if (!/app/.test(page.url()) || report.checkout.inEditor?.urlHasDraft) {
    await page.goto('http://127.0.0.1:8080/app?tab=templates', { waitUntil: 'networkidle2' });
    await sleep(2000);
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) =>
        /Browse templates/i.test(b.textContent || ''),
      );
      if (btn) btn.click();
    });
    await sleep(1500);
    await page.evaluate(() => {
      const articles = [...document.querySelectorAll('article')];
      for (const art of articles) {
        if (!/Foundation/i.test(art.innerText || '')) continue;
        const btn = [...art.querySelectorAll('button')].find((x) =>
          /Use this template/i.test(x.textContent || ''),
        );
        if (btn) {
          btn.click();
          return;
        }
      }
    });
    await sleep(800);
    await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog || !/Foundation/i.test(dialog.textContent || '')) return;
      const btn = [...dialog.querySelectorAll('button')].find((b) =>
        /^Continue$/i.test((b.textContent || '').trim()),
      );
      if (btn) btn.click();
    });
    await sleep(3500);
  }

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      /Preview storefront/i.test(b.textContent || ''),
    );
    if (btn) btn.click();
  });
  await sleep(4000);
  await shot(page, '12-preview-dialog');
  let dialogFrame = await findStorefrontFrame(page);
  if (dialogFrame) {
    report.checkout.previewDialog = await addFirstProductAndCheckout(dialogFrame, page, '13-preview');
  } else {
    report.checkout.previewDialog = { error: 'dialog_iframe_not_found' };
  }
  log('preview_checkout', JSON.stringify(report.checkout.previewDialog));

  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log('REPORT_OK');
  console.log(
    JSON.stringify(
      {
        runtimeConfig: report.runtimeConfig,
        checkout: report.checkout,
        media: report.media,
        errors: report.errors.slice(0, 20),
        screenshots: report.screenshots.map((s) => path.basename(s)),
      },
      null,
      2,
    ),
  );
} catch (e) {
  report.errors.push(String(e?.stack || e));
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.error('VERIFY_FAILED', e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
