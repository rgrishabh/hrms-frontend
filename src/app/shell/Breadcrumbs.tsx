import { Link, matchPath, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth';
import { routeById, ROUTES, type RouteDef } from '../registry';
import { useNavigationModel } from '../useViewer';

export const matchRoute = (pathname: string): RouteDef | undefined =>
  ROUTES.find((r) => r.path !== '/' && matchPath({ path: r.splat ? `${r.path}/*` : r.path, end: true }, pathname)) ?? (pathname === '/' ? routeById('dashboard') : undefined);

/** Where you are: group, then page. Shown on desktop; a phone has the page heading and bottom nav. */
export function Breadcrumbs() {
  const { config } = useAuth();
  const { pathname } = useLocation();
  const { groups } = useNavigationModel();
  const route = matchRoute(pathname);
  if (!route || route.id === 'dashboard') return <span />;
  const parent = route.parent ? routeById(route.parent) : undefined;
  const anchor = parent ?? route;
  const group = groups.find((g) => g.items.some((i) => i.id === anchor.id))?.title;
  const label = (r: RouteDef) => (config && r.labelFor?.(config.features)) || r.label;
  return (
    <nav aria-label="Breadcrumb" className="crumbs">
      <ol className="list-plain crumbs__list">
        {group && group !== 'Home' && <li className="crumbs__group">{group}</li>}
        {parent && <li><Link to={parent.path}>{label(parent)}</Link></li>}
        <li aria-current="page">{parent ? 'Details' : label(route)}</li>
      </ol>
    </nav>
  );
}
