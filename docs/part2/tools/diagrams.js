// Draws the Phase 2 and Phase 3 diagrams as SVG and PNG (docs/part2/diagrams/).
// Canvas widths are kept near 900-1000 px so the text prints at about 8-9 pt at 6.5 in.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const out = path.join(process.argv[2], 'docs/part2/diagrams');
fs.mkdirSync(out, { recursive: true });
const C = { navy: '#1F3864', blue: '#2E5597', line: '#5B7290', fill: '#EEF3FA', text: '#222', muted: '#4f5866', soft: '#F6F8FB', border: '#9AAFC7', lane: '#b9c6d6' };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const T = (x, y, s, o = {}) => `<text x='${x}' y='${y}' font-family='Carlito, Calibri, sans-serif' font-size='${o.size || 17}' fill='${o.fill || C.text}'${o.bold ? " font-weight='bold'" : ''}${o.italic ? " font-style='italic'" : ''} text-anchor='${o.anchor || 'start'}'>${esc(s)}</text>`;
const defs = `<defs><marker id='a' viewBox='0 0 10 10' refX='9' refY='5' markerWidth='7' markerHeight='7' orient='auto-start-reverse'><path d='M0,0 L10,5 L0,10 z' fill='${C.line}'/></marker></defs>`;
const path_ = (pts, o = {}) => `<path d='M${pts.map(p => p.join(',')).join(' L')}' fill='none' stroke='${C.line}' stroke-width='1.6'${o.dash ? " stroke-dasharray='6 4'" : ''}${o.noArrow ? '' : " marker-end='url(#a)'"}/>`;
function box(x, y, w, h, title, lines = [], o = {}) {
  let s = `<rect x='${x}' y='${y}' width='${w}' height='${h}' rx='4' fill='${o.fill || '#fff'}' stroke='${o.stroke || C.navy}' stroke-width='1.4'${o.dash ? " stroke-dasharray='6 4'" : ''}/>`;
  const lh = 19, block = 20 + lines.length * lh;
  const top = y + (h - block) / 2 + 15;
  s += T(x + w / 2, top, title, { bold: true, anchor: 'middle', size: 17.5, fill: C.navy });
  lines.forEach((l, i) => s += T(x + w / 2, top + 22 + i * lh, l, { anchor: 'middle', size: 15.5, fill: C.muted }));
  return s;
}
const container = (x, y, w, h, title, sub) => `<rect x='${x}' y='${y}' width='${w}' height='${h}' rx='6' fill='${C.soft}' stroke='${C.border}' stroke-width='1.3'/>` + T(x + 16, y + 28, title, { bold: true, size: 18, fill: C.navy }) + (sub || []).map((l, i) => T(x + 16, y + 49 + i * 18, l, { size: 15, fill: C.muted })).join('');

// ---------- ERD ----------
function entity(x, y, w, name, rows) {
  const rh = 32, hh = 38;
  let s = `<rect x='${x}' y='${y}' width='${w}' height='${hh + rows.length * rh}' fill='#fff' stroke='${C.navy}' stroke-width='1.5'/>`;
  s += `<rect x='${x}' y='${y}' width='${w}' height='${hh}' fill='${C.navy}'/>` + T(x + w / 2, y + 26, name, { bold: true, fill: '#fff', anchor: 'middle', size: 20 });
  const pos = {};
  rows.forEach((r, i) => {
    const ry = y + hh + i * rh;
    if (i % 2) s += `<rect x='${x + 0.8}' y='${ry}' width='${w - 1.6}' height='${rh}' fill='${C.soft}'/>`;
    s += T(x + 12, ry + 21, r[0], { bold: true, fill: C.blue, size: 14.5 });
    s += T(x + 50, ry + 21, r[1], { size: 17, bold: r[0] === 'PK' });
    s += T(x + w - 12, ry + 21, r[2], { size: 15.5, fill: C.muted, anchor: 'end' });
    pos[r[1]] = ry + rh / 2;
  });
  s += `<line x1='${x + 42}' y1='${y + hh}' x2='${x + 42}' y2='${y + hh + rows.length * rh}' stroke='#d5dde8'/>`;
  return { s, pos, h: hh + rows.length * rh };
}
function erd() {
  const W = 960;
  const u = entity(20, 60, 340, 'users', [['PK', 'id', 'integer (identity)'], ['UK', 'username', 'text'], ['', 'password_hash', 'text'], ['', 'created_at', 'timestamptz']]);
  const a = entity(520, 20, 420, 'asteroids', [['PK', 'neo_reference_id', 'text'], ['UK', 'name', 'text'], ['', 'estimated_diameter_km', 'double precision'], ['', 'is_potentially_hazardous', 'boolean'], ['', 'close_approach_date', 'date'], ['', 'relative_velocity_km_h', 'double precision'], ['', 'miss_distance_km', 'double precision'], ['', 'absolute_magnitude', 'double precision'], ['', 'is_featured', 'boolean'], ['FK', 'created_by', 'integer (nullable)'], ['', 'created_at', 'timestamptz'], ['', 'updated_at', 'timestamptz']]);
  const y1 = u.pos.id, y2 = a.pos.created_by, x1 = 360, x2 = 520, mx = 440;
  let s = `<path d='M${x1},${y1} H${mx} V${y2} H${x2}' fill='none' stroke='${C.line}' stroke-width='1.7'/>`;
  s += `<line x1='${x1 + 14}' y1='${y1 - 10}' x2='${x1 + 14}' y2='${y1 + 10}' stroke='${C.line}' stroke-width='1.7'/><circle cx='${x1 + 29}' cy='${y1}' r='6.5' fill='#fff' stroke='${C.line}' stroke-width='1.7'/>`;
  s += `<path d='M${x2 - 17},${y2} L${x2},${y2 - 10} M${x2 - 17},${y2} L${x2},${y2 + 10}' stroke='${C.line}' stroke-width='1.7'/><circle cx='${x2 - 28}' cy='${y2}' r='6.5' fill='#fff' stroke='${C.line}' stroke-width='1.7'/>`;
  s += `<rect x='${mx - 62}' y='${(y1 + y2) / 2 - 30}' width='124' height='52' fill='#fff'/>`;
  s += T(mx, (y1 + y2) / 2 - 10, 'creates', { anchor: 'middle', italic: true, fill: C.muted, size: 16 });
  s += T(mx, (y1 + y2) / 2 + 12, '0..1 to 0..n', { anchor: 'middle', fill: C.muted, size: 15.5 });
  const ly = 60 + u.h + 50;
  s += T(20, ly, 'Legend', { bold: true, fill: C.navy, size: 17 });
  s += T(20, ly + 26, 'PK = primary key, UK = unique, FK = foreign key', { size: 15.5, fill: C.muted });
  s += T(20, ly + 50, 'asteroids.created_by references users.id', { size: 15.5, fill: C.muted });
  s += T(20, ly + 74, '(ON DELETE SET NULL)', { size: 15.5, fill: C.muted });
  s += T(20, ly + 98, 'created_by is empty for the 33,511', { size: 15.5, fill: C.muted });
  s += T(20, ly + 122, 'imported records', { size: 15.5, fill: C.muted });
  return { W, H: 20 + a.h + 20, body: u.s + a.s + s };
}

// ---------- Architecture ----------
function arch() {
  const W = 920, H = 700; let s = '';
  s += T(20, 30, 'Clients', { bold: true, size: 18, fill: C.navy });
  s += box(20, 50, 200, 96, 'AegisNEO website', ['frontend/', 'login screen']);
  s += box(20, 172, 200, 96, 'Swagger UI', ['/docs', 'Authorize button']);
  s += box(20, 294, 200, 96, 'Partner sites', ['Impactor, NEO Atlas', 'key kept on their server']);
  s += T(120, 428, 'Credentials sent', { bold: true, size: 16, fill: C.navy, anchor: 'middle' });
  s += T(120, 450, 'Bearer token (user)', { size: 15, fill: C.muted, anchor: 'middle' });
  s += T(120, 470, 'x-api-key (partner site)', { size: 15, fill: C.muted, anchor: 'middle' });
  s += T(120, 490, 'nothing (guest)', { size: 15, fill: C.muted, anchor: 'middle' });
  s += container(260, 10, 380, 590, 'Vercel (Python function)', ['FastAPI, region sin1 (Singapore)']);
  s += box(280, 82, 340, 74, 'Routes', ['api/index.py']);
  s += box(280, 196, 160, 84, 'Access control', ['api/auth.py']);
  s += box(460, 196, 160, 84, 'Validation', ['api/models.py']);
  s += box(280, 320, 340, 74, 'Data access layer', ['api/db.py, psycopg 3']);
  s += box(280, 450, 340, 124, 'Environment variables', ['DATABASE_URL', 'JWT_SECRET', 'AEGISNEO_API_KEYS'], { dash: true, stroke: C.line });
  s += path_([[450, 156], [450, 176], [360, 176], [360, 196]]) + path_([[450, 176], [540, 176], [540, 196]]);
  s += path_([[360, 280], [360, 320]]) + path_([[540, 280], [540, 320]]);
  for (const y of [98, 220, 342]) s += path_([[220, y], [240, y], [240, 119], [280, 119]], { noArrow: y !== 98 });
  s += path_([[240, 119], [280, 119]]);
  s += `<rect x='226' y='60' width='50' height='20' fill='#fff'/>` + T(251, 75, 'HTTPS', { size: 14.5, fill: C.muted, anchor: 'middle' });
  s += container(700, 10, 200, 470, 'Neon', ['PostgreSQL 18', 'AWS Singapore']);
  s += box(712, 100, 176, 84, 'Pooler', ['PgBouncer', 'TLS required']);
  s += box(712, 224, 176, 230, 'Database', ['neondb', '', 'tables:', 'users, asteroids', '', 'API role:', 'aegis_app']);
  s += path_([[800, 184], [800, 224]]);
  s += path_([[620, 357], [668, 357], [668, 142], [712, 142]]);
  s += `<rect x='642' y='222' width='52' height='46' fill='#fff'/>` + T(668, 240, 'TLS', { size: 14.5, fill: C.muted, anchor: 'middle' }) + T(668, 260, 'aegis_app', { size: 14, fill: C.muted, anchor: 'middle' });
  s += box(700, 590, 200, 96, 'Setup scripts', ['developer machine', 'role neondb_owner'], { dash: true, stroke: C.line });
  s += path_([[800, 590], [800, 454]], { dash: true });
  return { W, H, body: s };
}

// ---------- Sequence diagrams ----------
function seq(parts, msgs) {
  const colW = 180, x0 = 20, top = 16, ph = 60, rowH = 50, rightPad = 60;
  const cx = i => x0 + colW / 2 + i * colW;
  const W = x0 + colW * parts.length + rightPad; let y = top + ph + 36;
  let s = '', n = 0;
  for (const m of msgs) {
    if (m.section) {
      s += `<rect x='6' y='${y - 8}' width='${W - 12}' height='28' fill='${C.fill}'/>` + T(14, y + 12, m.section, { bold: true, size: 16.5, fill: C.navy });
      y += 60; continue;
    }
    n++;
    const a = cx(m.f), b = cx(m.t);
    if (m.self) {
      s += `<path d='M${a},${y - 6} H${a + 36} V${y + 16} H${a + 4}' fill='none' stroke='${C.line}' stroke-width='1.5' marker-end='url(#a)'/>`;
      s += T(a + 44, y + 2, `${n}. ${m.l}`, { size: 16 });
      if (m.l2) s += T(a + 44, y + 22, m.l2, { size: 15, fill: C.muted });
      y += rowH + 14; continue;
    }
    const dir = b > a ? 1 : -1;
    s += `<line x1='${a}' y1='${y}' x2='${b - dir * 2}' y2='${y}' stroke='${C.line}' stroke-width='1.5'${m.r ? " stroke-dasharray='6 4'" : ''} marker-end='url(#a)'/>`;
    const lx = Math.min(a, b) + 8;
    s += T(lx, y - 8, `${n}. ${m.l}`, { size: 16 });
    if (m.l2) s += T(lx, y + 19, m.l2, { size: 15, fill: C.muted });
    y += m.l2 ? rowH + 8 : rowH;
  }
  const H = y + 2;
  let lanes = '';
  parts.forEach((p, i) => {
    lanes += `<line x1='${cx(i)}' y1='${top + ph}' x2='${cx(i)}' y2='${H - 6}' stroke='${C.lane}' stroke-dasharray='4 4'/>`;
    lanes += box(cx(i) - colW / 2 + 10, top, colW - 20, ph, p[0], [p[1]]);
  });
  return { W, H, body: lanes + s };
}
const P = [['Client', 'website, Swagger'], ['Routes', 'api/index.py'], ['Access control', 'api/auth.py'], ['Data access', 'api/db.py'], ['Neon', 'PostgreSQL']];
const create = seq(P, [
  { section: 'A. Log in' },
  { f: 0, t: 1, l: 'POST /api/v1/auth/login', l2: 'username, password' },
  { f: 1, t: 3, l: 'get_user_by_username()' },
  { f: 3, t: 4, l: 'SELECT … FROM users', l2: 'WHERE username = %s' },
  { f: 4, t: 3, l: 'one row or none', r: 1 },
  { f: 3, t: 1, l: 'user record with hash', r: 1 },
  { f: 1, t: 2, l: 'check password, sign JWT', l2: 'wrong password: 401' },
  { f: 1, t: 0, l: '200 OK, access_token', r: 1 },
  { section: 'B. Create a record' },
  { f: 0, t: 1, l: 'POST /api/v1/asteroids', l2: 'Bearer token, JSON body' },
  { f: 1, t: 2, l: 'verify token', l2: 'missing or invalid: 401' },
  { f: 1, t: 1, self: 1, l: 'validate body', l2: 'invalid: 422' },
  { f: 1, t: 3, l: 'create_asteroid(data, user)' },
  { f: 3, t: 4, l: 'INSERT … RETURNING *' },
  { f: 4, t: 3, l: 'row, or error 23505', r: 1 },
  { f: 3, t: 1, l: 'record, or duplicate error', r: 1 },
  { f: 1, t: 0, l: '201 Created, the record', l2: 'duplicate: 409, database down: 503', r: 1 },
]);
const guest = seq(P, [
  { f: 0, t: 1, l: 'GET /api/v1/asteroids', l2: '?hazardous=true, no credentials' },
  { f: 1, t: 2, l: 'identify caller', l2: 'no token, no key: guest' },
  { f: 1, t: 3, l: 'list_asteroids(featured_only)' },
  { f: 3, t: 4, l: 'SELECT … WHERE', l2: 'is_featured … LIMIT 10' },
  { f: 4, t: 3, l: 'featured rows', r: 1 },
  { f: 3, t: 1, l: 'rows and match count', r: 1 },
  { f: 1, t: 0, l: '200 OK, access "guest"', r: 1 },
]);
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ deviceScaleFactor: 2.5 });
  for (const [name, d] of [['erd', erd()], ['architecture', arch()], ['flow-login-create', create], ['flow-guest-list', guest]]) {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${d.W}' height='${d.H}' viewBox='0 0 ${d.W} ${d.H}'>${defs}<rect width='100%' height='100%' fill='#fff'/>${d.body}</svg>`;
    fs.writeFileSync(path.join(out, name + '.svg'), svg);
    await pg.setViewportSize({ width: d.W, height: d.H });
    await pg.setContent(`<body style='margin:0'>${svg}</body>`);
    await pg.screenshot({ path: path.join(out, name + '.png'), clip: { x: 0, y: 0, width: d.W, height: d.H } });
    console.log('wrote', name, d.W, 'x', d.H);
  }
  await b.close();
})();
