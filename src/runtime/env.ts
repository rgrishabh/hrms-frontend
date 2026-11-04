/** Non-secret runtime values written to /env.js by the container at start (see docker/40-hrms-runtime.sh). */
export interface RuntimeEnv { environment: string; version: string }

declare global { interface Window { __HRMS_ENV__?: Partial<RuntimeEnv> } }

export function runtimeEnv(): RuntimeEnv {
  const e = (typeof window !== 'undefined' && window.__HRMS_ENV__) || {};
  return { environment: e.environment || 'local', version: e.version || 'dev' };
}

/** Label shown in the UI for non-production environments; null for production. */
export function environmentLabel(env: RuntimeEnv): string | null {
  const v = env.environment.trim().toLowerCase();
  return v === 'production' || v === 'prod' ? null : v.toUpperCase();
}
