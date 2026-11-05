import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../auth';
import { Badge } from '../../components/Badge';
import { Select } from '../../components/Select';
import { environmentLabel, runtimeEnv } from '../../runtime/env';
import { VIEW_LABEL, type ViewId } from '../registry';
import { useNavigationModel } from '../useViewer';
import { BrandMark } from './BrandMark';

const ENV = runtimeEnv();
const ENV_LABEL = environmentLabel(ENV);

/**
 * Brand, role switcher and task navigation: the desktop rail and the phone drawer. The person's own controls are in UserMenu, top right.
 * Collapsed, the rail keeps the icons and the toggle; link names stay for screen readers and show as tooltips.
 */
export function SidebarContent({ onNavigate, collapsed = false, toggle }: { onNavigate?: () => void; collapsed?: boolean; toggle?: ReactNode }) {
  const { config, me } = useAuth();
  const { views, view, setView, groups } = useNavigationModel();
  if (!config || !me) return null;
  return (
    <div className={`side${collapsed ? ' side--collapsed' : ''}`}>
      <div className="side__brand">
        {toggle}
        {!collapsed && (
          <>
            <BrandMark cfg={config} />
            <span className="side__brand-name">{config.brand.productName}</span>
            {ENV_LABEL && <Badge tone="warn" title={`Version ${ENV.version}`}>{ENV_LABEL}</Badge>}
          </>
        )}
      </div>
      {!collapsed && views.length > 1 && (
        <div className="side__switch">
          <Select label="Switch view" hideLabel value={view} onChange={(e) => setView(e.target.value as ViewId)} options={views.map((v) => ({ value: v, label: me?.views.find((x) => (x.key === 'owner' ? 'super' : x.key) === v)?.label ?? VIEW_LABEL[v] }))} />
        </div>
      )}
      <nav className="side__nav" aria-label="Main navigation">
        {groups.map((g) => (
          <div key={g.title} className="side__group">
            {g.title !== 'Home' && !collapsed && <div className="side__group-title">{g.title}</div>}
            <ul className="list-plain">
              {g.items.map((i) => (
                <li key={i.id}>
                  <NavLink to={i.path} end={i.path === '/'} className="side__link" title={collapsed ? i.label : undefined} onClick={onNavigate}>
                    <i.icon aria-hidden="true" /><span>{i.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}
