/** API client. Session is an httpOnly cookie; the CSRF token is held in memory only. */
let csrfToken = '';
export const setCsrf = (t: string) => { csrfToken = t; };

/** One field's problem in a validation failure. */
export interface ProblemFieldError { path?: string; field?: string; pointer?: string; message: string; code?: string }

/** RFC 7807 application/problem+json, the only error shape the API returns. */
export interface Problem {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code?: string;
  errors?: ProblemFieldError[];
  [extension: string]: unknown;
}

/** What `weak_password` refusals mean, in the order a person can act on them. */
const PASSWORD_PROBLEM: Record<string, string> = {
  too_short: 'It is too short.',
  too_long: 'It is too long.',
  breached: 'It appears on a list of leaked passwords.',
  personal: 'It contains part of your name or email.',
  too_simple: 'It is too repetitive.',
};

/** Words for the codes whose meaning a person needs, whatever the server's own wording. */
const CODE_MESSAGE: Record<string, string> = {
  malware_detected: 'This file was refused because a virus scan flagged it. It has not been saved.',
  scanner_unavailable: 'Uploads are paused because the virus scanner cannot be reached. Your file has not been saved. Try again shortly.',
  requires_higher_level: 'This includes people above your salary level, so it cannot be produced for you. Someone at a higher level must do this.',
};

const waitFor = (seconds: number) => (seconds < 90 ? `${seconds} second${seconds === 1 ? '' : 's'}` : `${Math.ceil(seconds / 60)} minutes`);

/** The whole message for a problem. Everything a screen shows about a failure comes through here. */
function describeProblem(problem: Problem, retryAfter: number | null): string {
  const passwordProblems = problem.code === 'weak_password' && Array.isArray(problem['problems']) ? (problem['problems'] as string[]).map((c) => PASSWORD_PROBLEM[c]).filter(Boolean) : [];
  if (passwordProblems.length) return `Choose a different password. ${passwordProblems.join(' ')}`;
  const base = (problem.code && CODE_MESSAGE[problem.code]) ?? problem.detail ?? problem.title;
  if (retryAfter !== null && !/\d/.test(base)) return `${base} Try again in ${waitFor(retryAfter)}.`;
  return base;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly problem: Problem;
  readonly errors: ProblemFieldError[];
  /** Seconds, from the Retry-After header of a 429 or 503. */
  readonly retryAfter: number | null;

  constructor(problem: Problem, retryAfter: number | null = null) {
    super(describeProblem(problem, retryAfter));
    this.name = 'ApiError';
    this.problem = problem;
    this.status = problem.status;
    this.code = problem.code ?? 'error';
    this.errors = Array.isArray(problem.errors) ? problem.errors : [];
    this.retryAfter = retryAfter;
  }

  /** Field errors by field name, for inline messages. Prefixes such as `employee.` are dropped. */
  fieldErrors(): Record<string, string> {
    const key = (e: ProblemFieldError) => (e.path ?? e.field ?? e.pointer ?? '').replace(/^\//, '').replace(/^\w+[./](?=.)/, '');
    const fields = Object.fromEntries(this.errors.map((e) => [key(e), e.message]).filter(([k]) => k));
    return this.code === 'weak_password' ? { ...fields, newPassword: this.message } : fields;
  }

}

const GENERIC_TITLE: Record<number, string> = {
  400: 'That request could not be processed', 401: 'Please sign in again', 403: 'You do not have access to this',
  404: 'Not found', 409: 'This changed while you were working on it', 413: 'That file is too large', 422: 'Please check the highlighted fields',
  429: 'Too many requests. Wait a moment and try again', 500: 'Something went wrong on our side', 502: 'The service is temporarily unavailable',
  503: 'The service is temporarily unavailable', 504: 'The service took too long to respond',
};

/** A problem from any response. Proxies answer in HTML, so nothing here assumes the body is JSON. */
function toProblem(res: Response, text: string): Problem {
  const fallback: Problem = { type: 'about:blank', title: GENERIC_TITLE[res.status] ?? `Request failed (${res.status})`, status: res.status };
  if (!text || !/json/i.test(res.headers.get('content-type') ?? '')) return fallback;
  try {
    const parsed = JSON.parse(text) as Partial<Problem> | null;
    if (!parsed || typeof parsed !== 'object' || (!parsed.title && !parsed.detail)) return fallback;
    return { ...fallback, ...parsed, status: typeof parsed.status === 'number' ? parsed.status : res.status };
  } catch { return fallback; }
}

/* In-flight requests, exposed on the main element so tests can wait for a page to settle. */
let inflight = 0;
const listeners = new Set<() => void>();
const setInflight = (n: number) => { inflight = n; listeners.forEach((l) => l()); };
export const inflightStore = {
  subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
  get: () => inflight,
};

function parseRetryAfter(res: Response): number | null {
  const value = res.headers.get('retry-after');
  if (!value) return null;
  const seconds = /^\d+$/.test(value.trim()) ? Number(value) : Math.ceil((Date.parse(value) - Date.now()) / 1000);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

/** A failed response as an ApiError. The one place status, problem body and Retry-After are read. */
function toError(res: Response, text: string): ApiError {
  return new ApiError(toProblem(res, text), parseRetryAfter(res));
}

async function send<T>(url: string, init: RequestInit, isLogin: boolean): Promise<T> {
  setInflight(inflight + 1);
  try {
    let res: Response;
    try {
      res = await fetch(url, { ...init, credentials: 'same-origin' });
    } catch {
      throw new ApiError({ type: 'about:blank', title: 'Cannot reach the server. Check your connection and try again.', status: 0, code: 'network_error' });
    }
    const text = await res.text();
    if (!res.ok) {
      if (res.status === 401 && !isLogin) window.dispatchEvent(new Event('hrms:unauthorized'));
      throw toError(res, text);
    }
    if (!text) return null as T;
    let data: T;
    try {
      data = JSON.parse(text) as T;
    } catch {
      throw new ApiError({ type: 'about:blank', title: GENERIC_TITLE[502]!, status: 502, code: 'bad_response' });
    }
    // Sign-in, /auth/password and the MFA routes rotate the session and answer with its new token.
    const rotated = (data as { csrfToken?: unknown } | null)?.csrfToken;
    if (typeof rotated === 'string') setCsrf(rotated);
    return data;
  } finally {
    setInflight(inflight - 1);
  }
}

function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET' && csrfToken) headers['x-csrf-token'] = csrfToken;
  return send<T>(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }, url.endsWith('/auth/login'));
}

/** multipart/form-data upload (browser sets the boundary); CSRF header included. */
function upload<T>(url: string, form: FormData, method: 'POST' | 'PUT' = 'POST'): Promise<T> {
  return send<T>(url, { method, body: form, headers: csrfToken ? { 'x-csrf-token': csrfToken } : {} }, false);
}

/** A file from the API. Failures throw like any other call, so a problem body is never saved as the file. */
async function blob(url: string): Promise<{ blob: Blob; fileName: string | null; excluded: number }> {
  setInflight(inflight + 1);
  try {
    let res: Response;
    try {
      res = await fetch(url, { credentials: 'same-origin' });
    } catch {
      throw new ApiError({ type: 'about:blank', title: 'Cannot reach the server. Check your connection and try again.', status: 0, code: 'network_error' });
    }
    if (!res.ok) {
      if (res.status === 401) window.dispatchEvent(new Event('hrms:unauthorized'));
      throw toError(res, await res.text());
    }
    const name = /filename="?([^";]+)"?/i.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? null;
    // How many people an export left out because they are above the reader's salary level.
    const excluded = Number(res.headers.get('x-excluded-subjects') ?? 0) || 0;
    return { blob: await res.blob(), fileName: name, excluded };
  } finally {
    setInflight(inflight - 1);
  }
}

export const api = {
  blob,
  upload: <T = unknown>(url: string, form: FormData, method?: 'POST' | 'PUT') => upload<T>(url, form, method),
  get: <T = unknown>(url: string) => request<T>('GET', url),
  post: <T = unknown>(url: string, body: unknown = {}) => request<T>('POST', url, body),
  put: <T = unknown>(url: string, body: unknown = {}) => request<T>('PUT', url, body),
  patch: <T = unknown>(url: string, body: unknown = {}) => request<T>('PATCH', url, body),
  del: <T = unknown>(url: string) => request<T>('DELETE', url),
};

export const qs = (o: Record<string, unknown>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export interface Paged<T> { items: T[]; page: number; pageSize: number; total: number }

/** A feature that is on, but missing something only an administrator can supply. */
export const isNotConfigured = (e: unknown): boolean => e instanceof ApiError && e.code === 'feature_not_configured';
const NOT_CONFIGURED = 'This feature is switched on but not set up yet. Ask your administrator to finish setting it up.';

/** Human message for any thrown value, with field errors appended. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (isNotConfigured(e)) return NOT_CONFIGURED;
    const fields = e.errors.map((f) => { const k = (f.path ?? f.field ?? '').replace(/^\w+\./, ''); return k ? `${k}: ${f.message}` : f.message; });
    return fields.length ? `${e.message}: ${fields.join('; ')}` : e.message;
  }
  return e instanceof Error && e.message ? e.message : 'Something went wrong';
}
