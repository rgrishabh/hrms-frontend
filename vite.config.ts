import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

/** Same strict policy nginx sends (docker/40-hrms-runtime.sh), so preview-based tests catch CSP breakage. */
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

/** Writes sw.js with the initial assets to precache. Lazy chunks are cached when first used. */
function serviceWorker(): Plugin {
  return {
    name: 'hrms-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const initial = new Set<string>();
      const visit = (file: string) => {
        const item = bundle[file];
        if (!item || initial.has(file)) return;
        initial.add(file);
        if (item.type === 'chunk') {
          item.imports.forEach(visit);
          for (const css of (item as { viteMetadata?: { importedCss?: Set<string> } }).viteMetadata?.importedCss ?? []) initial.add(css);
        }
      };
      for (const [file, item] of Object.entries(bundle)) if (item.type === 'chunk' && item.isEntry) visit(file);
      const inter = Object.keys(bundle).filter((f) => /inter-latin-wght-normal/.test(f));
      const paths = [...initial, ...inter].map((f) => `/${f}`).concat(['/boot.js', '/manifest.webmanifest', '/icon.svg']);
      const build = createHash('sha256').update(paths.join()).digest('hex').slice(0, 12);
      const source = readFileSync('src/pwa/sw.template.js', 'utf8').replace('__BUILD__', build).replace('__PRECACHE__', JSON.stringify(paths));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

/** Pre-compresses text assets, so nginx sends them without spending CPU at request time. */
function precompress(): Plugin {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
  return {
    name: 'hrms-precompress',
    apply: 'build',
    closeBundle() {
      for (const file of walk('dist').filter((f) => /\.(js|css|svg|txt)$/.test(f) && !f.endsWith('env.js'))) {
        const raw = readFileSync(file);
        writeFileSync(`${file}.gz`, gzipSync(raw, { level: 9 }));
        writeFileSync(`${file}.br`, brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }));
      }
    },
  };
}

// The API resolves the tenant from the Host header, so the dev proxy must
// preserve it (changeOrigin: false). Use http://<tenant>.localhost:5173.
export default defineConfig({
  plugins: [react(), serviceWorker(), precompress()],
  build: { sourcemap: false },
  server: {
    port: 5173,
    allowedHosts: ['.localhost'],
    proxy: {
      '/api': { target: 'http://127.0.0.1:4000', changeOrigin: false },
      '/brand': { target: 'http://127.0.0.1:4000', changeOrigin: false },
      '/branding': { target: 'http://127.0.0.1:4000', changeOrigin: false },
    },
  },
  preview: { headers: { 'Content-Security-Policy': CSP } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    restoreMocks: true,
    testTimeout: 15000,
  },
});
