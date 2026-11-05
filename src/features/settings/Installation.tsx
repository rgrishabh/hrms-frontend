import { Alert } from '../../components/Alert';
import { Badge, StatusBadge } from '../../components/Badge';
import { Card } from '../../components/Card';
import { KeyValue } from '../../components/KeyValue';
import { QueryState } from '../../components/QueryState';
import { Table, type Column } from '../../components/Table';
import type { ApiResponse } from '../../lib/api-types';
import { useApiQuery } from '../../lib/query';

const CATEGORY_LABEL: Record<string, string> = { core_hr: 'Core HR', workforce: 'Workforce management', payroll_finance: 'Payroll & finance', talent: 'Talent', operations: 'Operations & compliance' };

type InstallationData = ApiResponse<'/api/v1/tenant/installation'>;
type Module = InstallationData['modules'][number];
type Domain = InstallationData['domains'][number];

const MODE_LABEL: Record<string, string> = { single: 'One person', single_hr: 'One HR person', multi: 'Multiple people' };

/** "MM-DD" as a day and month, in the viewer's language. */
function yearStart(value: string): string {
  const [month, day] = value.split('-').map(Number);
  if (!month || !day) return value;
  return new Date(Date.UTC(2000, month - 1, day)).toLocaleDateString(undefined, { month: 'long', day: 'numeric', timeZone: 'UTC' });
}

const domainColumns: Column<Domain>[] = [
  { key: 'host', header: 'Hostname', card: 'title', cell: (d) => <span className="cluster"><span className="mono">{d.hostname}</span>{d.is_primary && <Badge tone="info">Primary</Badge>}</span> },
  { key: 'status', header: 'Status', card: 'status', cell: (d) => <StatusBadge status={d.activation_status} /> },
];

const moduleColumns: Column<Module>[] = [
  {
    key: 'module', header: 'Module', card: 'title', cell: (m) => (
      <>
        <span className="cluster">{m.name}{m.core && <Badge tone="info">Core</Badge>}</span>
        <div className="table__cell-sub">{m.description}</div>
        {m.dependencies.length > 0 && <div className="table__cell-sub">Requires: {m.dependencies.join(', ')}</div>}
      </>
    ),
  },
  { key: 'release', header: 'Release', cell: (m) => (m.supported ? <Badge tone="ok">Available</Badge> : <Badge>Planned</Badge>) },
  { key: 'configured', header: 'Configured', cell: (m) => (m.configured ? 'Yes' : <Badge tone="warn">Incomplete</Badge>) },
  {
    key: 'state', header: 'State', cell: (m) => (m.usable
      ? <Badge tone="ok">Usable{m.operational === 'degraded' ? ' · degraded' : ''}</Badge>
      : <><Badge>Unavailable</Badge>{m.blockers.map((b) => <div key={b} className="table__cell-sub">{b}</div>)}</>),
  },
];

/** Read-only: everything here is set by the deployment, not in the app. */
export function Installation() {
  const query = useApiQuery<InstallationData>('/api/v1/tenant/installation');
  return (
    <QueryState query={query}>
      {(d) => {
        const categories = [...new Set(d.modules.map((m) => m.category))];
        const colours = [d.brand.primaryColor, d.brand.secondaryColor, d.brand.accentColor].filter((c): c is string => !!c);
        return (
          <div className="stack-4">
            <Alert>These settings belong to this installation's deployment configuration and can only be changed by your system operator, after which the application restarts. Business settings such as attendance policies are under the other sections.</Alert>
            <Card title="Branding">
              <div className="stack-3">
                <div className="cluster">
                  {d.brand.logoUrl ? <img src={d.brand.logoUrl} alt="Logo" className="brand-logo" /> : <span className="text-2">No logo configured</span>}
                  {colours.map((c) => (
                    <span key={c} className="cluster">
                      <svg className="brand-swatch" viewBox="0 0 22 22" aria-hidden="true"><rect width="22" height="22" rx="4" fill={c} /></svg>
                      <span className="mono">{c}</span>
                    </span>
                  ))}
                </div>
                <KeyValue items={[{ label: 'Product', value: d.product.name }, { label: 'Brand name', value: d.brand.name }, { label: 'Login message', value: d.brand.loginMessage }, { label: 'Support email', value: d.brand.supportEmail }, { label: 'Support phone', value: d.brand.supportPhone }, { label: 'Help link', value: d.brand.helpUrl }]} />
              </div>
            </Card>
            <Card title="Organization">
              <KeyValue items={[{ label: 'Legal name', value: d.brand.legalName }, { label: 'Country', value: d.brand.country }, { label: 'Currency', value: d.brand.currency }, { label: 'Default timezone', value: d.brand.timezone }, { label: 'Default date format', value: d.brand.dateFormat }, { label: 'Financial year starts', value: yearStart(d.brand.financialYearStart) }, { label: 'Language and region', value: d.brand.locale }, { label: 'Managed by', value: MODE_LABEL[d.mode] ?? d.mode }, { label: 'Two-factor', value: d.mfa.enforced ? 'Required' : d.mfa.available ? 'Available' : 'Off' }]} />
            </Card>
            <Card title="Domains" flush><Table label="Domains" columns={domainColumns} rows={d.domains} rowKey={(x) => x.hostname} /></Card>
            {categories.map((c) => {
              const title = CATEGORY_LABEL[c] ?? c;
              return <Card key={c} title={title} flush><Table label={`${title} modules`} columns={moduleColumns} rows={d.modules.filter((m) => m.category === c)} rowKey={(m) => m.key} /></Card>;
            })}
          </div>
        );
      }}
    </QueryState>
  );
}
