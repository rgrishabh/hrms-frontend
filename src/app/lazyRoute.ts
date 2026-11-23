import { lazy, type ComponentType } from 'react';

const RELOAD_KEY = 'hrms.chunk-reload';

/**
 * Loads a route's chunk on first render. After a deploy, an open tab can ask for a chunk the new
 * build no longer has; one reload picks up the new index. A second failure reaches the ErrorBoundary.
 */
export function lazyRoute(load: () => Promise<ComponentType>) {
  return lazy(async () => {
    try {
      const Component = await load();
      sessionStorage.removeItem(RELOAD_KEY);
      return { default: Component };
    } catch (e) {
      if (!navigator.onLine || sessionStorage.getItem(RELOAD_KEY)) throw e;
      sessionStorage.setItem(RELOAD_KEY, '1');
      window.location.reload();
      return new Promise<never>(() => undefined);
    }
  });
}
