// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AA_NON_TEXT, AA_TEXT, contrast, DARK_SURFACES, deriveRole, LIGHT_SURFACES, onColor, parseHex, shades } from './color';

/** Deterministic sweep: every 4-bit-per-channel colour plus some awkward brand colours. */
function sweep(): string[] {
  const steps = ['00', '22', '44', '66', '88', 'aa', 'cc', 'ee', 'ff'];
  const out: string[] = ['#14532d', '#ffff00', '#00ffff', '#ff00ff', '#777777', '#808080', '#1f5f8b', '#fafafa', '#050505', '#ff7f50', '#ffd700', '#7c3aed'];
  for (const r of steps) for (const g of steps) for (const b of steps) out.push(`#${r}${g}${b}`);
  return out;
}

describe('parseHex', () => {
  it('reads #rgb and #rrggbb and rejects anything else', () => {
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHex('#14532D')).toEqual({ r: 20, g: 83, b: 45 });
    expect(parseHex('red')).toBeNull();
    expect(parseHex('#12345')).toBeNull();
  });
});

describe('contrast', () => {
  it('matches the WCAG reference values', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
  });
});

describe('onColor', () => {
  it('always clears AA text on any background', () => {
    for (const c of sweep()) expect(contrast(onColor(c), c), c).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe.each([['light', LIGHT_SURFACES, false], ['dark', DARK_SURFACES, true]] as const)('deriveRole, %s', (_name, surfaces, dark) => {
  const backgrounds = [surfaces.surface, surfaces.bg, surfaces.raised];
  it('stays AA for every colour in the sweep', () => {
    for (const hex of sweep()) {
      const role = deriveRole(hex, surfaces, dark);
      for (const bg of backgrounds) {
        expect(contrast(role.text, bg), `text ${hex} on ${bg}`).toBeGreaterThanOrEqual(AA_TEXT);
        expect(contrast(role.ring, bg), `ring ${hex} on ${bg}`).toBeGreaterThanOrEqual(AA_NON_TEXT);
        expect(contrast(role.solid, bg), `solid ${hex} on ${bg}`).toBeGreaterThanOrEqual(AA_NON_TEXT);
      }
      for (const fill of [role.solid, role.solidHover, role.solidActive]) expect(contrast(role.on, fill), `on ${hex} over ${fill}`).toBeGreaterThanOrEqual(AA_TEXT);
      expect(contrast(role.subtleText, role.subtle), `subtle ${hex}`).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });
});

describe('shades', () => {
  it('runs from light to dark in order', () => {
    const ramp = shades('#14532d');
    expect(Object.keys(ramp)).toEqual(['50', '100', '200', '300', '400', '500', '600', '700', '800', '900']);
    expect(contrast(ramp['50']!, '#ffffff')).toBeLessThan(contrast(ramp['900']!, '#ffffff'));
  });
});

/** tokens.css is static, so its pairs are checked here against the same thresholds. */
describe('tokens.css', () => {
  const css = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');
  const block = (selector: string) => {
    const start = css.indexOf(`${selector} {`);
    const body = css.slice(start, css.indexOf('}', start));
    return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1]!, m[2]!]));
  };
  const light = block(':root');
  const dark = { ...light, ...block('[data-theme="dark"]') };
  it('keeps the surfaces used by the brand maths in step', () => {
    for (const [tokens, s] of [[light, LIGHT_SURFACES], [dark, DARK_SURFACES]] as const) {
      expect(tokens['surface']).toBe(s.surface); expect(tokens['bg']).toBe(s.bg); expect(tokens['surface-2']).toBe(s.raised);
    }
  });
  describe.each([['light', light], ['dark', dark]] as const)('%s', (_n, t) => {
    const surfaces = ['surface', 'bg', 'surface-2'];
    it('text passes AA on every surface', () => {
      for (const fg of ['text', 'text-2', 'text-3']) for (const bg of surfaces) expect(contrast(t[fg]!, t[bg]!), `${fg} on ${bg}`).toBeGreaterThanOrEqual(AA_TEXT);
    });
    it('control borders reach 3:1', () => {
      for (const bg of surfaces) expect(contrast(t['border-strong']!, t[bg]!), `border-strong on ${bg}`).toBeGreaterThanOrEqual(AA_NON_TEXT);
    });
    it('status text passes AA on its own tint and on the surface', () => {
      for (const s of ['ok', 'warn', 'danger', 'info']) {
        expect(contrast(t[s]!, t[`${s}-bg`]!), `${s} on tint`).toBeGreaterThanOrEqual(AA_TEXT);
        expect(contrast(t[s]!, t['surface']!), `${s} on surface`).toBeGreaterThanOrEqual(AA_TEXT);
      }
    });
    it('solid danger is readable and visible', () => {
      expect(contrast(t['on-danger']!, t['danger-solid']!)).toBeGreaterThanOrEqual(AA_TEXT);
      expect(contrast(t['danger-solid']!, t['surface']!)).toBeGreaterThanOrEqual(AA_NON_TEXT);
    });
  });
});
