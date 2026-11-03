import { describe, it, expect, beforeEach } from 'vitest';
import { environmentLabel, runtimeEnv } from './env';

describe('runtime env', () => {
  beforeEach(() => { (globalThis as { window?: unknown }).window = {}; });
  it('defaults when env.js is missing', () => {
    expect(runtimeEnv()).toMatchObject({ environment: 'local', version: 'dev' });
  });
  it('reads values injected by the container', () => {
    (globalThis as { window: Window }).window.__HRMS_ENV__ = { environment: 'dev', version: 'sha-abc1234' };
    expect(runtimeEnv()).toMatchObject({ environment: 'dev', version: 'sha-abc1234' });
  });
  it('labels only non-production environments', () => {
    expect(environmentLabel({ environment: 'production', version: '1' })).toBeNull();
    expect(environmentLabel({ environment: 'prod', version: '1' })).toBeNull();
    expect(environmentLabel({ environment: 'dev', version: '1' })).toBe('DEV');
  });
});
