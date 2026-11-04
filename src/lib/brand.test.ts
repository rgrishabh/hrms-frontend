import { describe, expect, it } from 'vitest';
import { applyBrand, brandVariables } from './brand';
import { contrast, DARK_SURFACES, LIGHT_SURFACES } from './color';
import { normalizeConfig } from './config';

const cfg = normalizeConfig({ brand: { name: 'Acme', productName: 'Acme HR', primaryColor: '#ffd700', accentColor: '#14532d', fontFamily: 'Noto Sans', locale: 'en-GB', faviconUrl: '/brand/icon.svg' }, features: { FEATURE_LEAVE: true }, mode: 'single_hr', mfa: { available: true } });

describe('brandVariables', () => {
  it('produces accessible text in both themes from a difficult colour', () => {
    const v = brandVariables('brand', '#ffd700');
    expect(contrast(v['--brand-text-l']!, LIGHT_SURFACES.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(v['--brand-text-d']!, DARK_SURFACES.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(v['--brand-on-l']!, v['--brand-solid-l']!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(v['--brand-on-d']!, v['--brand-solid-d']!)).toBeGreaterThanOrEqual(4.5);
    expect(v['--brand-500']).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('applyBrand', () => {
  it('writes variables, language, title and favicon to the document', () => {
    applyBrand(cfg);
    const style = document.documentElement.style;
    expect(style.getPropertyValue('--brand-solid-l')).toMatch(/^#/);
    expect(style.getPropertyValue('--accent-text-d')).toMatch(/^#/);
    expect(style.getPropertyValue('--font-sans')).toContain('Noto Sans Variable');
    expect(document.documentElement.lang).toBe('en-GB');
    expect(document.title).toBe('Acme HR');
    expect(document.head.querySelector<HTMLLinkElement>('link[rel="icon"]')?.getAttribute('href')).toBe('/brand/icon.svg');
  });

  it('ignores a font that is not bundled', () => {
    document.documentElement.style.removeProperty('--font-sans');
    applyBrand(normalizeConfig({ brand: { primaryColor: '#123456', fontFamily: 'Comic Sans' } }));
    expect(document.documentElement.style.getPropertyValue('--font-sans')).toBe('');
  });
});

describe('normalizeConfig', () => {
  it('fills safe defaults and treats missing MFA as unavailable', () => {
    const c = normalizeConfig({});
    expect(c.mode).toBe('multi');
    expect(c.mfa.available).toBe(false);
    expect(c.features).toEqual({});
    expect(c.brand.productName).toBe('HRMS');
  });
  it('rejects an unknown mode', () => { expect(normalizeConfig({ mode: 'huge' }).mode).toBe('multi'); });
});
