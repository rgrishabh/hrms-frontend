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

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly problem: Problem;
  readonly errors: ProblemFieldError[];

  constructor(problem: Problem) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiError';
    this.problem = problem;
    this.status = problem.status;
    this.code = problem.code ?? 'error';
    this.errors = Array.isArray(problem.errors) ? problem.errors : [];
  }

  /** Field errors by field name, for inline messages. Prefixes such as `employee.` are dropped. */
  fieldErrors(): Record<string, string> {
    const key = (e: ProblemFieldError) => (e.path ?? e.field ?? e.pointer ?? '').replace(/^\//, '').replace(/^\w+[./](?=.)/, '');
    return Object.fromEntries(this.errors.map((e) => [key(e), e.message]).filter(([k]) => k));
  }

  /**
   * Extra data an endpoint attaches, such as `duplicates`, read from RFC 7807 extension members.
   * Field errors when there are any, otherwise the problem itself. Used by unmigrated pages only.
   */
  get details(): any {
    return this.errors.length ? this.errors : this.problem;
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
      throw new ApiError(toProblem(res, text));
    }
    if (!text) return null as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError({ type: 'about:blank', title: GENERIC_TITLE[502]!, status: 502, code: 'bad_response' });
    }
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
function upload<T>(url: string, form: FormData): Promise<T> {
  return send<T>(url, { method: 'POST', body: form, headers: csrfToken ? { 'x-csrf-token': csrfToken } : {} }, false);
}

/* The `any` defaults serve unmigrated pages until the generated client lands; migrated pages always pass T. */
export const api = {
  upload: <T = any>(url: string, form: FormData) => upload<T>(url, form),
  get: <T = any>(url: string) => request<T>('GET', url),
  post: <T = any>(url: string, body: unknown = {}) => request<T>('POST', url, body),
  put: <T = any>(url: string, body: unknown = {}) => request<T>('PUT', url, body),
  patch: <T = any>(url: string, body: unknown = {}) => request<T>('PATCH', url, body),
  del: <T = any>(url: string) => request<T>('DELETE', url),
};

export const qs = (o: Record<string, unknown>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export interface Paged<T> { items: T[]; page: number; pageSize: number; total: number }

/** Human message for any thrown value, with field errors appended. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const fields = e.errors.map((f) => { const k = (f.path ?? f.field ?? '').replace(/^\w+\./, ''); return k ? `${k}: ${f.message}` : f.message; });
    return fields.length ? `${e.message}: ${fields.join('; ')}` : e.message;
  }
  return e instanceof Error && e.message ? e.message : 'Something went wrong';
}
