import fs from 'fs';
import puppeteer from 'puppeteer-core';

const inject = JSON.parse(fs.readFileSync('.tmp/foundation-auth-inject.json', 'utf8'));
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox', '--window-size=1440,900'],
  defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();
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
await new Promise((r) => setTimeout(r, 4000));
const info = await page.evaluate(() => ({
  url: location.href,
  snippet: document.body.innerText.replace(/\s+/g, ' ').slice(0, 500),
}));
console.log(JSON.stringify(info, null, 2));
await page.screenshot({ path: '.tmp/foundation-fix-verify/auth-inject-test2.png' });
await browser.close();
