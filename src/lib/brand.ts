import { DARK_SURFACES, deriveRole, LIGHT_SURFACES, parseHex, shades, type ColorRole } from './color';
import type { PublicConfig } from './config';

/** Fonts bundled with the frontend; BRAND_FONT_FAMILY must name one of these. */
export const BUNDLED_FONTS: Record<string, string> = {
  Inter: '"Inter Variable"',
  'Source Sans 3': '"Source Sans 3 Variable"',
  'Noto Sans': '"Noto Sans Variable"',
};
const FONT_FALLBACK = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

const ROLE_VARS: [keyof ColorRole, string][] = [
  ['solid', 'solid'], ['solidHover', 'solid-hover'], ['solidActive', 'solid-active'], ['on', 'on'],
  ['text', 'text'], ['ring', 'ring'], ['subtle', 'subtle'], ['subtleText', 'subtle-text'],
];

/** Every CSS variable a brand colour produces. Pure, so it can be tested without a DOM. */
export function brandVariables(prefix: string, hex: string): Record<string, string> {
  const vars: Record<string, string> = {};
  const light = deriveRole(hex, LIGHT_SURFACES, false);
  const dark = deriveRole(hex, DARK_SURFACES, true);
  for (const [key, name] of ROLE_VARS) {
    vars[`--${prefix}-${name}-l`] = light[key];
    vars[`--${prefix}-${name}-d`] = dark[key];
  }
  for (const [step, value] of Object.entries(shades(hex))) vars[`--${prefix}-${step}`] = value;
  return vars;
}

function setLink(rel: string, href: string | null) {
  const existing = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!href) return;
  if (existing) { existing.href = href; return; }
  const link = document.createElement('link');
  link.rel = rel;
  link.href = href;
  document.head.append(link);
}

export function documentTitle(cfg: PublicConfig, page?: string): string {
  return [page, cfg.brand.productName].filter(Boolean).join(' · ');
}

/**
 * Applies brand values to the document through CSSOM, which `style-src 'self'` allows. Injecting a
 * <style> element would be blocked, so this is the only way brand reaches the stylesheet.
 */
export function applyBrand(cfg: PublicConfig) {
  const root = document.documentElement;
  const colors: [string, string | null][] = [['brand', cfg.brand.primaryColor], ['secondary', cfg.brand.secondaryColor], ['accent', cfg.brand.accentColor]];
  for (const [prefix, hex] of colors) {
    if (!hex || !parseHex(hex)) continue;
    for (const [name, value] of Object.entries(brandVariables(prefix, hex))) root.style.setProperty(name, value);
  }
  const font = cfg.brand.fontFamily ? BUNDLED_FONTS[cfg.brand.fontFamily] : undefined;
  if (font) root.style.setProperty('--font-sans', `${font}, ${FONT_FALLBACK}`);
  root.lang = cfg.brand.locale;
  setLink('icon', cfg.brand.faviconUrl);
  document.title = documentTitle(cfg);
  syncThemeColor();
}

/** The browser chrome colour follows the current theme. */
export function syncThemeColor() {
  const meta = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]') ?? document.head.appendChild(Object.assign(document.createElement('meta'), { name: 'theme-color' }));
  meta.content = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#ffffff';
}
