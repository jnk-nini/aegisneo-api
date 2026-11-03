// Renders saved command output (docs/part2/evidence/...) as terminal-window figures.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const [,, repo, groupsFile] = process.argv;
const groups = JSON.parse(fs.readFileSync(groupsFile, 'utf8'));
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function colour(text) {
  return text.split('\n').map(l => {
    if (l.startsWith('$ ')) return `<span class="cmd">${esc(l)}</span>`;
    if (l.startsWith('HTTP status:')) return `<span class="st">${esc(l)}</span>`;
    if (l.trimStart().startsWith('# ')) return `<span class="note">${esc(l)}</span>`;
    return esc(l).replace(/^(\s*)(&quot;|")([^"]+)(")(:)/, '$1<span class="k">"$3"</span>:');
  }).join('\n');
}
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 760, height: 400 }, deviceScaleFactor: 2.6 });
  for (const g of groups) {
    const body = g.files.map(f => fs.readFileSync(path.join(repo, f), 'utf8').trimEnd()).join('\n\n');
    const html = `<!doctype html><meta charset="utf-8"><style>
      body{margin:0;background:#fff;font-family:'DejaVu Sans Mono',monospace}
      .win{width:760px;background:#1e1e1e;border-radius:6px;overflow:hidden}
      .bar{height:30px;background:#2d2d2d;display:flex;align-items:center;padding:0 12px;position:relative}
      .d{width:11px;height:11px;border-radius:50%;margin-right:7px}
      .t{position:absolute;left:0;right:0;text-align:center;color:#c8c8c8;font:12.5px Carlito,sans-serif}
      pre{margin:0;padding:14px 18px 16px;color:#d4d4d4;font-size:12.5px;line-height:1.42;white-space:pre-wrap;word-break:break-all}
      .cmd{color:#7fd47f;font-weight:bold}.st{color:#7cb7ff}.k{color:#9cdcfe}.note{color:#8a8a8a}
    </style><div class="win"><div class="bar"><span class="d" style="background:#ff5f57"></span><span class="d" style="background:#febc2e"></span><span class="d" style="background:#28c840"></span><div class="t">${esc(g.title)}</div></div><pre>${colour(body)}</pre></div>`;
    await page.setContent(html);
    const el = await page.$('.win');
    await el.screenshot({ path: path.join(repo, g.out) });
    console.log('wrote', g.out);
  }
  await browser.close();
})();
