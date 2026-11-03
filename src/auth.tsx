import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setCsrf } from './api';
import { setLocalePrefs } from './format';

/** Deployment-level public configuration (GET /api/v1/public/config). The only source of branding in the UI. */
export interface PublicConfig {
  product: { name: string };
  brand: {
    name: string; shortName: string; logoUrl: string | null; faviconUrl: string | null;
    primaryColor: string; secondaryColor: string; accentColor: string; loginMessage: string | null;
    supportEmail: string | null; supportPhone: string | null; helpUrl: string | null;
  };
  organization: { name: string; legalName: string; country: string; timezone: string; currency: string; dateFormat: string; fiscalYearStartMonth: number };
  modules: string[];
}

export interface Me {
  user: { id: string; email: string; displayName: string; employeeId: string | null };
  passwordChangeRequired: boolean;
  mfa: { enabled: boolean; pending: boolean; enrollmentRequired: boolean };
  roles: { key: string; name: string }[];
  permissions: string[];
  csrfToken: string;
  organization: { id: string; name: string };
  preferences: { timezone: string; dateFormat: string; emailNotifications: boolean };
  /** Central capability map from the server — the only source for module visibility. */
  capabilities: Record<string, boolean>;
}

interface AuthCtx {
  config: PublicConfig | null;
  configError: string | null;
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  can: (...perms: string[]) => boolean;
  canAny: (...perms: string[]) => boolean;
  hasModule: (key: string) => boolean;
}

const Ctx = createContext<AuthCtx>(null as never);
export const useAuth = () => useContext(Ctx);

export function applyBrand(cfg: PublicConfig, page?: string) {
  const root = document.documentElement.style;
  root.setProperty('--brand', cfg.brand.primaryColor);
  root.setProperty('--brand-2', cfg.brand.accentColor);
  root.setProperty('--brand-dark', cfg.brand.secondaryColor);
  document.title = `${page ? page + ' · ' : ''}${cfg.brand.shortName} · ${cfg.product.name}`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const m = await api.get<Me>('/api/v1/auth/me');
      setCsrf(m.csrfToken);
      if (m.preferences) setLocalePrefs({ timezone: m.preferences.timezone, dateFormat: m.preferences.dateFormat });
      setMe(m);
    } catch { setMe(null); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    api.get<PublicConfig>('/api/v1/public/config').then((c) => {
      setConfig(c);
      applyBrand(c);
      setLocalePrefs({ timezone: c.organization.timezone, dateFormat: c.organization.dateFormat, currency: c.organization.currency });
      return refresh();
    }).catch((e) => { setConfigError(e.message); setLoading(false); });
  }, [refresh]);
  useEffect(() => {
    const h = () => setMe(null);
    window.addEventListener('hrms:unauthorized', h);
    return () => window.removeEventListener('hrms:unauthorized', h);
  }, []);

  const logout = async () => { await api.post('/api/v1/auth/logout').catch(() => undefined); setCsrf(''); setMe(null); };
  const can = (...p: string[]) => !!me && p.every((x) => me.permissions.includes(x));
  const canAny = (...p: string[]) => !!me && p.some((x) => me.permissions.includes(x));
  const hasModule = (k: string) => !!me?.capabilities?.[k];
  return <Ctx.Provider value={{ config, configError, me, loading, refresh, logout, can, canAny, hasModule }}>{children}</Ctx.Provider>;
}
