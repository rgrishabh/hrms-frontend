import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setCsrf, ApiError } from './api';
import { setLocalePrefs } from './format';
import { applyBrand } from './lib/brand';
import { fetchPublicConfig, type PublicConfig } from './lib/config';
import type { ApiResponse } from './lib/api-types';
import { anyFlagOn, type FeatureFlag } from './lib/features';
import { queryClient } from './lib/query';

export type { PublicConfig } from './lib/config';

/** GET /auth/me, from the generated schema, minus `capabilities`, which features from the public config replaced. */
export type Me = Omit<ApiResponse<'/api/v1/auth/me'>, 'capabilities'>;

/** From the sign-in answer, kept while the code is being entered: how the second step works. Lost on reload, when `me.mfa.method` still says which method. */
export interface MfaChallenge { method: string | null; delivery: string | null }

export type ConfigFailure = { kind: 'not_configured'; message: string } | { kind: 'temporary'; status: number };

interface AuthCtx {
  config: PublicConfig | null;
  configError: ConfigFailure | null;
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  challenge: MfaChallenge | null;
  setChallenge: (c: MfaChallenge | null) => void;
  /** The server ended this session, usually the idle limit. Shown once, on the sign-in page. */
  sessionEnded: boolean;
  clearSessionEnded: () => void;
  can: (...perms: string[]) => boolean;
  canAny: (...perms: string[]) => boolean;
  hasFeature: (...flags: FeatureFlag[]) => boolean;
}

const Ctx = createContext<AuthCtx>(null as never);
export const useAuth = () => useContext(Ctx);

const RETRY_MS = 5000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [configError, setConfigError] = useState<ConfigFailure | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [challenge, setChallenge] = useState<MfaChallenge | null>(null);
  const [sessionEnded, setSessionEnded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const m = await api.get<Me>('/api/v1/auth/me');
      if (m.preferences) setLocalePrefs({ timezone: m.preferences.timezone, dateFormat: m.preferences.dateFormat });
      setMe(m);
    } catch { setMe(null); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let retry: ReturnType<typeof setTimeout> | undefined;
    const load = () => {
      fetchPublicConfig().then((c) => {
        setConfig(c);
        setConfigError(null);
        applyBrand(c);
        setLocalePrefs({ locale: c.brand.locale, timezone: c.brand.timezone, dateFormat: c.brand.dateFormat, currency: c.brand.currency });
        return refresh();
      }).catch((e: unknown) => {
        setLoading(false);
        // Only a 404 means this address is not an installation; anything else is temporary, so keep trying.
        if (e instanceof ApiError && e.status === 404) { setConfigError({ kind: 'not_configured', message: e.message }); return; }
        setConfigError({ kind: 'temporary', status: e instanceof ApiError ? e.status : 0 });
        retry = setTimeout(load, RETRY_MS);
      });
    };
    load();
    return () => clearTimeout(retry);
  }, [refresh]);

  useEffect(() => {
    const onUnauthorized = () => { setMe((was) => { if (was) setSessionEnded(true); return null; }); setCsrf(''); queryClient.clear(); };
    window.addEventListener('hrms:unauthorized', onUnauthorized);
    return () => window.removeEventListener('hrms:unauthorized', onUnauthorized);
  }, []);

  const value = useMemo<AuthCtx>(() => {
    const permissions = new Set(me?.permissions ?? []);
    const features = config?.features ?? {};
    return {
      config, configError, me, loading, refresh, challenge, setChallenge, sessionEnded,
      clearSessionEnded: () => setSessionEnded(false),
      logout: async () => {
        await api.post('/api/v1/auth/logout').catch(() => undefined);
        setCsrf('');
        setMe(null);
        setChallenge(null);
        queryClient.clear();
      },
      can: (...p) => !!me && p.every((x) => permissions.has(x)),
      canAny: (...p) => !!me && p.some((x) => permissions.has(x)),
      hasFeature: (...flags) => anyFlagOn(features, flags),
    };
  }, [config, configError, me, loading, refresh, challenge, sessionEnded]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
