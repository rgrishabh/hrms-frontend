import { api } from '../api';
import type { Features } from './features';

export type ManagementMode = 'single' | 'single_hr' | 'multi';

/** GET /api/v1/config/public, normalised so the rest of the app can rely on every field. */
export interface PublicConfig {
  product: { name: string };
  brand: {
    name: string; productName: string; legalName: string | null;
    logoUrl: string | null; logoDarkUrl: string | null; faviconUrl: string | null;
    primaryColor: string; secondaryColor: string | null; accentColor: string | null; fontFamily: string | null;
    supportEmail: string | null; supportPhone: string | null; helpUrl: string | null; loginMessage: string | null;
    locale: string; timezone: string; currency: string; dateFormat: string; financialYearStart: string; country: string;
  };
  features: Features;
  mode: ManagementMode;
  mfa: { available: boolean; enforced: boolean; methods: string[] };
}

type RawBrand = Partial<PublicConfig['brand']>;
interface RawConfig { product?: { name?: string }; brand?: RawBrand; features?: Features; mode?: string; mfa?: Partial<PublicConfig['mfa']> }

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

export function normalizeConfig(raw: RawConfig): PublicConfig {
  const b = raw.brand ?? {};
  const productName = str(b.productName) ?? str(raw.product?.name) ?? 'HRMS';
  const mode = raw.mode === 'single' || raw.mode === 'single_hr' ? raw.mode : 'multi';
  return {
    product: { name: productName },
    brand: {
      name: str(b.name) ?? productName,
      productName,
      legalName: str(b.legalName),
      logoUrl: str(b.logoUrl),
      logoDarkUrl: str(b.logoDarkUrl),
      faviconUrl: str(b.faviconUrl),
      primaryColor: str(b.primaryColor) ?? '#2b3a4a',
      secondaryColor: str(b.secondaryColor),
      accentColor: str(b.accentColor),
      fontFamily: str(b.fontFamily),
      supportEmail: str(b.supportEmail),
      supportPhone: str(b.supportPhone),
      helpUrl: str(b.helpUrl),
      loginMessage: str(b.loginMessage),
      locale: str(b.locale) ?? 'en-IN',
      timezone: str(b.timezone) ?? 'Asia/Kolkata',
      currency: str(b.currency) ?? 'INR',
      dateFormat: str(b.dateFormat) ?? 'DD/MM/YYYY',
      financialYearStart: str(b.financialYearStart) ?? '04-01',
      country: str(b.country) ?? 'IN',
    },
    features: raw.features ?? {},
    mode,
    mfa: { available: raw.mfa?.available === true, enforced: raw.mfa?.enforced === true, methods: raw.mfa?.methods ?? [] },
  };
}

export const fetchPublicConfig = async (): Promise<PublicConfig> => normalizeConfig(await api.get<RawConfig>('/api/v1/config/public'));
