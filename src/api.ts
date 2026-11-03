/** Thin API client. Session is an httpOnly cookie; CSRF token is held in memory only. */
let csrfToken = '';
export const setCsrf = (t: string) => { csrfToken = t; };

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: any) { super(message); }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET' && csrfToken) headers['x-csrf-token'] = csrfToken;
  const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin' });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const e = data?.error ?? {};
    if (res.status === 401 && !url.endsWith('/auth/login')) window.dispatchEvent(new Event('hrms:unauthorized'));
    throw new ApiError(res.status, e.code ?? 'error', e.message ?? `Request failed (${res.status})`, e.details);
  }
  return data as T;
}

/** multipart/form-data upload (browser sets the boundary); CSRF header included. */
async function upload<T>(url: string, form: FormData): Promise<T> {
  const res = await fetch(url, { method: 'POST', body: form, credentials: 'same-origin', headers: csrfToken ? { 'x-csrf-token': csrfToken } : {} });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) { const e = data?.error ?? {}; throw new ApiError(res.status, e.code ?? 'error', e.message ?? `Upload failed (${res.status})`, e.details); }
  return data as T;
}

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
