import { afterEach, describe, expect, it, vi } from 'vitest';
import { disablePush, enablePush } from './push';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function stubBrowser(existing: PushSubscription | null) {
  const sub = { endpoint: 'https://push.example/1', toJSON: () => ({ endpoint: 'https://push.example/1', expirationTime: null, keys: { p256dh: 'k', auth: 'a' } }), unsubscribe: vi.fn(async () => true) } as unknown as PushSubscription;
  const reg = { pushManager: { subscribe: vi.fn(async () => sub), getSubscription: vi.fn(async () => existing ?? sub) } };
  vi.stubGlobal('Notification', { requestPermission: async () => 'granted' });
  vi.stubGlobal('PushManager', class {});
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: Promise.resolve(reg), getRegistration: async () => reg } });
  return { reg, sub };
}

describe('web push uses the real routes', () => {
  it('subscribes with the key from public-key, and sends only the endpoint and keys', async () => {
    const { reg } = stubBrowser(null);
    const f = vi.spyOn(globalThis, 'fetch').mockImplementation(async (u) => new Response(JSON.stringify(String(u).endsWith('/public-key') ? { publicKey: 'BAAA' } : { ok: true }), { headers: { 'content-type': 'application/json' } }));
    await enablePush();
    expect(String(f.mock.calls[0]![0])).toBe('/api/v1/notifications/push/public-key');
    expect(reg.pushManager.subscribe).toHaveBeenCalledOnce();
    expect(String(f.mock.calls[1]![0])).toBe('/api/v1/notifications/push/subscribe');
    expect(JSON.parse(String((f.mock.calls[1]![1] as RequestInit).body))).toEqual({ endpoint: 'https://push.example/1', keys: { p256dh: 'k', auth: 'a' } });
  });
  it('tells the server first when turning off', async () => {
    const { sub } = stubBrowser(null);
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { headers: { 'content-type': 'application/json' } }));
    await disablePush();
    expect(String(f.mock.calls[0]![0])).toBe('/api/v1/notifications/push/unsubscribe');
    expect(sub.unsubscribe).toHaveBeenCalledOnce();
  });
});
