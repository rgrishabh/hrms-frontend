/**
 * Colour maths for runtime branding. Brand colours are arbitrary hex values set at deployment, so
 * every shade and every on-brand text colour is computed in the browser and checked against WCAG.
 */
export interface Rgb { r: number; g: number; b: number }
interface Oklch { l: number; c: number; h: number }

export const AA_TEXT = 4.5;
export const AA_NON_TEXT = 3;

export function parseHex(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  const n = Number.parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function toHex({ r, g, b }: Rgb): string {
  const part = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

const toLinear = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const fromLinear = (c: number) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function luminance({ r, g, b }: Rgb): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function contrast(a: string, b: string): number {
  const ca = parseHex(a); const cb = parseHex(b);
  if (!ca || !cb) throw new Error(`Invalid colour: ${a} / ${b}`);
  const la = luminance(ca); const lb = luminance(cb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function rgbToOklch({ r, g, b }: Rgb): Oklch {
  const R = toLinear(r); const G = toLinear(g); const B = toLinear(b);
  const L = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const M = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const S = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const l = 0.2104542553 * L + 0.793617785 * M - 0.0040720468 * S;
  const a = 1.9779984951 * L - 2.428592205 * M + 0.4505937099 * S;
  const bb = 0.0259040371 * L + 0.7827717662 * M - 0.808675766 * S;
  return { l, c: Math.hypot(a, bb), h: Math.atan2(bb, a) };
}

function oklchToLinear({ l, c, h }: Oklch): [number, number, number] {
  const a = c * Math.cos(h); const b = c * Math.sin(h);
  const L = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const M = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const S = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
}

/** Keeps hue and lightness and reduces chroma until the colour fits sRGB. */
function oklchToHex(input: Oklch): string {
  const inGamut = (rgb: number[]) => rgb.every((v) => v >= -0.0005 && v <= 1.0005);
  let c = input.c;
  let rgb = oklchToLinear({ ...input, c });
  for (let i = 0; i < 24 && !inGamut(rgb); i++) { c *= 0.92; rgb = oklchToLinear({ ...input, c }); }
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return toHex({ r: fromLinear(clamp(rgb[0]!)), g: fromLinear(clamp(rgb[1]!)), b: fromLinear(clamp(rgb[2]!)) });
}

const setLightness = (hex: string, l: number, chromaScale = 1): string => {
  const o = rgbToOklch(parseHex(hex)!);
  return oklchToHex({ ...o, l, c: o.c * chromaScale });
};

const shiftLightness = (hex: string, delta: number): string => {
  const o = rgbToOklch(parseHex(hex)!);
  return oklchToHex({ ...o, l: Math.min(1, Math.max(0, o.l + delta)) });
};

/**
 * Moves a colour's lightness away from the backgrounds until it reaches `ratio` against all of them.
 * Falls back to black or white, one of which always can for the fixed surfaces in this product.
 */
export function ensureContrast(hex: string, backgrounds: readonly string[], ratio: number): string {
  const passes = (c: string) => backgrounds.every((bg) => contrast(c, bg) >= ratio);
  if (passes(hex)) return hex;
  const canDarken = passes('#000000');
  const canLighten = passes('#ffffff');
  const towardsLight = canLighten && (!canDarken || luminance(parseHex(backgrounds[0]!)!) < 0.18);
  let current = hex;
  for (let i = 0; i < 100; i++) {
    current = shiftLightness(current, towardsLight ? 0.01 : -0.01);
    if (passes(current)) return current;
  }
  return towardsLight ? '#ffffff' : '#000000';
}

/** Black or white, whichever reads better. One of them always clears 4.5:1 against any colour. */
export function onColor(background: string): string {
  return contrast('#ffffff', background) >= contrast('#000000', background) ? '#ffffff' : '#000000';
}

/** Perceptually even 50 to 900 ramp for a colour, same hue throughout. */
export function shades(hex: string): Record<string, string> {
  const ramp: [string, number, number][] = [['50', 0.975, 0.25], ['100', 0.95, 0.4], ['200', 0.9, 0.6], ['300', 0.82, 0.8], ['400', 0.72, 1], ['500', 0.62, 1], ['600', 0.53, 1], ['700', 0.45, 1], ['800', 0.36, 0.9], ['900', 0.27, 0.8]];
  return Object.fromEntries(ramp.map(([key, l, c]) => [key, setLightness(hex, l, c)]));
}

export interface Surfaces { surface: string; bg: string; raised: string }
/** These mirror --surface, --bg and --surface-2 in tokens.css; a unit test keeps them equal. */
export const LIGHT_SURFACES: Surfaces = { surface: '#ffffff', bg: '#f7f7f5', raised: '#f1f1ee' };
export const DARK_SURFACES: Surfaces = { surface: '#16191d', bg: '#0e1013', raised: '#1e2227' };

export interface ColorRole {
  solid: string; solidHover: string; solidActive: string; on: string;
  text: string; ring: string; subtle: string; subtleText: string;
}

/** The accessible roles one brand colour plays on one set of surfaces. */
export function deriveRole(hex: string, surfaces: Surfaces, dark: boolean): ColorRole {
  const backgrounds = [surfaces.surface, surfaces.bg, surfaces.raised];
  const solid = ensureContrast(hex, backgrounds, AA_NON_TEXT);
  const on = onColor(solid);
  const away = on === '#ffffff' ? -1 : 1; // hover moves away from the text colour, so contrast only improves
  const text = ensureContrast(hex, backgrounds, AA_TEXT);
  const ring = ensureContrast(hex, backgrounds, AA_NON_TEXT);
  const o = rgbToOklch(parseHex(hex)!);
  const subtle = oklchToHex({ l: dark ? 0.29 : 0.955, c: Math.min(o.c, dark ? 0.06 : 0.035), h: o.h });
  const subtleText = ensureContrast(text, [subtle], AA_TEXT);
  return {
    solid,
    solidHover: shiftLightness(solid, away * 0.045),
    solidActive: shiftLightness(solid, away * 0.09),
    on, text, ring, subtle, subtleText,
  };
}
