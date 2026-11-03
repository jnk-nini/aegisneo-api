const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const [,, repo, swaggerDir] = process.argv;
const out = path.join(repo, 'docs/part2/screenshots/phase1');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch();
  // Swagger UI: CDN files are served from the npm copy of swagger-ui-dist.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  await ctx.route('https://cdn.jsdelivr.net/**', r => {
    const f = path.join(swaggerDir, path.basename(new URL(r.request().url()).pathname));
    fs.existsSync(f) ? r.fulfill({ path: f }) : r.fulfill({ status: 404, body: '' });
  });
  await ctx.route('https://fastapi.tiangolo.com/**', r => r.fulfill({ status: 404, body: '' }));
  const p = await ctx.newPage();
  await p.goto('http://localhost:8000/docs');
  await p.waitForSelector('.opblock', { timeout: 15000 });
  await p.screenshot({ path: `${out}/swagger-before.png`, fullPage: true });
  // Expand the list endpoint to show its parameters.
  await p.click('#operations-default-get_asteroids_api_v1_asteroids_get .opblock-summary');
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}/swagger-before-list-params.png`, fullPage: true });
  await ctx.close();
  // Website: the live API host is answered by the local copy of the same code.
  for (const [name, vp] of [['website-before-desktop', { width: 1280, height: 900 }], ['website-before-phone', { width: 390, height: 844 }]]) {
    const c = await browser.newContext({ viewport: vp, deviceScaleFactor: 2 });
    await c.route('https://aegisneo-api.vercel.app/**', async r => {
      const u = new URL(r.request().url());
      const resp = await c.request.fetch('http://localhost:8000' + u.pathname + u.search, { headers: r.request().headers() });
      r.fulfill({ response: resp, headers: { ...resp.headers(), 'access-control-allow-origin': '*' } });
    });
    await c.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, body: '' }));
    const pg = await c.newPage();
    await pg.goto('file://' + path.join(repo, 'frontend/index.html'));
    await pg.waitForFunction(() => !document.body.innerText.includes("Locating notable"), null, { timeout: 15000 }).catch(() => {}); await pg.waitForTimeout(2500);
    await pg.screenshot({ path: `${out}/${name}.png`, fullPage: false });
    await c.close();
  }
  await browser.close();
})();
