#!/usr/bin/env node
/**
 * The real stack for full-stack browser tests: migrated Postgres with the backend's deterministic demo data,
 * API and worker from a backend checkout, a local SMTP sink, and this build under `vite preview`.
 *
 *   node e2e/full/stack.mjs up [--reset]    start everything and stay in the foreground
 *
 * Environment (defaults are for a local run):
 *   E2E_BACKEND_DIR    backend checkout with node_modules   ../hrms-backend
 *   E2E_DB_OWNER_URL   schema owner URL (database must be empty or disposable)
 *   E2E_DB_APP_URL     runtime role URL
 *   E2E_PROFILE        full | off | single                  full
 *
 * Nothing here is written in the backend checkout. Credentials are generated per reset and kept in .e2e/.
 */
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer as createHttp } from 'node:http';
import { createServer as createTcp } from 'node:net';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const stateDir = join(root, '.e2e');
const backend = resolve(process.env.E2E_BACKEND_DIR ?? join(root, '../hrms-backend'));
const owner = process.env.E2E_DB_OWNER_URL ?? 'postgres://hrms_owner:hrms_owner_dev@127.0.0.1:55432/hrms_e2e';
const app = process.env.E2E_DB_APP_URL ?? 'postgres://hrms_app:hrms_app_dev@127.0.0.1:55432/hrms_e2e';
const profile = process.env.E2E_PROFILE ?? 'full';
const ports = { api: Number(process.env.E2E_API_PORT ?? 4310), web: Number(process.env.E2E_WEB_PORT ?? 4311), smtp: Number(process.env.E2E_SMTP_PORT ?? 4312), mail: Number(process.env.E2E_MAIL_PORT ?? 4313) };

const ALL_FLAGS = ['DOCUMENTS', 'ONBOARDING', 'OFFBOARDING', 'POLICIES', 'ATTENDANCE', 'ATTENDANCE_WEB', 'ATTENDANCE_MOBILE', 'ATTENDANCE_GEOFENCE', 'ATTENDANCE_SELFIE', 'ATTENDANCE_BIOMETRIC', 'ATTENDANCE_REGULARIZATION', 'SHIFTS', 'HOLIDAYS', 'LEAVE', 'OVERTIME', 'COMP_OFF', 'FIELD_DUTY', 'PAYROLL', 'PAYSLIPS', 'PAYROLL_STATUTORY', 'LOANS', 'SALARY_ADVANCE', 'ACCOUNTING_EXPORTS', 'EXPENSE_CLAIMS', 'TRAVEL', 'RECRUITMENT', 'PERFORMANCE_REVIEW', 'TRAINING', 'LAB_COMPETENCY', 'ASSET_MANAGEMENT', 'GRIEVANCE', 'POSH', 'REPORTS_ADVANCED', 'EMAIL_NOTIFICATIONS', 'PUSH_NOTIFICATIONS'];
const flags = (on) => Object.fromEntries(ALL_FLAGS.map((f) => [`FEATURE_${f}`, String(on.includes(f))]));
// Everything on, except those that would stop a plain clock-in, which get their own tests against the "selfie" and "geofence" code paths.
const FULL = flags(ALL_FLAGS.filter((f) => !['ATTENDANCE_SELFIE', 'ATTENDANCE_GEOFENCE'].includes(f)));
// Off means absent: only the always-useful core stays, so the "off" specs can check menus, URLs and chunks.
const OFF = flags(['ATTENDANCE', 'ATTENDANCE_WEB', 'LEAVE', 'SHIFTS', 'HOLIDAYS', 'EMAIL_NOTIFICATIONS']);

const PROFILES = {
  full: { ...FULL, ORG_MANAGEMENT_MODE: 'multi', MFA_AVAILABLE: 'true', MFA_ENFORCED: 'false', MFA_METHODS: 'totp,email' },
  off: { ...OFF, ORG_MANAGEMENT_MODE: 'multi', MFA_AVAILABLE: 'false', MFA_ENFORCED: 'false', MFA_METHODS: '' },
  single: { ...FULL, ORG_MANAGEMENT_MODE: 'single', MFA_AVAILABLE: 'true', MFA_ENFORCED: 'false', MFA_METHODS: 'totp,email' },
};
if (!PROFILES[profile]) throw new Error(`Unknown E2E_PROFILE ${profile}`);

function secrets() {
  mkdirSync(stateDir, { recursive: true });
  const file = join(stateDir, 'secrets.json');
  const s = { dataKey: randomBytes(32).toString('base64'), adminPassword: `E2E-${randomBytes(12).toString('base64url')}` };
  try {
    // wx: created here or not at all, so no check and write with a gap between them. Existing secrets are kept.
    writeFileSync(file, JSON.stringify(s), { mode: 0o600, flag: 'wx' });
    return s;
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  return JSON.parse(readFileSync(file, 'utf8'));
}

function backendEnv(extra = {}) {
  const s = secrets();
  return {
    PATH: process.env.PATH, HOME: process.env.HOME, TZ: 'Asia/Kolkata',
    NODE_ENV: 'development', HOST: '127.0.0.1', PORT: String(ports.api), LOG_LEVEL: 'warn', COOKIE_SECURE: 'false',
    DATABASE_URL: app, DATABASE_MIGRATION_URL: owner, DATABASE_SSL: 'disable', DATA_ENCRYPTION_KEY: s.dataKey,
    STORAGE_DRIVER: 'local', STORAGE_PATH: join(stateDir, 'storage'), AUTH_RATE_LIMIT_PER_MINUTE: '600', AUTH_ACCOUNT_RATE_LIMIT_PER_MINUTE: '300', EXPORT_RATE_LIMIT_PER_MINUTE: '600', JOBS_INTERVAL_SECONDS: '10',
    SMTP_HOST: '127.0.0.1', SMTP_PORT: String(ports.smtp), SMTP_SECURE: 'none',
    BRAND_NAME: 'Northwind Analytical', BRAND_PRODUCT_NAME: 'Northwind HRMS', BRAND_LEGAL_NAME: 'Northwind Analytical Pvt Ltd', BRAND_PRIMARY_COLOR: '#0F5C7A', BRAND_SECONDARY_COLOR: '#0F172A', BRAND_ACCENT_COLOR: '#2F855A',
    BRAND_SUPPORT_EMAIL: 'support@example.test', BRAND_EMAIL_FROM: 'hrms@example.test', BRAND_LOGIN_MESSAGE: 'Synthetic test installation: no real employee data.',
    BRAND_DOMAIN: 'localhost', BRAND_LOCALE: 'en-IN', BRAND_TIMEZONE: 'Asia/Kolkata', BRAND_CURRENCY: 'INR', BRAND_DATE_FORMAT: 'DD/MM/YYYY', BRAND_FINANCIAL_YEAR_START: '04-01', BRAND_COUNTRY: 'IN',
    ...PROFILES[profile], ...extra,
  };
}

const tsx = () => join(backend, 'node_modules/.bin/tsx');
function runBackend(script, args = [], extra = {}) {
  const r = spawnSync(tsx(), [script, ...args], { cwd: backend, env: backendEnv(extra), encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${script} failed:\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
}

async function resetDatabase() {
  const pg = (await import(join(backend, 'node_modules/pg/lib/index.js'))).default;
  const c = new pg.Client({ connectionString: owner });
  await c.connect();
  // Refuse anything that is not a disposable local end-to-end database.
  const name = (await c.query('select current_database() d')).rows[0].d;
  if (!/^hrms_e2e/.test(name) || !['127.0.0.1', 'localhost'].includes(new URL(owner).hostname)) throw new Error(`Refusing to reset ${name}`);
  await c.query('DROP SCHEMA IF EXISTS public CASCADE');
  await c.query('CREATE SCHEMA public');
  await c.query('GRANT USAGE ON SCHEMA public TO hrms_app');
  await c.end();
}

async function seed() {
  const s = secrets();
  await resetDatabase();
  runBackend('src/db/migrate.ts');
  runBackend('src/db/bootstrap.ts', ['--admin-email', 'admin@example.test', '--admin-name', 'Ishaan Verma', '--mode', 'password'], { BOOTSTRAP_ADMIN_PASSWORD: s.adminPassword });
  const out = runBackend('src/db/demo.ts', [], { DEMO_DATA_ALLOWED: 'true' });
  const password = /Password for all demo logins: (\S+)/.exec(out)?.[1];
  if (!password) throw new Error(`demo printed no password:\n${out}`);
  writeFileSync(join(stateDir, 'creds.json'), JSON.stringify({ password, adminPassword: s.adminPassword, domain: /(\S+)@(\S+)\s/.exec(out.split('\n').find((l) => l.startsWith('director@')) ?? '')?.[2] }), { mode: 0o600 });
}

/** A minimal SMTP receiver: keeps messages in memory, serves them as JSON. Test traffic only. */
function mailSink() {
  const messages = [];
  createTcp((sock) => {
    let data = false; let buf = ''; let body = ''; let rcpt = [];
    sock.write('220 e2e ESMTP\r\n');
    sock.on('error', () => undefined);
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      for (;;) {
        const i = buf.indexOf('\r\n');
        if (i < 0) return;
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (data) {
          if (line === '.') { data = false; messages.push({ to: rcpt, raw: body, at: Date.now() }); body = ''; rcpt = []; sock.write('250 OK\r\n'); } else body += `${line}\n`;
          continue;
        }
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === 'EHLO' || cmd === 'HELO') sock.write('250 e2e\r\n');
        else if (cmd === 'RCPT') { rcpt.push(/<([^>]+)>/.exec(line)?.[1] ?? ''); sock.write('250 OK\r\n'); } else if (cmd === 'DATA') { data = true; sock.write('354 go\r\n'); } else if (cmd === 'QUIT') { sock.write('221 bye\r\n'); sock.end(); } else sock.write('250 OK\r\n');
      }
    });
  }).listen(ports.smtp, '127.0.0.1');
  createHttp((req, res) => {
    if (req.method === 'DELETE') messages.length = 0;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(messages));
  }).listen(ports.mail, '127.0.0.1');
}

async function waitFor(url, what, ms = 60_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* still starting */ }
    await new Promise((f) => setTimeout(f, 500));
  }
  throw new Error(`${what} did not answer at ${url}`);
}

/** The bootstrap password must be changed before anything else works. Tests sign in with the changed one. */
async function finishAdminSetup() {
  const { adminPassword } = secrets();
  const creds = JSON.parse(readFileSync(join(stateDir, 'creds.json'), 'utf8'));
  const api = `http://localhost:${ports.api}/api/v1/auth`;
  const headers = { 'content-type': 'application/json' };
  // A password generated above for this throwaway stack, going to the API it just started on localhost.
  // codeql[js/file-access-to-http]
  const login = await fetch(`${api}/login`, { method: 'POST', headers, body: JSON.stringify({ email: 'admin@example.test', password: adminPassword }) });
  if (!login.ok) throw new Error(`admin sign-in failed: ${await login.text()}`);
  const { csrfToken } = await login.json();
  const cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const changed = `E2E-${randomBytes(12).toString('base64url')}`;
  // As above: synthetic credentials, to localhost only.
  // codeql[js/file-access-to-http]
  const change = await fetch(`${api}/password`, { method: 'POST', headers: { ...headers, cookie, 'x-csrf-token': csrfToken }, body: JSON.stringify({ currentPassword: adminPassword, newPassword: changed }) });
  if (!change.ok) throw new Error(`admin password change failed: ${await change.text()}`);
  writeFileSync(join(stateDir, 'creds.json'), JSON.stringify({ ...creds, adminPassword: changed }), { mode: 0o600 });
}

async function main() {
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(stateDir, 'stack.pid'), String(process.pid));
  const reset = process.argv.includes('--reset') || !existsSync(join(stateDir, 'creds.json'));
  if (reset) await seed();
  mailSink();
  const children = [
    spawn(tsx(), ['src/server.ts'], { cwd: backend, env: backendEnv({ PROCESS_ROLE: 'api' }), stdio: 'inherit' }),
    spawn(tsx(), ['src/worker.ts'], { cwd: backend, env: backendEnv({ PROCESS_ROLE: 'worker' }), stdio: 'inherit' }),
  ];
  const stop = () => { children.forEach((c) => c.kill('SIGTERM')); process.exit(0); };
  const watch = (c) => c.on('exit', (code) => { if (code) { process.stderr.write(`stack process exited with ${code}\n`); stop(); } });
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  children.forEach(watch);
  await waitFor(`http://127.0.0.1:${ports.api}/ready`, 'API');
  if (reset) await finishAdminSetup();
  // Last, because Playwright starts the tests once this answers, and they read the admin password finishAdminSetup writes.
  const web = spawn(join(root, 'node_modules/.bin/vite'), ['preview', '--host', '127.0.0.1', '--port', String(ports.web), '--strictPort'], { cwd: root, env: { ...process.env, HRMS_API_PROXY: `http://127.0.0.1:${ports.api}` }, stdio: 'inherit' });
  children.push(web);
  watch(web);
  await waitFor(`http://127.0.0.1:${ports.web}/`, 'web');
  process.stdout.write(`stack ready: profile=${profile} http://127.0.0.1:${ports.web}\n`);
}

main().catch((e) => { process.stderr.write(`${e.stack ?? e}\n`); process.exit(1); });
