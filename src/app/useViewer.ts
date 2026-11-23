import { useMemo, useSyncExternalStore } from 'react';
import { useAuth } from '../auth';
import { navFor, viewsFor, type NavGroup, type ViewId, type Viewer } from './registry';

const KEY = 'hrms.view';
const listeners = new Set<() => void>();
const readStored = () => localStorage.getItem(KEY) as ViewId | null;

function writeStored(view: ViewId) {
  localStorage.setItem(KEY, view);
  listeners.forEach((l) => l());
}

export function useViewer(): Viewer {
  const { me } = useAuth();
  return useMemo(() => ({ permissions: new Set(me?.permissions ?? []), hasEmployee: !!me?.user.employeeId }), [me]);
}

export interface Navigation { views: ViewId[]; view: ViewId; setView: (v: ViewId) => void; groups: NavGroup[] }

/** The views this person has, the chosen one, and its navigation. A stale choice falls back safely. */
export function useNavigationModel(): Navigation {
  const { config, me } = useAuth();
  const viewer = useViewer();
  const stored = useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, readStored);
  const mode = config?.mode ?? 'multi';
  const features = config?.features;
  const server = me?.views;
  return useMemo(() => {
    const views = viewsFor(viewer, mode, server?.map((x) => x.key));
    const view = stored && views.includes(stored) ? stored : views[0]!;
    return { views, view, setView: writeStored, groups: navFor(view, viewer, features ?? {}) };
  }, [viewer, mode, features, stored, server]);
}
