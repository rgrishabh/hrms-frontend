import { useMemo } from 'react';
import { Route, Routes } from 'react-router-dom';
import { useAuth } from '../auth';
import { Forbidden, NotFound } from './NotFound';
import { canEnter, LAZY_COMPONENTS, ROUTES, routeExists, type RouteDef } from './registry';
import { useViewer } from './useViewer';

function Guarded({ route }: { route: RouteDef }) {
  const viewer = useViewer();
  const Page = LAZY_COMPONENTS.get(route.id)!;
  return canEnter(route, viewer) ? <Page /> : <Forbidden />;
}

/**
 * One route per registry entry whose flag is on. A switched-off feature has no route at all, so its
 * URL is an ordinary 404 and its chunk is never requested.
 */
export function AppRoutes() {
  const { config } = useAuth();
  const features = config?.features;
  const routes = useMemo(() => ROUTES.filter((r) => routeExists(r, features ?? {})), [features]);
  return (
    <Routes>
      {routes.map((r) => <Route key={r.id} path={r.splat ? `${r.path}/*` : r.path} element={<Guarded route={r} />} />)}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
