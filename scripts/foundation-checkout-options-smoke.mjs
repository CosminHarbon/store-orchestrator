import fs from 'fs';
import puppeteer from 'puppeteer-core';

const html = fs.readFileSync('.tmp/runtime-live-preview/index.html', 'utf8');
const m = html.match(/window\.__SV_RUNTIME__=(\{.*?\});/);
const cfg = JSON.parse(m[1]);
const key = cfg.storeApiKey;
const products = await fetch('http://127.0.0.1:8787/functions/v1/store-api/products', {
  headers: { 'X-API-Key': key },
}).then((r) => r.json());
const pid = products.products[0].id;
const draft = await fetch('http://127.0.0.1:8787/functions/v1/store-api/checkout-draft', {
  method: 'POST',
  headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    items: [{ product_id: pid, quantity: 1 }],
    return_origin: 'http://127.0.0.1:8080',
    return_path: '/',
    hosted_checkout_origin: 'http://127.0.0.1:8080',
  }),
}).then((r) => r.json());

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox'],
  defaultViewport: { width: 1440, height: 1100 },
});
const page = await browser.newPage();
await page.goto(draft.checkout_url, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await new Promise((r) => setTimeout(r, 1000));
await page.screenshot({
  path: '.tmp/foundation-fix-verify/14-checkout-payment-options.png',
  fullPage: true,
});
const text = await page.evaluate(() => document.body.innerText);
const result = {
  home: /Home delivery/i.test(text),
  locker: /Locker delivery/i.test(text),
  card: /Card|Netopia/i.test(text),
  cod: /Cash|COD|ramburs|pay at/i.test(text),
  paymentSection: /Payment/i.test(text),
  snippet: text.replace(/\s+/g, ' ').slice(0, 800),
};
console.log(JSON.stringify(result, null, 2));
await browser.close();
