import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, errorMessage, inflightStore, qs } from './api';

const respond = (status: number, body: string, type = 'application/problem+json') =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body, { status, headers: { 'content-type': type } }));

afterEach(() => vi.restoreAllMocks());

describe('api errors', () => {
  it('reads an RFC 7807 problem', async () => {
    respond(422, JSON.stringify({ type: 'https://errors/validation', title: 'Invalid', status: 422, detail: 'Fix the fields', instance: '/x', code: 'validation', errors: [{ path: 'employee.firstName', message: 'Required' }] }));
    const e = await api.get('/x').catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    const err = e as ApiError;
    expect([err.status, err.code, err.message]).toEqual([422, 'validation', 'Fix the fields']);
    expect(err.fieldErrors()).toEqual({ firstName: 'Required' });
    expect(errorMessage(err)).toBe('Fix the fields: firstName: Required');
  });

  it('falls back to the title when there is no detail', async () => {
    respond(403, JSON.stringify({ type: 'about:blank', title: 'Forbidden', status: 403 }));
    expect(await api.get('/x').catch((x: Error) => x.message)).toBe('Forbidden');
  });

  it('keeps extension members for callers that need them', async () => {
    respond(409, JSON.stringify({ type: 'about:blank', title: 'Duplicate', status: 409, code: 'conflict', confirmable: true, duplicates: [{ id: '1' }] }));
    const err = await api.post('/x').catch((x: ApiError) => x) as ApiError;
    expect(err.problem['duplicates']).toEqual([{ id: '1' }]);
    expect(err.problem['confirmable']).toBe(true);
  });

  it('survives a proxy HTML error page', async () => {
    respond(502, '<html>Bad gateway</html>', 'text/html');
    const err = await api.get('/x').catch((x: ApiError) => x) as ApiError;
    expect(err.status).toBe(502);
    expect(err.message).toBe('The service is temporarily unavailable');
  });

  it('does not treat a legacy { error } body as a message', async () => {
    respond(500, JSON.stringify({ error: { message: 'old' } }), 'application/json');
    expect(await api.get('/x').catch((x: Error) => x.message)).toBe('Something went wrong on our side');
  });

  it('reports a network failure as a status 0 problem', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const err = await api.get('/x').catch((x: ApiError) => x) as ApiError;
    expect([err.status, err.code]).toEqual([0, 'network_error']);
  });

  it.each([['get'], ['upload']] as const)('signals a 401 from %s', async (kind) => {
    respond(401, JSON.stringify({ type: 'about:blank', title: 'Unauthorized', status: 401 }));
    const seen = vi.fn();
    window.addEventListener('hrms:unauthorized', seen);
    await (kind === 'get' ? api.get('/x') : api.upload('/x', new FormData())).catch(() => undefined);
    window.removeEventListener('hrms:unauthorized', seen);
    expect(seen).toHaveBeenCalledOnce();
  });

  it('does not signal a 401 from the login call itself', async () => {
    respond(401, JSON.stringify({ type: 'about:blank', title: 'Wrong password', status: 401 }));
    const seen = vi.fn();
    window.addEventListener('hrms:unauthorized', seen);
    await api.post('/api/v1/auth/login').catch(() => undefined);
    window.removeEventListener('hrms:unauthorized', seen);
    expect(seen).not.toHaveBeenCalled();
  });
});

describe('in-flight tracking', () => {
  it('counts up during a request and returns to zero, including on failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('x'));
    const p = api.get('/x').catch(() => undefined);
    expect(inflightStore.get()).toBe(1);
    await p;
    expect(inflightStore.get()).toBe(0);
  });
});

describe('qs', () => {
  it('drops empty values', () => { expect(qs({ a: 1, b: '', c: null, d: undefined, e: false })).toBe('?a=1&e=false'); });
});
