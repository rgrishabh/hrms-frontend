import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { API_ROUTES } from './api-routes.gen';

const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const sources = walk('src').filter((f) => /\.tsx?$/.test(f) && !/\.test\.|\.gen\.|src\/test\//.test(f));

/** `${...}` replaced by X and everything after `?` dropped, counting braces so `${qs({ a })}` is one hole. */
function shape(template: string): string {
  let out = ''; let depth = 0;
  for (let i = 0; i < template.length; i++) {
    if (depth === 0 && template[i] === '$' && template[i + 1] === '{') { depth = 1; i++; out += '\0'; continue; }
    if (depth > 0) { if (template[i] === '{') depth++; else if (template[i] === '}') depth--; continue; }
    out += template[i];
  }
  // A hole straight after static text at the very end is a query string or a file extension: `~` keeps that open.
  return out.split('?')[0]!.replace(/([^/\0])\0$/, '$1~').replace(/\0/g, 'X');
}

const METHOD: Record<string, string> = { get: 'GET', blob: 'GET', post: 'POST', upload: 'POST', put: 'PUT', patch: 'PATCH', del: 'DELETE' };
const CALL = /\bapi\.(get|post|put|patch|del|upload|blob)(?:<[^()]*?(?:\([^()]*\)[^()]*?)*>)?\(\s*(`(?:[^`\\]|\\.)*`|'[^']*')/g;
const QUERY = /useApiQuery(?:<[^;]*?>)?\(\s*(?:[\w.!&|\s]+\?\s*)?(`(?:[^`\\]|\\.)*`|'[^']*')/g;
const URL_LITERAL = /(`\/api\/v1[^`]*`|'\/api\/v1[^']*')/g;

interface Call { file: string; method: string; url: string }

/** `const NAME = '/api/v1/...'`, so `${NAME}/x` can be followed. A constant in the same file wins over one exported elsewhere. */
const CONSTANT = /const ([A-Za-z_]\w*) = (?:`(\/api\/v1[^`$]*)`|'(\/api\/v1[^']*)')/g;
const constantsIn = (text: string) => new Map([...text.matchAll(CONSTANT)].map((m) => [m[1]!, (m[2] ?? m[3])!.split('?')[0]!]));
const shared = new Map(sources.flatMap((f) => [...constantsIn(readFileSync(f, 'utf8'))]));
const CONSTANT_CALL = /\bapi\.(get|post|put|patch|del|upload|blob)(?:<[^()]*?(?:\([^()]*\)[^()]*?)*>)?\(\s*([A-Z_a-z]\w*)\b/g;
const CONSTANT_QUERY = /useApiQuery(?:<[^;]*?>)?\(\s*(?:[\w.!&|\s]+\?\s*)?([A-Z_a-z]\w*)\b(?!\s*\?)/g;

function calls(): Call[] {
  const out: Call[] = [];
  for (const file of sources) {
    const text = readFileSync(file, 'utf8');
    const local = constantsIn(text);
    const value = (name: string) => local.get(name) ?? shared.get(name);
    const url = (literal: string) => shape(literal.slice(1, -1).replace(/\$\{([A-Za-z_]\w*)\}/g, (hole, name: string) => value(name) ?? hole));
    const seen = new Set<string>();
    for (const m of text.matchAll(CALL)) { out.push({ file, method: METHOD[m[1]!]!, url: url(m[2]!) }); seen.add(m[2]!); }
    for (const m of text.matchAll(QUERY)) { out.push({ file, method: 'GET', url: url(m[1]!) }); seen.add(m[1]!); }
    for (const m of text.matchAll(CONSTANT_CALL)) { const v = value(m[2]!); if (v) out.push({ file, method: METHOD[m[1]!]!, url: v }); }
    for (const m of text.matchAll(CONSTANT_QUERY)) { const v = value(m[1]!); if (v) out.push({ file, method: 'GET', url: v }); }
    // Any other template (a download link, a URL handed to a helper) must at least be a route, or lead to one, under some method.
    for (const m of text.matchAll(URL_LITERAL)) if (!seen.has(m[1]!)) out.push({ file, method: '*', url: url(m[1]!) });
    // A template built on a constant, handed to something other than api.*.
    for (const m of text.matchAll(/`\$\{([A-Z][A-Z_]*)\}\/[^`]*`/g)) if (!seen.has(m[0])) out.push({ file, method: '*', url: url(m[0]) });
  }
  return out.filter((c) => c.url.startsWith('/api/v1/'));
}

/** Segment by segment: `{id}` in the route and X in the call match anything; a trailing `~` allows a suffix such as `.csv`. */
function sameRoute(url: string, path: string): boolean {
  const a = url.split('/'); const b = path.split('/');
  return a.length === b.length && a.every((seg, i) => {
    const other = b[i]!;
    if (seg === 'X' || other.startsWith('{')) return true;
    return seg.endsWith('~') ? other.startsWith(seg.slice(0, -1)) : seg === other;
  });
}
const ROUTES = API_ROUTES.map(([method, path]) => ({ method, path }));
const exact = (c: Call) => ROUTES.filter((r) => (c.method === '*' || r.method === c.method) && sameRoute(c.url, r.path));
const matches = (c: Call) => {
  const hit = exact(c);
  if (hit.length || c.method !== '*') return hit;
  // A prefix constant or a helper's base: it is enough that some route starts with it.
  const prefix = c.url.replace(/\/$/, '');
  const depth = prefix.split('/').length;
  const open = (path: string) => sameRoute(`${prefix}~`, path.split('/').slice(0, depth).join('/'));
  return ROUTES.filter((r) => open(r.path));
};

describe('API contract', () => {
  const found = calls();
  it('finds the calls it is meant to check', () => { expect(found.length).toBeGreaterThan(250); });
  it('every call in the app is a route in the backend spec', () => {
    const missing = found.filter((c) => !matches(c).length).map((c) => `${c.method} ${c.url} (${c.file})`);
    expect([...new Set(missing)]).toEqual([]);
  });
  it('writes which routes have no caller when asked', () => {
    const out = process.env.HRMS_ROUTE_COVERAGE;
    if (!out) return;
    const used = new Set(found.flatMap((c) => exact(c).map((r) => `${r.method} ${r.path}`)));
    writeFileSync(out, `${API_ROUTES.map(([m, p]) => `${m} ${p}`).filter((r) => !used.has(r)).join('\n')}\n`);
  });
});
