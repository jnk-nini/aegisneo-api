// Builds docs/part2/AegisNEO_Part2_Final_Report.docx (implementation and technical evaluation report)
// Usage: node build_final_report.js <repo> [toc.json]
const fs = require('fs'), path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, LevelFormat, ImageRun,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, PageBreak, TabStopType,
  TableLayoutType, VerticalAlign,
} = require('docx');


const REPO = process.argv[2];
const TOC = process.argv[3] && fs.existsSync(process.argv[3]) ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) : {};
const OUT = path.join(REPO, 'docs/part2/AegisNEO_Part2_Final_Report.docx');
const NAVY = '1F3864', BLUE = '2E5597', GREY = '595959', CODEBG = 'F2F2F2', RULE = 'BFBFBF';
const FONT = 'Calibri', MONO = 'Consolas';
const CONTENT_W = 9360; // 6.5 in

// ---------- inline text: `code` and **bold** ----------
function runs(text, opts = {}) {
  const { codeSize, ...base } = opts;
  const out = [];
  for (const part of String(text).split(/(`[^`]+`|\*\*[^*]+\*\*)/)) {
    if (!part) continue;
    if (part.startsWith('`')) out.push(new TextRun({ ...base, text: part.slice(1, -1), font: MONO, size: codeSize || (base.size || 22) - 2 }));
    else if (part.startsWith('**')) out.push(new TextRun({ ...base, text: part.slice(2, -2), bold: true }));
    else out.push(new TextRun({ ...base, text: part }));
  }
  return out;
}
const P = (text, o = {}) => new Paragraph({ children: runs(text, o.run || {}), spacing: { after: o.after ?? 120, before: o.before ?? 0, line: 276 }, alignment: o.align, keepNext: o.keepNext, indent: o.indent });
const H1 = t => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)], pageBreakBefore: true });
const H2 = t => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
const H3 = t => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(t)] });
const B = (text, level = 0) => new Paragraph({ children: runs(text), numbering: { reference: 'bul', level }, spacing: { after: 60, line: 264 } });
let listInstance = 0;
function N(items) { listInstance++; return items.map(t => new Paragraph({ children: runs(t), numbering: { reference: 'num', level: 0, instance: listInstance }, spacing: { after: 60, line: 264 } })); }
function code(text, o = {}) {
  const lines = text.replace(/\n$/, '').split('\n');
  return lines.map((l, i) => new Paragraph({
    children: [new TextRun({ text: l || ' ', font: MONO, size: 17 })],
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: CODEBG },
    spacing: { before: i === 0 ? 60 : 0, after: i === lines.length - 1 ? 160 : 0, line: 240 },
    keepNext: i < lines.length - 1 || o.keepNext,
    keepLines: true,
  }));
}

// ---------- figures and tables ----------
let figNo = 0, tabNo = 0;
function pngSize(file) { const b = fs.readFileSync(file); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; }
function figure(rel, name, caption, widthIn = 6.5, maxHeightIn = 8.2) {
  figNo++;
  const file = path.join(REPO, rel); const { w, h } = pngSize(file);
  let wi = widthIn, hi = widthIn * h / w;
  if (hi > maxHeightIn) { hi = maxHeightIn; wi = hi * w / h; }
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 120, after: 60 },
      children: [new ImageRun({ type: 'png', data: fs.readFileSync(file), transformation: { width: Math.round(wi * 96), height: Math.round(hi * 96) }, altText: { title: name, description: caption, name } })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 220 },
      children: [new TextRun({ text: `Figure ${figNo}. `, italics: true, size: 18, color: GREY }), new TextRun({ text: name, font: MONO, italics: true, size: 17, color: GREY }), new TextRun({ text: `: ${caption}`, italics: true, size: 18, color: GREY })] }),
  ];
}
const border = { style: BorderStyle.SINGLE, size: 4, color: RULE };
const borders = { top: border, bottom: border, left: border, right: border };
function table(headers, rows, widths, caption) {
  tabNo++;
  const total = widths.reduce((a, b) => a + b, 0);
  const scale = CONTENT_W / total; const ws = widths.map(w => Math.round(w * scale));
  ws[ws.length - 1] += CONTENT_W - ws.reduce((a, b) => a + b, 0);
  const cell = (text, i, head, shade) => new TableCell({
    width: { size: ws[i], type: WidthType.DXA }, borders, verticalAlign: VerticalAlign.TOP,
    shading: head ? { type: ShadingType.CLEAR, color: 'auto', fill: NAVY } : (shade ? { type: ShadingType.CLEAR, color: 'auto', fill: 'F5F7FA' } : undefined),
    margins: { top: 50, bottom: 50, left: 90, right: 90 },
    children: String(text).split('\n').map(line => new Paragraph({ spacing: { after: 0, line: 252 }, children: runs(line, head ? { bold: true, color: 'FFFFFF', size: 19 } : { size: 19, codeSize: 15 }) })),
  });
  const out = [];
  out.push(new Paragraph({ keepNext: true, spacing: { before: 160, after: 80 }, children: [new TextRun({ text: `Table ${tabNo}. `, bold: true, size: 19, color: NAVY }), new TextRun({ text: caption, size: 19, color: NAVY })] }));
  out.push(new Table({
    width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: ws, layout: TableLayoutType.FIXED,
    rows: [new TableRow({ tableHeader: true, cantSplit: true, children: headers.map((h, i) => cell(h, i, true)) }),
      ...rows.map((r, ri) => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, i, false, ri % 2 === 1)) }))],
  }));
  out.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
  return out;
}

// =====================================================================
// CONTENT
// =====================================================================
const body = [];
const add = (...xs) => xs.forEach(x => Array.isArray(x) ? body.push(...x) : body.push(x));

// Highlighted placeholder for a part only the author can write (own experience, live results).
const TODO = text => new Paragraph({ spacing: { after: 120, line: 276 }, children: [new TextRun({ text: `[TO FILL IN: ${text}]`, highlight: 'yellow', italics: true })] });

// Code excerpt taken from the real source file, from the line that starts with `start`
// to the next top-level definition, so the report always matches the code.
function excerpt(rel, start) {
  const lines = fs.readFileSync(path.join(REPO, rel), 'utf8').split('\n');
  const i = lines.findIndex(l => l.startsWith(start));
  if (i < 0) throw new Error(`${start} not found in ${rel}`);
  let j = i + 1;
  while (j < lines.length && !/^(def |class |@|[A-Z_]+ = )/.test(lines[j])) j++;
  let k = i; while (k > 0 && lines[k - 1].startsWith('@')) k--;
  return lines.slice(k, j).join('\n').replace(/\n+$/, '');
}

// ---------- Introduction ----------
add(H1('1. Executive Summary'));
add(P('AegisNEO is a REST API, built with FastAPI and deployed on Vercel, that serves a catalog of 33,511 near-Earth asteroids from NASA data (via Kaggle). It is used by the AegisNEO website and by two partner sites, Impactor and NEO Atlas. In Part I the API read the whole catalog from a JSON file into memory and could only read data. Part II connected it to a cloud database: **Neon**, serverless PostgreSQL 18, chosen in Part I.'));
add(P('The implementation follows the design of Phases 1 to 3, with two additions requested during the activity:'));
add(B('All data now lives in Neon. The API reads, creates, updates and deletes records with SQL, and every change is permanent, including across restarts and redeployments.'));
add(B('Searching, filtering, sorting, paging, random selection and statistics are done by the database, with indexes for each filter.'));
add(B('There are four kinds of caller: **guests** (10 featured asteroids), **users** (the whole catalog, read only), **admins** (the whole catalog, and create, update and delete) and **partner sites** (read only, with a secret key).'));
add(B('**Roles are stored in the database** in a `roles` table, and every account has a role. This was added after the Phase 2 design, at the instructor\'s request.'));
add(B('**Anyone can sign up** for an account. New accounts always get the read-only user role, and the database itself prevents the API from creating an admin.'));
add(B('Validation is done twice, by the API and by database constraints. The API connects with a limited database role that cannot change the structure, create admins or change roles.'));
add(P('The implementation was verified with **122 automated tests, all passing**, run against a real PostgreSQL database, plus a run with the full 33,511 records, browser tests of the website, and checks on the deployed environment (Section 7).'));
add(TODO('one or two sentences on the final state of the deployed system: for example, that the production API on Vercel is connected to Neon, the checklist passed, and the data stayed after a redeploy.'));

add(H1('2. Existing API Assessment'));
add(P('The full assessment is in the Part II Phases 1 to 3 report (Sections 2.1 to 2.4). In short, before Part II:'));
add(table(['Area', 'Before Part II (version 1.1)'], [
  ['Storage', '`data/asteroids.json`, loaded into a Python list and dictionary when the function started'],
  ['Operations', 'Read only: list, search, filter, sort, page, random, one record, statistics'],
  ['Search and statistics', 'Python loops over all 33,511 records; statistics computed once at start-up'],
  ['Changes', 'Not possible; any change in memory would be lost when the function restarted'],
  ['Access', 'One shared API key; the website key was public in the page source'],
  ['Clients', 'AegisNEO website, Impactor, NEO Atlas'],
], [2400, 6960], 'The API before database integration'));
add(P('The main limitations were that data could not be changed or kept, every request scanned the whole list, and the shared key could not tell users apart. These are the problems Part II addresses.'));

add(H1('3. Database Design'));
add(H2('3.1 Tables and Relationships'));
add(P('The database has three tables. Figure 1 shows them and how they are linked.'));
add(figure('docs/part2/diagrams/erd.png', 'erd', 'entity-relationship diagram of the AegisNEO database'));
add(B('**roles**: the kinds of account. It holds two rows, `admin` and `user`, each with a description.'));
add(B('**users**: login accounts. `role` is a foreign key to `roles.name`, it cannot be empty, and its default is `user`.'));
add(B('**asteroids**: the catalog. `created_by` is a foreign key to `users.id`; it is empty for the 33,511 imported records, and it is set to empty if the account is deleted (`ON DELETE SET NULL`).'));
add(table(['Relationship', 'Type', 'Foreign key', 'Meaning'], [
  ['roles to users', 'One to many (1 to 0..n)', '`users.role` references `roles.name`', 'Every account has exactly one role; a role can have any number of accounts'],
  ['users to asteroids', 'One to many (0..1 to 0..n)', '`asteroids.created_by` references `users.id`', 'An admin can create many asteroids; imported asteroids have no creator'],
], [1800, 1900, 2700, 2960], 'Relationships'));

add(H2('3.2 Fields'));
add(table(['Field', 'Type', 'Rules'], [
  ['`name` (PK)', 'text', '3 to 20 lowercase letters; the rows are `admin` and `user`'],
  ['`description`', 'text', 'Required; what the role may do'],
], [2600, 1800, 4960], 'Fields of the roles table'));
add(table(['Field', 'Type', 'Rules'], [
  ['`id` (PK)', 'integer (identity)', 'Generated by the database'],
  ['`username` (unique)', 'text', '3 to 30 characters: lowercase letters, digits and underscore'],
  ['`password_hash`', 'text', '60-character bcrypt hash; the password is never stored'],
  ['`role` (FK)', 'text', 'Must exist in `roles`; not null; default `user`'],
  ['`created_at`', 'timestamptz', 'Default `now()`'],
], [2600, 1800, 4960], 'Fields of the users table'));
add(table(['Field', 'Type', 'Rules'], [
  ['`neo_reference_id` (PK)', 'text', '1 to 10 digits; cannot change after creation'],
  ['`name` (unique, ignoring case)', 'text', '1 to 100 characters after trimming'],
  ['`estimated_diameter_km`', 'double precision', 'Greater than 0, at most 1,000'],
  ['`is_potentially_hazardous`', 'boolean', 'Default false'],
  ['`close_approach_date`', 'date', '1900-01-01 to 2200-12-31'],
  ['`relative_velocity_km_h`', 'double precision', '0 to 1,000,000'],
  ['`miss_distance_km`', 'double precision', '0 to 1,000,000,000'],
  ['`absolute_magnitude`', 'double precision', '0 to 40'],
  ['`is_featured`', 'boolean', 'Shown to guests; at most 10 (checked by the API)'],
  ['`created_by` (FK)', 'integer', 'References `users.id`; empty for imported records'],
  ['`created_at`, `updated_at`', 'timestamptz', 'Set by the database and the API, never by clients'],
], [2600, 1800, 4960], 'Fields of the asteroids table'));

add(H2('3.3 Indexes, Privileges and Constraints'));
add(table(['Index', 'Used by'], [
  ['`asteroids_pkey`', 'Get, update and delete one asteroid'],
  ['`asteroids_name_lower_key` (unique)', 'Prevents the same name with different letter case'],
  ['`asteroids_name_trgm_idx` (GIN, `pg_trgm`)', 'Text search with `ILIKE \'%text%\'`'],
  ['`asteroids_diameter_idx`, `asteroids_date_idx`', 'Diameter and date filters and sorting'],
  ['`asteroids_featured_idx` (partial)', 'All guest requests (the 10 featured rows)'],
  ['`asteroids_created_by_idx`', 'The foreign key to `users`'],
  ['`users_username_key`, `roles_pkey`', 'Login, and the foreign key from `users.role`'],
], [4200, 5160], 'Indexes'));
add(table(['Database role', 'Used by', 'Privileges'], [
  ['`neondb_owner`', 'Setup scripts on the developer\'s computer only', 'Owner: creates tables, imports data, creates admins and changes roles. Never stored on Vercel.'],
  ['`aegis_app`', 'The API on Vercel', '`asteroids`: SELECT, INSERT, UPDATE, DELETE. `roles`, `users`: SELECT. `users`: INSERT on `username` and `password_hash` only (sign-up). Cannot change the structure, set a role, change a password or delete an account.'],
], [1700, 2400, 5260], 'Database roles and privileges'));
add(P('The same validation rules are written as CHECK, NOT NULL, UNIQUE, PRIMARY KEY and FOREIGN KEY constraints, so the database rejects invalid data even if a request bypasses the API. The rule of at most 10 featured asteroids needs to count rows, which a CHECK constraint cannot do, so the API checks it inside the transaction while holding a lock.'));

add(H2('3.4 Changes from the Phase 2 Design'));
add(P('The Phase 2 design had two tables and stated that a roles table and a public sign-up page were not needed, because every logged-in user could change the catalog. During the activity the instructor asked for roles to be visible in the database, so the design was extended:'));
add(B('A `roles` table and a `users.role` foreign key were added. Changing data now requires the admin role.'));
add(B('Because ordinary accounts are now read only, a public sign-up became safe and was added. The database grant allows the API to insert only a username and a password hash, so every new account gets the default role `user`.'));
add(B('The existing Neon database was updated with `db/migrations/001_add_roles.sql`, run once as the owner in the Neon SQL Editor. It turned the existing accounts into admins and can be run again without changing anything.'));
add(P('The complete schema is in Appendix A.'));

add(H1('4. Architecture and Integration'));
add(P('Clients talk only to the API over HTTPS. The API runs on Vercel as a Python function in the Singapore region (`sin1`), next to the Neon project in AWS Singapore, and it is the only component that connects to the database.'));
add(P('Every request follows the same path: the route receives it, `auth.py` identifies the caller, Pydantic validates the input, `db.py` runs parameterised SQL in one transaction, and the route returns JSON with a status code.'));
add(figure('docs/part2/diagrams/architecture.png', 'architecture', 'system architecture', 4.8));
add(table(['File', 'Responsibility'], [
  ['`api/index.py`', 'Routes (endpoints), status codes and error handlers'],
  ['`api/auth.py`', 'Identifying the caller (guest, user, admin, partner), passwords, tokens, partner keys and the role check'],
  ['`api/db.py`', 'The database connection and every SQL query'],
  ['`api/models.py`', 'Validation of request bodies (asteroids and sign-up)'],
  ['`api/config.py`', 'Settings from environment variables (and a local `.env` file for development)'],
  ['`db/schema.sql`, `db/migrations/`', 'Tables, constraints, indexes, grants, and the roles migration'],
  ['`scripts/`', 'Run on the developer\'s computer: `import_asteroids.py`, `create_user.py`, `set_role.py`, `check_connection.py`, `verify_deployment.py`'],
  ['`frontend/`', 'The website: login, sign-up, guest view and catalog'],
], [2900, 6460], 'Modules of the implementation'));

add(H1('5. Implementation Details'));
add(H2('5.1 Database Configuration'));
add(B('Neon project **AegisNEO**, branch `production`, database `neondb`, PostgreSQL 18, region AWS Singapore (ap-southeast-1), Free plan.'));
add(B('`db/schema.sql` was run as `neondb_owner` in the Neon SQL Editor. It creates the `pg_trgm` extension, the three tables, the constraints, the indexes and the grants for `aegis_app`.'));
add(B('`scripts/import_asteroids.py` validated and imported the 33,511 records and marked 10 well-known asteroids as featured (Apophis, Bennu, Eros, Ganymed, Icarus, Toutatis, Didymos, Phaethon, Itokawa and Ryugu). Running it again changes nothing.'));
add(B('Accounts are created with `scripts/create_user.py <name> [admin]`, or by sign-up; roles are changed with `scripts/set_role.py`.'));
add(B('The API connects as `aegis_app` through the **pooled** connection string with TLS required (`sslmode=require`, `channel_binding=require`).'));
add(B('`scripts/check_connection.py` proves the connection: it prints the role, the TLS state, the row counts, the roles with their number of accounts, and shows that five forbidden operations are refused.'));

add(H2('5.2 Dependencies'));
add(table(['Package', 'Version', 'Purpose'], [
  ['fastapi', '0.141.1', 'Web framework, routes, validation, Swagger UI'],
  ['uvicorn', '0.47.0', 'Local development server'],
  ['pydantic', '2.13.4', 'Request validation'],
  ['psycopg[binary]', '3.3.8', 'PostgreSQL driver'],
  ['PyJWT', '2.15.1', 'Signing and checking login tokens'],
  ['bcrypt', '5.0.0', 'Hashing and checking passwords'],
  ['python-multipart', '0.0.33', 'Reading the login form'],
  ['pytest, httpx', '9.2.0, 0.28.1', 'Automated tests only (`requirements-dev.txt`)'],
], [2400, 1600, 5360], 'Dependencies (requirements.txt)'));

add(H2('5.3 What Replaced What'));
add(table(['Before', 'After (SQL in api/db.py)'], [
  ['JSON file loaded at start-up', 'Rows read from Neon on every request'],
  ['Python loops for filters', '`WHERE` conditions with query parameters'],
  ['Sorting and paging in Python', '`ORDER BY ... LIMIT ... OFFSET`, and `count(*) over ()` for the number of matches in the same query'],
  ['`random.sample`', '`ORDER BY random() LIMIT n`'],
  ['`statistics.median` at start-up', '`percentile_cont(0.5)` and other aggregates on every request, so statistics follow changes'],
  ['Substring search in Python', '`ILIKE` with the trigram index'],
  ['No changes possible', '`INSERT`, `UPDATE` (only the submitted columns) and `DELETE`, each `... RETURNING` the result'],
], [3400, 5960], 'From in-memory code to SQL'));
add(P('Each request opens one connection and one transaction: it commits if everything succeeds and rolls back on any error, so a failed request changes nothing. `prepare_threshold=None` is set because the Neon pooler can send consecutive statements to different server sessions, and `connect_timeout=10` makes an outage answer quickly with 503. The connection function also turns database errors into clear API errors:', { keepNext: true }));
add(code(excerpt('api/db.py', 'def connection():')));
add(P('Filters are built from fixed SQL fragments with placeholders. Values are always passed separately, never pasted into the SQL text, which prevents SQL injection:', { keepNext: true }));
add(code(excerpt('api/db.py', 'def build_filters(')));
add(P('An update changes only the columns that were sent. The column names come from a fixed list in the code, never from the request:', { keepNext: true }));
add(code(excerpt('api/db.py', 'def update_asteroid(')));

add(H2('5.4 Endpoints and Database Operations'));
add(table(['Method and path', 'Access', 'Database operation'], [
  ['GET `/`, GET `/health`', 'Public', '`count(*)`; `select 1` to check the database (503 if it fails)'],
  ['POST `/api/v1/auth/signup`', 'Public', '`INSERT` into `users` (username and hash only) `RETURNING` id, username, role'],
  ['POST `/api/v1/auth/login`', 'Public', '`SELECT` the account by username'],
  ['GET `/api/v1/auth/me`', 'User, admin', '`SELECT` the account by id'],
  ['GET `/api/v1/asteroids`', 'Guest (featured), user, admin, partner', '`SELECT` with filters, sort, `LIMIT`/`OFFSET`'],
  ['GET `/api/v1/asteroids/random`', 'Guest (featured), user, admin, partner', '`SELECT ... ORDER BY random()`'],
  ['GET `/api/v1/asteroids/{id}`', 'Guest (featured), user, admin, partner', '`SELECT` by primary key'],
  ['GET `/api/v1/stats`', 'User, admin, partner', 'Aggregates: count, min, max, median'],
  ['POST `/api/v1/asteroids`', 'Admin', '`INSERT ... RETURNING`'],
  ['PATCH `/api/v1/asteroids/{id}`', 'Admin', '`UPDATE` of the submitted columns `... RETURNING`'],
  ['DELETE `/api/v1/asteroids/{id}`', 'Admin', '`DELETE ... RETURNING`'],
], [3000, 2600, 3760], 'Endpoints'));

add(H2('5.5 Validation and Error Handling'));
add(P('Request bodies are checked by Pydantic models before any SQL runs. Numbers and booleans must be real JSON numbers and booleans (`"0.5"`, `1` and `"yes"` are rejected), NaN and Infinity are rejected, unknown fields and server-managed fields such as `created_by` are rejected, and names are trimmed. The database constraints repeat the same limits. Errors never repeat the submitted value (it could be a password) and never show SQL, host names or passwords; details go only to the server log.'));
add(table(['Problem', 'Status'], [
  ['Malformed JSON', '400'],
  ['No login, invalid or expired token, wrong partner key', '401'],
  ['Logged in but not allowed (user or partner changing data)', '403'],
  ['Record not found', '404'],
  ['Duplicate ID, name or username; more than 10 featured', '409'],
  ['Missing field, wrong type or value out of range', '422'],
  ['Unexpected error (generic message)', '500'],
  ['Database unreachable, or login not configured', '503'],
], [6800, 2560], 'Error responses'));

add(H2('5.6 Authentication, Roles and Credentials'));
add(B('**Passwords** are hashed with bcrypt (cost 12). A failed login gives the same message whether the username or the password is wrong, and an unknown username still runs a bcrypt check, so neither the message nor the timing reveals which accounts exist.'));
add(B('**Tokens** are JSON Web Tokens (HS256) signed with `JWT_SECRET`, valid for 60 minutes, and contain the user id, username and role. An invalid or expired token is a 401; it is never treated as a guest.'));
add(B('**Partner keys** are compared in constant time. They can read everything and change nothing (403).'));
add(B('**Roles.** Before every create, update and delete, the API reads the account\'s role from the database rather than trusting the token, so a role change or a deleted account takes effect at once:', 0));
add(code(excerpt('api/auth.py', 'def require_admin(')));
add(B('**Sign-up** cannot produce an admin, for three reasons: the request model has no role field and rejects extra fields (`"role": "admin"` is 422); the SQL does not mention the role, so the default `user` applies; and `aegis_app` may insert only the `username` and `password_hash` columns, so the database refuses any insert that sets a role.'));
add(code(`grant insert (username, password_hash) on public.users to aegis_app;`));
add(B('**Credentials** are never in the code. `DATABASE_URL`, `JWT_SECRET` and `AEGISNEO_API_KEYS` are Vercel environment variables (Production and Preview, marked sensitive); the local `.env` file is ignored by git. The old public website key and demo key were removed from the code and from Vercel, because they remain visible in the git history.'));

add(H1('6. API Documentation and Usage Guide'));
add(P('Base URL: `https://aegisneo-api.vercel.app`. Interactive documentation with an **Authorize** button: `/docs`. The website is at `/frontend/`. All responses are JSON; dates are `YYYY-MM-DD`.'));
add(table(['Caller', 'Credentials', 'Allowed'], [
  ['Guest', 'None', 'The 10 featured asteroids'],
  ['User (role `user`)', '`Authorization: Bearer <token>`', 'Everything to read, and statistics; changes return 403'],
  ['Admin (role `admin`)', '`Authorization: Bearer <token>`', 'Everything, including create, update and delete'],
  ['Partner site', '`x-api-key: <key>`', 'Everything to read, and statistics; changes return 403'],
], [2400, 3000, 3960], 'Callers'));
add(H3('Sign up'));
add(code(`curl -X POST https://aegisneo-api.vercel.app/api/v1/auth/signup \\
     -H "Content-Type: application/json" \\
     -d '{"username": "carol", "password": "YOUR_PASSWORD"}'

201 {"id": 3, "username": "carol", "role": "user", "access_token": "<token>",
     "token_type": "bearer", "expires_in": 3600}`));
add(H3('Log in'));
add(code(`curl -X POST https://aegisneo-api.vercel.app/api/v1/auth/login \\
     -d "username=demo&password=YOUR_PASSWORD"

200 {"access_token": "<token>", "token_type": "bearer", "role": "admin", "expires_in": 3600}`));
add(H3('Search and filter'));
add(code(`GET /api/v1/asteroids?hazardous=true&min_diameter=1&sort=diameter&order=desc&limit=3
Authorization: Bearer <token>

200 {"count": 3, "matched": 219, "total": 33511, "access": "full", "asteroids": [...]}`));
add(P('Query parameters: `search` (name; also ID for digits and close approach date for date-like text), `hazardous`, `min_diameter`, `max_diameter`, `from_date`, `to_date`, `sort` (`name`, `diameter`, `velocity`, `miss_distance`, `date`, `magnitude`), `order`, `limit` (1 to 100) and `offset`.'));
add(H3('Create, update and delete (admin)'));
add(code(`POST /api/v1/asteroids                      -> 201, the stored record
{"neo_reference_id": "9000001", "name": "Demo Rock (2026 XY)", "estimated_diameter_km": 0.25,
 "is_potentially_hazardous": true, "close_approach_date": "2026-05-17",
 "relative_velocity_km_h": 54000.5, "miss_distance_km": 4200000, "absolute_magnitude": 21.3}

PATCH /api/v1/asteroids/9000001  {"estimated_diameter_km": 0.31}   -> 200
DELETE /api/v1/asteroids/9000001                                   -> 200, then GET -> 404
POST with a user-role token                                        -> 403
"Only an admin can change data. Your account has the user role."`));
add(P('The complete guide, with every response, is in `docs/part2/phases-4-8/02-api-guide.md`.'));

add(H1('7. Testing Methodology and Results'));
add(H2('7.1 Method'));
add(B('**Automated tests** with pytest and FastAPI\'s TestClient, against a real PostgreSQL database created fresh from `db/schema.sql`. The API connects as the limited role `aegis_app`, as in production, and a second owner connection reads the tables directly, so the tests check what is actually stored, not only what the API answers.'));
add(B('The test setup refuses to run unless the database is on the local machine, so the tests can never touch Neon.'));
add(B('Test data: 14 real catalog records (the 10 featured plus 4 others) and two accounts, `alice` (admin) and `bob` (user), reset before every test.'));
add(B('The tests were checked for being able to fail: with the guest restriction, the partner read-only rule or token expiry deliberately broken, tests failed; with the code restored they passed.'));
add(B('A run with all 33,511 records on a local database, the website in a real browser (Playwright), and `scripts/verify_deployment.py` on the deployed API.'));
add(H2('7.2 Results'));
add(table(['Group', 'Tests', 'What they cover', 'Result'], [
  ['Read', '19', 'List, one, search by name, ID and date, filters, sorting, paging, random, statistics, guest limits', '19 passed'],
  ['Write', '11', 'Create, update only the sent fields, delete, featured limit, new data visible in search and statistics', '11 passed'],
  ['Validation', '35', 'Missing fields, wrong types, ranges, NaN, unknown fields, malformed JSON, duplicates, query parameters', '35 passed'],
  ['Security', '25', 'No login, partner key, wrong password, invalid tokens, SQL injection, no password in responses, database role limits', '25 passed'],
  ['Roles', '8', 'Roles in the database, default role, unknown role refused, user read only, admin can write, role change applies at once', '8 passed'],
  ['Sign-up', '15', 'New account is user, cannot ask for admin, database refuses an admin insert, taken username, invalid input', '15 passed'],
  ['Reliability', '9', 'Database down, missing settings, unexpected errors, constraints without the API, failed write changes nothing', '9 passed'],
  ['**Total**', '**122**', '', '**122 passed**'],
], [1500, 900, 5160, 1800], 'Automated test results'));
add(P('Examples of individual cases (the full matrix with expected and actual results is in `docs/part2/phases-4-8/04-test-report.md`):'));
add(table(['ID', 'Case', 'Expected', 'Result'], [
  ['F-01', 'Admin creates an asteroid', '201; the row is in the table with `created_by` set', 'Pass'],
  ['F-04', 'Update one field', 'Only that field and `updated_at` change', 'Pass'],
  ['F-05', 'Delete', '200; then 404; the row is gone', 'Pass'],
  ['V-02', 'Wrong types and values (20 cases)', '422; nothing stored', 'Pass'],
  ['S-01', 'Create, update, delete without login', '401; table unchanged', 'Pass'],
  ['S-08', 'SQL injection in search, ID and username', 'Normal answers; data unchanged', 'Pass'],
  ['RO-06', 'User role tries to create, update, delete', '403; table unchanged', 'Pass'],
  ['RO-08', 'Roles swapped in the database while logged in', 'Takes effect without logging in again', 'Pass'],
  ['SU-03', 'Sign-up with `"role": "admin"`', '422; no account stored', 'Pass'],
  ['SU-04', 'API role inserts an account with a role', 'Refused by the database', 'Pass'],
  ['R-01', 'Database unreachable', '503; no password or host in the response', 'Pass'],
], [900, 3300, 3960, 1200], 'Selected test cases'));
add(H2('7.3 Full Data and Website'));
add(B('With all 33,511 records: statistics (2,493 hazardous; diameter 0.0008 to 60.7495 km) and filter results (219 matches, Florence first) were identical to the Part I API. Query plans used the primary-key, trigram, diameter, date and featured indexes. Median request times on the local machine: 9 ms for a search, 6 ms for one asteroid, 31 to 36 ms for the full list and statistics.'));
add(B('Website: login, sign-up, guest view (exactly 10 cards), logout, session expiry and the phone layout were checked in a real browser with no console errors. The account bar shows the role, for example "Signed in as carol (user)".'));
add(H2('7.4 Deployed Environment'));
add(TODO('fill in the Actual column from your own run of the steps in 01-steps.md, and refer to your screenshots in Appendix C.'));
add(table(['ID', 'Check on Neon and Vercel', 'Expected', 'Actual'], [
  ['D-01', '`/health` on the deployed API', '200, database ok', ''],
  ['D-02', '`check_connection.py` as `aegis_app`', 'TLS; 33,511 rows; roles listed; 5 of 5 refused', ''],
  ['D-03', 'Records for a user and a guest', '33,511 and 10', ''],
  ['D-04 to D-06', 'Create, update, delete, each seen in the Neon console', '201, 200, 200', ''],
  ['D-07', '`verify_deployment.py`', '12 of 12 passed', ''],
  ['D-08', 'Redeploy, then `--after-redeploy`', '5 of 5; data still there', ''],
  ['D-09, D-10', 'No token; partner key; user role; invalid input', '401; 403; 403; 422 / 400 / 409', ''],
  ['D-11', 'Website login, sign-up, guest, logout', 'As in Section 7.3', ''],
  ['D-12', 'Impactor and NEO Atlas', 'Still load data', ''],
], [1200, 3500, 2900, 1760], 'Deployed environment checks'));

add(H1('8. Deployment and Environment'));
add(table(['Item', 'Configuration'], [
  ['Hosting', 'Vercel project `aegisneo-api`, Python function from `api/index.py`, region `sin1` (Singapore); the website is served as static files from `frontend/`'],
  ['Routing (`vercel.json`)', '`/frontend/...` goes to the website; every other path goes to the API'],
  ['Database', 'Neon project AegisNEO, branch `production`, database `neondb`, PostgreSQL 18, AWS ap-southeast-1'],
  ['Environment variables', '`DATABASE_URL` (pooled `aegis_app` string), `JWT_SECRET` (random 64 hex characters), `AEGISNEO_API_KEYS` (partner keys), for Production and Preview, marked sensitive'],
  ['Not on Vercel', '`DATABASE_OWNER_URL`, used only by the setup scripts on the developer\'s computer'],
  ['Deployment', 'Pushing to `master` deploys production; other branches get preview deployments'],
], [2400, 6960], 'Deployment configuration'));
add(P('Deployment steps: create the structure in Neon, import the data, create accounts, set the environment variables on Vercel, test a preview deployment, merge to `master`, run `scripts/verify_deployment.py` against production, redeploy and run it again with `--after-redeploy` to prove the data persists. The roles migration was run in the Neon SQL Editor before the roles change was merged, because the new code reads the `role` column.'));
add(P('Neon\'s Free plan suspends the compute after 5 minutes without activity, so the first request after a pause is slower (about 1 second in Part I).'));
add(TODO('describe your actual deployment: dates, anything you had to change on Vercel or Neon, and the cold-start time you measured (step 21 in 01-steps.md).'));

add(H1('9. Challenges and Solutions'));
add(H2('9.1 Problems Found During Testing'));
add(table(['Problem', 'Cause', 'How it was found', 'Solution'], [
  ['NaN in a request returned 500 instead of 422', 'The validation error repeated the rejected value, and NaN cannot be written as JSON', 'The test `test_nan_and_infinity_are_rejected` failed', 'Error responses no longer repeat submitted values; this also stops passwords from being echoed'],
  ['Search was more than 100 times slower than needed (26 ms against 0.2 ms)', 'Searching name OR ID in one condition stopped PostgreSQL from using the trigram index', '`EXPLAIN ANALYZE` showed a full table scan', 'The ID is searched only when the text is all digits; the median request is now 9 ms'],
  ['NEO Atlas showed no asteroids after the move to the database', 'It searched by date (`1968-`), which the first database version did not match', 'Opening the partner site after deployment', 'Date-like search text is also matched against the close approach date (285 matches for `1968-`)'],
], [2100, 2500, 2100, 2660], 'Problems and solutions'));
add(H2('9.2 Design Change: Roles and Sign-up'));
add(P('The Phase 2 design gave every logged-in account full write access and therefore had no sign-up page. When roles were requested, the challenge was to add them without breaking existing accounts or the live system. The solution was a migration that adds the table and column and makes the existing accounts admins, run in Neon before the new code was deployed, and a role check that reads the database on every change. Separating read-only users from admins then made a public sign-up safe, which was protected at three levels (model, SQL and database grant).'));
add(H2('9.3 Neon and Vercel'));
add(TODO('describe any real problems you met on Neon or Vercel (for example connection strings, permissions, environment variables, previews, cold starts) and how you solved them. If there were none, describe how you verified each step instead.'));

add(H1('10. Technical Evaluation and Limitations'));
add(H2('10.1 How Well Neon Supports the API'));
add(B('The data is relational with fixed fields, which suits PostgreSQL tables and constraints.'));
add(B('Constraints, foreign keys and column-level grants let the database enforce validation and roles itself, not only the API.'));
add(B('Indexes, including trigram search, keep queries fast on 33,511 rows; aggregates replace Python code for the statistics.'));
add(B('The pooled connection works well with short-lived serverless functions on Vercel.'));
add(B('Limits of the Free plan: 1 GB storage, 100 compute hours per month, and suspension after 5 minutes idle, which causes slower first requests.'));
add(H2('10.2 Limitations of the Implementation'));
add(B('A token cannot be cancelled before it expires (60 minutes); logging out only removes it from the browser.'));
add(B('The API does not limit login or sign-up attempts. A Vercel Firewall rate-limit rule on `/api/v1/auth/login` and `/api/v1/auth/signup` is the planned control.'));
add(B('The limit of 10 featured asteroids is checked by the API, not by a database constraint.'));
add(B('Paging uses `OFFSET`, which gets slower for very large offsets.'));
add(B('A guest can tell whether an ID exists (401 against 404); the data is public, so this is accepted.'));
add(B('There is no page for an admin to manage roles; roles are changed with a script or SQL.'));
add(H2('10.3 With More Users or Records'));
add(P('A larger system would need rate limiting, refresh tokens or token revocation, keyset paging, caching of the statistics or read replicas, a migration tool instead of single SQL files, and backups beyond Neon\'s restore window.'));
add(TODO('your own opinion: how well the database met the needs of the API, and whether you would choose Neon again.'));

add(H1('11. Conclusion and Reflection'));
add(P('The AegisNEO API was moved from a JSON file to a Neon PostgreSQL database. It now supports full create, read, update and delete operations with permanent storage, searches and statistics in SQL, and access control with guests, partner sites and two roles stored in the database, admin and user, plus a public sign-up that can only create read-only accounts. The database enforces the data rules and the roles itself, and the API connects with the least privileges it needs. 122 automated tests pass.'));
add(TODO('answer the reflection questions from the assignment in your own words: what you learned, what was hardest, what you would do differently, and how this applies to future projects.'));

// ---------- References ----------
add(H1('12. References'));
const refs = [
  ['N1', 'Neon Docs: Connection pooling. https://neon.com/docs/connect/connection-pooling'],
  ['N2', 'Neon Docs: Neon plans. https://neon.com/docs/introduction/plans'],
  ['N3', 'Neon Docs: Manage database access. https://neon.com/docs/manage/database-access'],
  ['P1', 'PostgreSQL 18 Documentation: Constraints. https://www.postgresql.org/docs/18/ddl-constraints.html'],
  ['P2', 'PostgreSQL 18 Documentation: GRANT (column privileges). https://www.postgresql.org/docs/18/sql-grant.html'],
  ['P3', 'PostgreSQL 18 Documentation: pg_trgm. https://www.postgresql.org/docs/18/pgtrgm.html'],
  ['P4', 'PostgreSQL 18 Documentation: Advisory locks. https://www.postgresql.org/docs/18/explicit-locking.html'],
  ['P5', 'PostgreSQL 18 Documentation: Aggregate functions (percentile_cont). https://www.postgresql.org/docs/18/functions-aggregate.html'],
  ['P6', 'PostgreSQL 18 Documentation: Error codes. https://www.postgresql.org/docs/18/errcodes-appendix.html'],
  ['Y1', 'Psycopg 3 Documentation: Passing parameters to SQL queries. https://www.psycopg.org/psycopg3/docs/basic/params.html'],
  ['Y2', 'Psycopg 3 Documentation: Transactions management. https://www.psycopg.org/psycopg3/docs/basic/transactions.html'],
  ['A1', 'FastAPI Documentation: OAuth2 with password (and hashing), Bearer with JWT tokens. https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/'],
  ['A2', 'FastAPI Documentation: Handling errors. https://fastapi.tiangolo.com/tutorial/handling-errors/'],
  ['J1', 'PyJWT Documentation. https://pyjwt.readthedocs.io/'],
  ['V1', 'Vercel Docs: Environment variables. https://vercel.com/docs/environment-variables'],
  ['V2', 'Vercel Docs: Configuring regions for Vercel Functions. https://vercel.com/docs/functions/configuring-functions/region'],
  ['V3', 'Vercel Docs: WAF rate limiting. https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting'],
  ['O1', 'OWASP Cheat Sheet Series: Password Storage. https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html'],
  ['O2', 'OWASP Cheat Sheet Series: Authentication. https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html'],
  ['K1', 'Kaggle: Nearest Earth Objects (1910-2024). https://www.kaggle.com/datasets/ivansher/nasa-nearest-earth-objects-1910-2024'],
  ['R1', 'Latagan, J. J. F. Cloud Database Investigation, Part I: Comparative Cloud Database Investigation. October 2026.'],
  ['R2', 'Latagan, J. J. F. Cloud Database Integration and API Implementation, Part II: Phases 1 to 3. November 2026.'],
];
for (const [id, text] of refs) add(new Paragraph({ spacing: { after: 80, line: 264 }, indent: { left: 540, hanging: 540 }, children: [new TextRun({ text: `[${id}]`, bold: true }), new TextRun({ text: '\t' + text })], tabStops: [{ type: TabStopType.LEFT, position: 540 }] }));

add(H1('13. Appendices'));
add(H2('Appendix A. Database Schema'));
add(P('`db/schema.sql`, run once as `neondb_owner`:', { keepNext: true }));
add(code(fs.readFileSync(path.join(REPO, 'db/schema.sql'), 'utf8')));
add(H2('Appendix B. Roles Migration'));
add(P('`db/migrations/001_add_roles.sql`, run once in the Neon SQL Editor on the existing database:', { keepNext: true }));
add(code(fs.readFileSync(path.join(REPO, 'db/migrations/001_add_roles.sql'), 'utf8')));
add(H2('Appendix C. Screenshots'));
add(P('Screenshots of the deployed system, taken while following `docs/part2/phases-4-8/01-steps.md`:'));
for (const s of ['Neon Tables page showing roles, users and asteroids', 'The roles table and the role column of users', 'Data import and account creation in the terminal', '`check_connection.py` output', '`EXPLAIN` query plans', 'Swagger: create, update, search and delete, each with the Neon table', 'Error cases: 401, 403 (user role), 400, 422, 409', 'Vercel environment variables (names only) and deployment', '`verify_deployment.py` before and after a redeploy', 'Website: login, sign-up, guest view, signed in as admin and as user'])
  add(B(s));
add(TODO('insert your screenshots here, one per item above, each with a short caption.'));
add(H2('Appendix D. Automated Test Run'));
add(P('The full output of the 122 tests is in `docs/part2/phases-4-8/evidence/pytest-local-run.txt`. Command:'));
add(code('TEST_DATABASE_URL=postgresql://postgres@localhost:54329/postgres python -m pytest -v'));
// =====================================================================
// Cover and contents
// =====================================================================
const cover = [
  new Paragraph({ spacing: { before: 3600, after: 120 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Cloud Database Integration and API Implementation', bold: true, size: 48, color: NAVY })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: 'Part II: Implementation and Technical Evaluation Report', size: 30 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [new TextRun({ text: 'Database Integration, Roles, Testing and Deployment of the AegisNEO API on Neon', italics: true, size: 22 })] }),
  ...['Name: Latagan, Jenny Joy F.', 'Course / Section: BSCS-SE CS301', 'Instructor: Sean Gono', 'Date: November 17, 2026'].map(t => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: t, size: 22 })] })),
];
const contents = [new Paragraph({ pageBreakBefore: true, spacing: { after: 240 }, children: [new TextRun({ text: 'Table of Contents', bold: true, size: 32, color: NAVY })] })];
for (const p of body) {
  const h = p && p.__h; // set below
}
// Collect headings from the content definition order
const headingList = [];
(function collect() {
  // Re-scan the add() calls by reading the source text of this file for H1/H2 calls.
  const src = fs.readFileSync(__filename, 'utf8').split('// ---------- Introduction ----------')[1].split('// ---------- References ----------')[0];
  for (const m of src.matchAll(/add\(H([12])\('([^']+)'\)\)/g)) headingList.push({ level: +m[1], text: m[2] });
  headingList.push({ level: 1, text: '12. References' }, { level: 1, text: '13. Appendices' });
})();
for (const h of headingList) {
  const page = TOC[h.text];
  contents.push(new Paragraph({
    spacing: { after: h.level === 1 ? 60 : 30, before: h.level === 1 ? 100 : 0 }, indent: { left: h.level === 1 ? 0 : 360 },
    tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W, leader: 'dot' }],
    children: [new TextRun({ text: h.text, bold: h.level === 1, size: 21 }), new TextRun({ text: `\t${page ?? ''}`, size: 21 })],
  }));
}

const doc = new Document({
  creator: 'Latagan, Jenny Joy F.', lastModifiedBy: 'Latagan, Jenny Joy F.', title: 'Cloud Database Integration and API Implementation, Part II: Implementation and Technical Evaluation Report',
  styles: {
    default: { document: { run: { font: FONT, size: 22 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 32, bold: true, color: NAVY }, paragraph: { spacing: { before: 0, after: 200 }, keepNext: true, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 26, bold: true, color: BLUE }, paragraph: { spacing: { before: 300, after: 120 }, keepNext: true, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 22, bold: true, color: NAVY }, paragraph: { spacing: { before: 200, after: 80 }, keepNext: true, outlineLevel: 2 } },
    ],
  },
  numbering: { config: [
    { reference: 'bul', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }, { level: 1, format: LevelFormat.BULLET, text: '–', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1000, hanging: 270 } } } }] },
    { reference: 'num', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 300 } } } }] },
  ] },
  sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } }, children: [...cover, ...contents, ...body] }],
});
Packer.toBuffer(doc).then(buf => { fs.writeFileSync(OUT, buf); console.log('wrote', OUT, 'figures', figNo, 'tables', tabNo); });
