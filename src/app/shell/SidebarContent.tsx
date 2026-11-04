import { NavLink } from 'react-router-dom';
import { Download, LogOut, Settings2 } from 'lucide-react';
import { useAuth } from '../../auth';
import { Avatar } from '../../components/Avatar';
import { Badge } from '../../components/Badge';
import { Button, ButtonLink } from '../../components/Button';
import { Select } from '../../components/Select';
import { useInstallPrompt } from '../../pwa/install';
import { environmentLabel, runtimeEnv } from '../../runtime/env';
import { VIEW_LABEL, type ViewId } from '../registry';
import { useNavigationModel } from '../useViewer';
import { BrandMark } from './BrandMark';
import { SupportLine } from './SupportLine';

const ENV = runtimeEnv();
const ENV_LABEL = environmentLabel(ENV);

/** Brand, role switcher, task navigation and the user's own controls: the desktop rail and the phone drawer. */
export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { config, me, logout } = useAuth();
  const { views, view, setView, groups } = useNavigationModel();
  const install = useInstallPrompt();
  if (!config || !me) return null;
  return (
    <div className="side">
      <div className="side__brand">
        <BrandMark cfg={config} />
        <span className="side__brand-name">{config.brand.productName}</span>
        {ENV_LABEL && <Badge tone="warn" title={`Version ${ENV.version}`}>{ENV_LABEL}</Badge>}
      </div>
      {views.length > 1 && (
        <div className="side__switch">
          <Select label="Switch view" hideLabel value={view} onChange={(e) => setView(e.target.value as ViewId)} options={views.map((v) => ({ value: v, label: VIEW_LABEL[v] }))} />
        </div>
      )}
      <nav className="side__nav" aria-label="Main navigation">
        {groups.map((g) => (
          <div key={g.title} className="side__group">
            {g.title !== 'Home' && <div className="side__group-title">{g.title}</div>}
            <ul className="list-plain">
              {g.items.map((i) => (
                <li key={i.id}>
                  <NavLink to={i.path} end={i.path === '/'} className="side__link" onClick={onNavigate}>
                    <i.icon aria-hidden="true" /><span>{i.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="side__foot">
        <div className="side__user">
          <Avatar name={me.user.displayName} size="sm" />
          <div className="grow">
            <div className="side__user-name">{me.user.displayName}</div>
            <div className="side__user-role">{me.roles.map((r) => r.name).join(', ')}</div>
          </div>
        </div>
        <div className="cluster">
          <ButtonLink to="/account" size="sm" variant="ghost" icon={<Settings2 aria-hidden="true" />} onClick={onNavigate}>Account</ButtonLink>
          <Button size="sm" variant="ghost" icon={<LogOut aria-hidden="true" />} onClick={() => void logout()}>Sign out</Button>
          {install.available && <Button size="sm" variant="ghost" icon={<Download aria-hidden="true" />} onClick={() => void install.prompt()}>Install app</Button>}
        </div>
        <SupportLine cfg={config} />
      </div>
    </div>
  );
}
