#!/usr/bin/env node
/**
 * The initial JS budget: what a browser must download before the app can start, gzipped, file by file.
 *   npm run check:bundle          reads dist/ after a build (CI runs this)
 *   node scripts/check-bundle.mjs <dir>
 * Counted: every <script src> and modulepreload in index.html, and the static imports they reach.
 * Not counted: chunks behind import(), which load on demand. Exits 1 over budget, 2 if there is nothing to measure.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const BUDGET_BYTES = 200_000;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(process.argv[2] ?? join(root, 'dist'));
const indexFile = join(dist, 'index.html');
if (!existsSync(indexFile)) { process.stderr.write(`No ${indexFile}. Run npm run build first.\n`); process.exit(2); }

/** Starts with a "/" and relative to dist, so both index.html and chunk references compare equal. */
const local = (href, from = '/') => (/^(https?:)?\/\//.test(href) ? null : posix.resolve(posix.dirname(from), href.split(/[?#]/)[0] ?? href));

const html = readFileSync(indexFile, 'utf8');
const tags = (name) => html.match(new RegExp(`<${name}\\b[^>]*>`, 'g')) ?? [];
const attr = (tag, name) => new RegExp(`\\b${name}=["']([^"']+)["']`).exec(tag)?.[1] ?? null;
const scripts = tags('script').map((t) => attr(t, 'src'));
const preloads = tags('link').filter((t) => attr(t, 'rel') === 'modulepreload').map((t) => attr(t, 'href'));
const starts = [...scripts, ...preloads].filter((href) => href !== null).map((href) => local(href)).filter((p) => p !== null);
if (!starts.length) { process.stderr.write(`${indexFile} loads no scripts.\n`); process.exit(2); }

// `import{a}from"./x.js"`, `import"./x.js"`, `export{a}from"./x.js"`. The "(" of a dynamic import() cannot match.
const STATIC_IMPORT = /(?:^|[;}\n])\s*(?:import|export)\s*(?:[^'"`();]*?\bfrom\s*)?["']([^"']+\.js)["']/g;

const seen = new Map();
const missing = [];
const visit = (path) => {
  if (seen.has(path)) return;
  const file = join(dist, path);
  if (!existsSync(file)) { missing.push(path); return; }
  const source = readFileSync(file);
  seen.set(path, gzipSync(source, { level: 9 }).length);
  for (const [, target] of source.toString('utf8').matchAll(STATIC_IMPORT)) {
    const next = target === undefined ? null : local(target, path);
    if (next !== null) visit(next);
  }
};
starts.forEach(visit);
if (missing.length) { process.stderr.write(`index.html or a chunk refers to files that are not in ${dist}: ${missing.join(', ')}\n`); process.exit(2); }

const kb = (bytes) => `${(bytes / 1000).toFixed(1).padStart(7)} KB`;
const total = [...seen.values()].reduce((sum, bytes) => sum + bytes, 0);
for (const [path, bytes] of [...seen].sort((a, b) => b[1] - a[1])) process.stdout.write(`${kb(bytes)}  ${path}\n`);
process.stdout.write(`${kb(total)}  initial JS, gzip, ${seen.size} files (budget ${(BUDGET_BYTES / 1000).toFixed(0)} KB)\n`);
if (total >= BUDGET_BYTES) { process.stderr.write(`Initial JS is ${total - BUDGET_BYTES} bytes over the budget.\n`); process.exit(1); }
