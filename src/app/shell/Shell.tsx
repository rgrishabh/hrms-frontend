import { Suspense, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useIsFetching } from '@tanstack/react-query';
import { NavLink, useLocation } from 'react-router-dom';
import { Bell, Menu, Search, WifiOff } from 'lucide-react';
import { inflightStore } from '../../api';
import { useAuth } from '../../auth';
import { Button } from '../../components/Button';
import { Drawer } from '../../components/Drawer';
import { MOBILE_QUERY, useMediaQuery } from '../../components/hooks';
import { SkeletonPage } from '../../components/Skeleton';
import { INFLIGHT_ATTR, MAIN_TEST_ID } from '../../contract';
import { useUnreadCount } from '../../features/notifications';
import { documentTitle } from '../../lib/brand';
import { useOnline } from '../../pwa/online';
import { ErrorBoundary } from '../ErrorBoundary';
import { bottomNav } from '../registry';
import { useViewer } from '../useViewer';
import { BrandMark } from './BrandMark';
import { Breadcrumbs, matchRoute } from './Breadcrumbs';
import { CommandPalette } from './CommandPalette';
import { NotificationCentre } from './NotificationCentre';
import { SidebarContent } from './SidebarContent';
import './Shell.css';

export function Shell({ children }: { children: ReactNode }) {
  const { config } = useAuth();
  const mobile = useMediaQuery(MOBILE_QUERY);
  const [drawer, setDrawer] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [palette, setPalette] = useState(false);
  const { pathname } = useLocation();
  const unread = useUnreadCount();
  const online = useOnline();
  // Requests on the wire, plus queries between retries: a page waiting to retry has not settled.
  const inflight = useSyncExternalStore(inflightStore.subscribe, inflightStore.get) + useIsFetching();
  const main = useRef<HTMLElement>(null);
  const firstRender = useRef(true);

  // Moving to a new page: fresh title, focus at the page's start, drawer closed.
  useEffect(() => {
    setDrawer(false);
    if (config) {
      const route = matchRoute(pathname);
      document.title = documentTitle(config, route ? route.labelFor?.(config.features) ?? route.label : undefined);
    }
    if (firstRender.current) { firstRender.current = false; return; }
    main.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [pathname, config]);

  if (!config) return null;
  const unreadLabel = unread ? `Notifications, ${unread} unread` : 'Notifications';

  return (
    <div className="shell">
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); main.current?.focus(); }}>Skip to content</a>
      {!mobile && <aside className="shell__rail"><SidebarContent /></aside>}
      {mobile && drawer && (
        <Drawer title={config.brand.productName} side="left" size="sm" onClose={() => setDrawer(false)} className="shell__drawer">
          <SidebarContent onNavigate={() => setDrawer(false)} />
        </Drawer>
      )}
      <div className="shell__body">
        <header className="topbar">
          {mobile && <Button variant="ghost" iconOnly aria-label="Open menu" aria-expanded={drawer} icon={<Menu aria-hidden="true" />} onClick={() => setDrawer(true)} />}
          {mobile ? <span className="topbar__brand"><BrandMark cfg={config} /><span>{config.brand.productName}</span></span> : <Breadcrumbs />}
          <span className="topbar__spacer" />
          {mobile
            ? <Button variant="ghost" iconOnly aria-label="Search" icon={<Search aria-hidden="true" />} onClick={() => setPalette(true)} />
            : (
              <button type="button" className="topbar__search" onClick={() => setPalette(true)}>
                <Search aria-hidden="true" /><span>Search</span><kbd>{/Mac/i.test(navigator.platform) ? '⌘K' : 'Ctrl K'}</kbd>
              </button>
            )}
          <span className="topbar__bell">
            <Button variant="ghost" iconOnly aria-label={unreadLabel} icon={<Bell aria-hidden="true" />} onClick={() => setNotifications(true)} />
            {unread > 0 && <span className="topbar__count" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}
          </span>
        </header>
        {!online && <div className="offline-banner" role="status"><WifiOff aria-hidden="true" />You are offline. Showing what is already on this screen; changes cannot be saved until you reconnect.</div>}
        <main id="main" ref={main} tabIndex={-1} className="shell__main" data-testid={MAIN_TEST_ID} {...{ [INFLIGHT_ATTR]: String(inflight) }}>
          <ErrorBoundary resetKey={pathname}>
            <Suspense fallback={<SkeletonPage />}>{children}</Suspense>
          </ErrorBoundary>
        </main>
        {mobile && <BottomNav />}
      </div>
      {notifications && <NotificationCentre onClose={() => setNotifications(false)} />}
      <CommandPalette open={palette} onOpenChange={setPalette} />
    </div>
  );
}

function BottomNav() {
  const { config } = useAuth();
  const viewer = useViewer();
  const items = bottomNav(viewer, config?.features ?? {});
  if (items.length < 2) return null;
  return (
    <nav className="bottom-nav" aria-label="Quick navigation">
      {items.map((i) => (
        <NavLink key={i.id} to={i.path} end={i.path === '/'} className="bottom-nav__item">
          <i.icon aria-hidden="true" /><span>{i.short}</span>
        </NavLink>
      ))}
    </nav>
  );
}
