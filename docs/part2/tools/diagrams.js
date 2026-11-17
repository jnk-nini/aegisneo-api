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
// Ten tables. Lines use crow's-foot ends: bar = one, foot = many, circle = optional.
function entity(x, y, w, name, rows, o = {}) {
  const rh = 30, hh = 38, tagW = 62;
  let s = `<rect x='${x}' y='${y}' width='${w}' height='${hh + rows.length * rh}' fill='#fff' stroke='${C.navy}' stroke-width='1.5'/>`;
  s += `<rect x='${x}' y='${y}' width='${w}' height='${hh}' fill='${o.fill || C.navy}'/>` + T(x + w / 2, y + 26, name, { bold: true, fill: '#fff', anchor: 'middle', size: 19 });
  const pos = {};
  rows.forEach((r, i) => {
    const ry = y + hh + i * rh;
    if (i % 2) s += `<rect x='${x + 0.8}' y='${ry}' width='${w - 1.6}' height='${rh}' fill='${C.soft}'/>`;
    s += T(x + 10, ry + 20, r[0], { bold: true, fill: C.blue, size: 13.5 });
    s += T(x + tagW, ry + 20, r[1], { size: 16, bold: r[0].startsWith('PK') });
    s += T(x + w - 10, ry + 20, r[2], { size: 14, fill: C.muted, anchor: 'end' });
    pos[r[1]] = ry + rh / 2;
  });
  s += `<line x1='${x + tagW - 6}' y1='${y + hh}' x2='${x + tagW - 6}' y2='${y + hh + rows.length * rh}' stroke='#d5dde8'/>`;
  return { s, pos, x, y, w, h: hh + rows.length * rh, right: x + w, bottom: y + hh + rows.length * rh };
}
// An end marker at (x, y) on the side of an entity ('l' or 'r').
function endMark(x, y, side, kind) {
  const o = side === 'r' ? 1 : -1, st = `stroke='${C.line}' stroke-width='1.7' fill='none'`;
  let s = '';
  if (kind === 'many' || kind === 'zmany') s += `<path d='M${x + o * 17},${y} L${x},${y - 9} M${x + o * 17},${y} L${x},${y + 9}' ${st}/>`;
  if (kind === 'one' || kind === 'zone') s += `<line x1='${x + o * 12}' y1='${y - 9}' x2='${x + o * 12}' y2='${y + 9}' ${st}/>`;
  if (kind === 'zone' || kind === 'zmany') s += `<circle cx='${x + o * 27}' cy='${y}' r='6' fill='#fff' stroke='${C.line}' stroke-width='1.7'/>`;
  return s;
}
function rel(pts, a, b, label, o = {}) {
  let s = `<path d='M${pts.map(p => p.join(',')).join(' L')}' fill='none' stroke='${C.line}' stroke-width='1.6'${o.dash ? " stroke-dasharray='6 4'" : ''}/>`;
  s += endMark(pts[0][0], pts[0][1], a[0], a[1]) + endMark(pts.at(-1)[0], pts.at(-1)[1], b[0], b[1]);
  if (label) {
    const [lx, ly] = o.at || pts[Math.floor(pts.length / 2) - 1].map((v, i) => (v + pts[Math.floor(pts.length / 2)][i]) / 2);
    s += `<rect x='${lx - label.length * 3.7 - 4}' y='${ly - 11}' width='${label.length * 7.4 + 8}' height='20' fill='#fff'/>` + T(lx, ly + 5, label, { anchor: 'middle', italic: true, size: 14, fill: C.muted });
  }
  return s;
}
function erd() {
  const W = 1180, X1 = 40, X2 = 440, X3 = 840, CW = 300;
  const roles = entity(X1, 30, CW, 'roles', [['PK', 'name', 'text'], ['', 'description', 'text']]);
  const users = entity(X1, 190, CW, 'users', [['PK', 'id', 'integer'], ['UK', 'username', 'text'], ['', 'password_hash', 'text'], ['FK', 'role', 'text'], ['', 'created_at', 'timestamptz']]);
  const ubadge = entity(X1, 450, CW, 'user_badges', [['PK,FK', 'user_id', 'integer'], ['PK,FK', 'badge', 'text'], ['', 'earned_at', 'timestamptz']]);
  const badges = entity(X1, 630, CW, 'badges', [['PK', 'code', 'text'], ['', 'name', 'text'], ['', 'description', 'text'], ['', 'icon', 'text'], ['', 'sort_order', 'smallint']]);
  const access = entity(X2, 30, CW, 'site_access', [['PK,FK', 'role', 'text'], ['PK,FK', 'site', 'text'], ['', 'can_write', 'boolean'], ['', 'item_limit', 'integer, null = all']], { fill: C.blue });
  const launch = entity(X2, 250, CW, 'launches', [['PK', 'id', 'bigint'], ['FK', 'user_id', 'integer, null = guest'], ['FK', 'site', 'text'], ['FK', 'role', 'text'], ['', 'launched_at', 'timestamptz']]);
  const watch = entity(X2, 500, CW, 'watchlist', [['PK,FK', 'user_id', 'integer'], ['PK,FK', 'neo_reference_id', 'text'], ['', 'added_at', 'timestamptz']]);
  const sites = entity(X3, 30, CW, 'sites', [['PK', 'slug', 'text'], ['', 'name', 'text'], ['', 'kind', "'main' or 'partner'"], ['', 'description', 'text'], ['', 'url', 'text'], ['', 'sort_order', 'smallint']]);
  const ast = entity(X3, 320, CW, 'asteroids', [['PK', 'neo_reference_id', 'text'], ['UK', 'name', 'text'], ['', 'estimated_diameter_km', 'float8'], ['', 'is_potentially_hazardous', 'boolean'], ['', 'close_approach_date', 'date'], ['', 'relative_velocity_km_h', 'float8'], ['', 'miss_distance_km', 'float8'], ['', 'absolute_magnitude', 'float8'], ['', 'is_featured', 'boolean'], ['FK', 'created_by', 'integer, null'], ['', 'created_at', 'timestamptz'], ['', 'updated_at', 'timestamptz']]);
  const audit = entity(X3, 800, CW, 'asteroid_audit', [['PK', 'id', 'bigint'], ['', 'neo_reference_id', 'text (no FK)'], ['', 'asteroid_name', 'text'], ['FK', 'user_id', 'integer, null'], ['', 'action', 'create, update, delete'], ['', 'changes', 'jsonb'], ['', 'changed_at', 'timestamptz']]);
  const H = audit.bottom + 90;
  let s = [roles, users, ubadge, badges, access, launch, watch, sites, ast, audit].map(e => e.s).join('');
  const R = (e, r) => [e.right, e.pos[r]], L = (e, r) => [e.x, e.pos[r]];
  // roles - site_access, sites - site_access
  s += rel([R(roles, 'name'), L(access, 'role')], ['r', 'one'], ['l', 'many'], 'defines');
  s += rel([L(sites, 'slug'), R(access, 'site')], ['l', 'one'], ['r', 'many'], 'is open to');
  // roles - users (vertical)
  // users - launches, launches - sites, launches - roles
  s += rel([R(users, 'id'), [400, users.pos.id], [400, launch.pos.user_id], L(launch, 'user_id')], ['r', 'one'], ['l', 'zmany'], 'opens', { at: [400, (users.pos.id + launch.pos.user_id) / 2] });
  s += rel([R(launch, 'site'), [790, launch.pos.site], [790, sites.pos.slug + 40], [X3, sites.pos.slug + 40]], ['r', 'many'], ['l', 'one'], 'is opened', { at: [790, 150] });
  s += rel([L(launch, 'role'), [380, launch.pos.role], [380, roles.pos.description], R(roles, 'description')], ['l', 'many'], ['r', 'one'], 'held as', { at: [380, 120] });
  // users - watchlist - asteroids
  s += rel([R(users, 'role'), [410, users.pos.role], [410, watch.pos.user_id], L(watch, 'user_id')], ['r', 'one'], ['l', 'many'], 'watches', { at: [410, 400] });
  s += rel([R(watch, 'neo_reference_id'), [790, watch.pos.neo_reference_id], [790, ast.pos.neo_reference_id], L(ast, 'neo_reference_id')], ['r', 'many'], ['l', 'one'], 'is watched', { at: [790, 480] });
  // users - user_badges - badges (vertical)
  // asteroids.created_by and audit.user_id: lines round the outside
  s += rel([L(users, 'id'), [14, users.pos.id], [14, 12], [W - 14, 12], [W - 14, ast.pos.created_by], R(ast, 'created_by')], ['l', 'one'], ['r', 'zmany'], 'creates', { at: [600, 12] });
  s += rel([L(users, 'created_at'), [22, users.pos.created_at], [22, H - 30], [W - 30, H - 30], [W - 30, audit.pos.user_id], R(audit, 'user_id')], ['l', 'one'], ['r', 'zmany'], 'makes changes recorded in', { at: [600, H - 30] });
  s += rel([[X3 + 150, ast.bottom], [X3 + 150, audit.y]], ['l', 'one'], ['l', 'zmany'], 'history kept, no FK', { dash: true, at: [X3 + 150, (ast.bottom + audit.y) / 2] });
  // vertical links with proper ends
  s += `<path d='M${X1 + 150},${roles.bottom} V${users.y}' stroke='${C.line}' stroke-width='1.6' fill='none'/>`;
  s += `<path d='M${X1 + 150},${users.bottom} V${ubadge.y}' stroke='${C.line}' stroke-width='1.6' fill='none'/>`;
  s += `<path d='M${X1 + 150},${badges.y} V${ubadge.bottom}' stroke='${C.line}' stroke-width='1.6' fill='none'/>`;
  const vEnd = (x, y, down, kind) => { // marker on a vertical line; down = line leaves the entity downwards
    const o = down ? 1 : -1, st = `stroke='${C.line}' stroke-width='1.7' fill='none'`;
    if (kind === 'one') return `<line x1='${x - 9}' y1='${y + o * 12}' x2='${x + 9}' y2='${y + o * 12}' ${st}/>`;
    return `<path d='M${x},${y + o * 17} L${x - 9},${y} M${x},${y + o * 17} L${x + 9},${y}' ${st}/>`;
  };
  s += vEnd(X1 + 150, roles.bottom, true, 'one') + vEnd(X1 + 150, users.y, false, 'many');
  s += vEnd(X1 + 150, users.bottom, true, 'one') + vEnd(X1 + 150, ubadge.y, false, 'many');
  s += vEnd(X1 + 150, badges.y, false, 'one') + vEnd(X1 + 150, ubadge.bottom, true, 'many');
  s += vEnd(X3 + 150, ast.bottom, true, 'one') + vEnd(X3 + 150, audit.y, false, 'many');
  const lab = (x, y, t) => `<rect x='${x - t.length * 3.7 - 4}' y='${y - 11}' width='${t.length * 7.4 + 8}' height='20' fill='#fff'/>` + T(x, y + 5, t, { anchor: 'middle', italic: true, size: 14, fill: C.muted });
  s += lab(X1 + 150, (roles.bottom + users.y) / 2, 'holds') + lab(X1 + 150, (users.bottom + ubadge.y) / 2, 'earns') + lab(X1 + 150, (ubadge.bottom + badges.y) / 2, 'awarded as');
  // legend
  const ly = ubadge.bottom + 0;
  s += T(X2, 760, 'Legend', { bold: true, fill: C.navy, size: 16 });
  ['PK primary key, UK unique, FK foreign key', 'Bar = one, foot = many, circle = optional', 'site_access: one row per role and site;', 'limits change with an UPDATE, not a deploy.', 'launches.user_id is empty for a guest.', 'asteroid_audit is append-only for the API.'].forEach((t, i) => { s += T(X2, 786 + i * 22, t, { size: 14.5, fill: C.muted }); });
  return { W, H, body: s };
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
const PH = [['Visitor', 'browser'], ['Hub', 'AegisNEO site'], ['API', 'FastAPI'], ['Partner site', 'server function'], ['Neon', 'PostgreSQL']];
const hubFlow = seq(PH, [
  { section: 'A. Open a partner site from the hub' },
  { f: 0, t: 1, l: 'click "Open Impactor"' },
  { f: 1, t: 2, l: 'POST /sites/impactor/launch', l2: 'Bearer token (or none: guest)' },
  { f: 2, t: 4, l: 'rule for (role, site); INSERT launch', l2: 'award badges' },
  { f: 2, t: 1, l: 'url + ticket (aud = impactor)', l2: 'guest: no ticket', r: 1 },
  { f: 1, t: 0, l: 'redirect to url#aegis_ticket=...', l2: 'fragment: never sent to a server', r: 1 },
  { section: 'B. The partner site asks for data' },
  { f: 0, t: 3, l: 'GET /api/neo/asteroids', l2: 'header x-aegisneo-ticket' },
  { f: 3, t: 2, l: 'GET /api/v1/asteroids', l2: 'x-api-key + Bearer ticket' },
  { f: 2, t: 2, self: 1, l: 'ticket valid, aud = key owner?', l2: 'no: 401' },
  { f: 2, t: 4, l: 'site_access row, then SELECT', l2: 'item_limit empty: all; 10: featured' },
  { f: 2, t: 0, l: '200 OK, access "full" or "limited"', l2: 'via the partner site', r: 1 },
]);
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ deviceScaleFactor: 2.5 });
  for (const [name, d] of [['erd', erd()], ['architecture', arch()], ['flow-login-create', create], ['flow-guest-list', guest], ['flow-hub-launch', hubFlow]]) {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${d.W}' height='${d.H}' viewBox='0 0 ${d.W} ${d.H}'>${defs}<rect width='100%' height='100%' fill='#fff'/>${d.body}</svg>`;
    fs.writeFileSync(path.join(out, name + '.svg'), svg);
    await pg.setViewportSize({ width: d.W, height: d.H });
    await pg.setContent(`<body style='margin:0'>${svg}</body>`);
    await pg.screenshot({ path: path.join(out, name + '.png'), clip: { x: 0, y: 0, width: d.W, height: d.H } });
    console.log('wrote', name, d.W, 'x', d.H);
  }
  await b.close();
})();
