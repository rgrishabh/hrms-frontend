// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrast } from '../lib/color';

function run(env: Record<string, string>) {
  const html = mkdtempSync(join(tmpdir(), 'hrms-html-'));
  const out = mkdtempSync(join(tmpdir(), 'hrms-out-'));
  writeFileSync(join(html, 'index.html'), readFileSync('index.html', 'utf8'));
  execFileSync('sh', ['docker/40-hrms-runtime.sh'], { env: { PATH: process.env['PATH']!, HRMS_HTML_ROOT: html, HRMS_RUNTIME_OUT: out, ...env }, stdio: 'pipe' });
  return (f: string) => readFileSync(join(out, f), 'utf8');
}

describe('container runtime script', () => {
  it('generates the manifest and icon from brand values', () => {
    const read = run({ BRAND_PRODUCT_NAME: 'Acme People', BRAND_NAME: 'Acme "Labs"', BRAND_PRIMARY_COLOR: '#ffd700' });
    const manifest = JSON.parse(read('manifest.webmanifest')) as { name: string; description: string; theme_color: string; icons: { src: string }[] };
    expect(manifest.name).toBe('Acme People');
    expect(manifest.description).toBe('Acme "Labs"');
    expect(manifest.theme_color).toBe('#ffd700');
    expect(manifest.icons[0]!.src).toBe('/icon.svg');
    const icon = read('icon.svg');
    expect(icon).toContain('>AP<');
    expect(icon).toContain('fill="#000000"');
  });
  it('picks the readable icon text for any colour', () => {
    for (const color of ['#14532d', '#ffffff', '#000000', '#777777', '#1f5f8b', '#abc']) {
      const icon = run({ BRAND_PRIMARY_COLOR: color })('icon.svg');
      const on = /fill="(#[0-9a-f]{6})">/.exec(icon)![1]!;
      expect(contrast(on, color), color).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('escapes HTML in the product name', () => {
    const read = run({ BRAND_PRODUCT_NAME: '<script>x' });
    expect(read('index.html')).not.toContain('<script>x');
    expect(read('env.js')).not.toContain('<script>x');
    expect(read('icon.svg')).not.toContain('<S');
  });
  it('keeps the head marker working', () => {
    const page = run({ BRAND_PRODUCT_NAME: 'Acme' })('index.html');
    expect(page).toContain('<title>Acme</title>');
    expect(page).not.toContain('hrms:head');
    expect(page).toContain('<meta name="theme-color"');
    expect(page).toContain('rel="manifest"');
  });
  it('the CSP has no unsafe-inline, and allows same-origin manifest and worker', () => {
    const headers = run({ BRAND_LOGO_DARK_URL: 'https://cdn.example.com/d.svg' })('headers.conf');
    expect(headers).not.toContain('unsafe-inline');
    expect(headers).toContain("manifest-src 'self'");
    expect(headers).toContain("worker-src 'self'");
    expect(headers).toContain('https://cdn.example.com');
  });
  it('accepts /brand/ favicons and refuses other paths', () => {
    expect(run({ BRAND_FAVICON_URL: '/brand/icon.png' })('index.html')).toContain('href="/brand/icon.png"');
    expect(() => run({ BRAND_FAVICON_URL: 'http://evil.test/x.png' })).toThrow();
  });
  it('refuses a malformed colour', () => { expect(() => run({ BRAND_PRIMARY_COLOR: 'red' })).toThrow(); });
});
