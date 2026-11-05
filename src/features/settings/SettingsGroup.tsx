import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { api, errorMessage, qs } from '../../api';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { InlineError } from '../../components/ErrorState';
import { FilterBar } from '../../components/FilterBar';
import { Checkbox, Input } from '../../components/Input';
import { QueryState } from '../../components/QueryState';
import { Select } from '../../components/Select';
import { useToast } from '../../components/Toast';
import { useSubmit } from '../../components/useSubmit';
import type { ApiItem, ApiResponse } from '../../lib/api-types';
import { invalidateApi, useApiQuery } from '../../lib/query';
import { useOrg } from '../org/useOrg';

const SETTINGS_URL = '/api/v1/tenant/settings';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TIMEZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'UTC'];
const SOURCE_LABEL: Record<string, string> = { default: 'Default', deployment: 'Installation default', platform: 'Installation default', tenant: 'Organization setting', branch: 'Branch override', deployment_ceiling: 'Capped by installation limit' };

type Setting = ApiItem<'/api/v1/tenant/settings'>;
type Value = Setting['effective'];

function ValueEditor({ s, value, error, onChange }: { s: Setting; value: Value; error?: string; onChange: (v: Value) => void }) {
  switch (s.control) {
    case 'boolean': return <Checkbox label={value ? 'Enabled' : 'Disabled'} aria-label={`${s.label}: ${value ? 'Enabled' : 'Disabled'}`} checked={!!value} onChange={(e) => onChange(e.target.checked)} />;
    case 'number': return <Input label={s.label} hideLabel type="number" inputMode="numeric" error={error} value={value === null ? '' : String(value)} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />;
    case 'select': return <Select label={s.label} hideLabel error={error} value={String(value ?? '')} options={s.options ?? []} onChange={(e) => onChange(e.target.value)} />;
    case 'timezone': return <Select label={s.label} hideLabel error={error} value={String(value ?? '')} options={[...new Set([String(value ?? ''), ...TIMEZONES])].map((t) => ({ value: t, label: t }))} onChange={(e) => onChange(e.target.value)} />;
    case 'weekdays': {
      const days = Array.isArray(value) ? value : [];
      return (
        <div className="weekday-picker" role="group" aria-label={s.label}>
          {WEEKDAYS.map((d, i) => {
            const on = days.includes(i);
            return <button type="button" key={d} className="weekday-picker__day" aria-pressed={on} onClick={() => onChange(on ? days.filter((x) => x !== i) : [...days, i])}>{d}</button>;
          })}
        </div>
      );
    }
    default: return <Input label={s.label} hideLabel error={error} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />;
  }
}

function display(v: Value, s: Setting): string {
  if (v === null || v === '') return s.options?.find((o) => o.value === '')?.label ?? 'Not set';
  if (s.control === 'weekdays') return (v as number[]).map((i) => WEEKDAYS[i]).join(', ') || 'None';
  if (s.control === 'boolean') return v ? 'Enabled' : 'Disabled';
  if (s.control === 'select') return s.options?.find((o) => o.value === v)?.label ?? String(v);
  return String(v);
}

function SettingRow({ s, branchId }: { s: Setting; branchId: string }) {
  const toast = useToast();
  const scope = branchId ? 'branch' : 'tenant';
  const own = scope === 'branch' ? s.branchValue : s.tenantValue;
  const [draft, setDraft] = useState<Value>(s.effective);
  const dirty = JSON.stringify(draft) !== JSON.stringify(s.effective);
  const refresh = () => invalidateApi(SETTINGS_URL);
  const url = `${SETTINGS_URL}/${s.key}`;
  const undo = async () => {
    try {
      if (own === null) await api.del(`${url}${qs({ scope, branchId })}`);
      else await api.put(url, { value: own, scope, branchId: branchId || undefined });
      toast(`${s.label} restored`);
    } catch (x) { toast(errorMessage(x), 'error'); }
    await refresh();
  };
  const form = useSubmit(async () => {
    await api.put(url, { value: draft, scope, branchId: branchId || undefined, expectedVersion: scope === 'tenant' ? s.version ?? undefined : undefined });
    toast(`${s.label} saved`, 'ok', { label: 'Undo', onClick: () => void undo() });
    await refresh();
  });
  const reset = useSubmit(async () => {
    await api.del(`${url}${qs({ scope, branchId })}`);
    toast(`${s.label} now inherits`);
    await refresh();
  });
  const branchOnlyOrg = scope === 'branch' && !s.scopes.includes('branch');
  return (
    <div className="setting-row" data-record>
      <div className="stack-1">
        <div className="setting-row__label">{s.label}</div>
        <p className="text-sm text-2">{s.description}</p>
        <div className="cluster">
          <Badge tone={s.source === 'branch' || s.source === 'tenant' ? 'info' : 'neutral'}>{SOURCE_LABEL[s.source] ?? s.source}</Badge>
          {s.source !== 'default' && <span className="text-xs text-2">Default: {display(s.defaultValue, s)}</span>}
          {scope === 'branch' && s.tenantValue !== null && <span className="text-xs text-2">Organization: {display(s.tenantValue, s)}</span>}
        </div>
      </div>
      <div className="stack-2">
        {branchOnlyOrg && <p className="text-2">Set at organization level only: {display(s.effective, s)}</p>}
        {!branchOnlyOrg && !s.editable && <p>{display(s.effective, s)} <span className="text-2">(read only)</span></p>}
        {!branchOnlyOrg && s.editable && (
          <form className="stack-2" onSubmit={form.submit}>
            <ValueEditor s={s} value={draft} error={form.errors['value']} onChange={setDraft} />
            <div className="cluster">
              <Button type="submit" size="sm" variant="primary" disabled={!dirty} loading={form.busy}>Save</Button>
              {dirty && <Button size="sm" onClick={() => { setDraft(s.effective); form.setError(null); }}>Cancel</Button>}
              {own !== null && !dirty && <Button size="sm" loading={reset.busy} onClick={() => void reset.submit()}>Reset to inherited</Button>}
            </div>
          </form>
        )}
        <InlineError error={form.error ?? reset.error} />
      </div>
    </div>
  );
}

export function SettingsGroup({ group }: { group: string }) {
  const [branchId, setBranchId] = useState('');
  const [search, setSearch] = useState('');
  const org = useOrg();
  const query = useApiQuery<ApiResponse<'/api/v1/tenant/settings'>>(`${SETTINGS_URL}${qs({ branchId })}`, { placeholderData: (p) => p });
  const inGroup = (query.data?.items ?? []).filter((s) => s.group === group);
  return (
    <div className="stack-3">
      <FilterBar search={{ label: 'Search settings', placeholder: 'Search settings', value: search, onChange: setSearch }} activeCount={search ? 1 : 0} onClear={() => setSearch('')}>
        {inGroup.some((s) => s.scopes.includes('branch')) && (
          <Select label="Editing level" hideLabel value={branchId} placeholder="Organization level" options={(org.data?.branches ?? []).map((b) => ({ value: b.id, label: `Branch override: ${b.name}` }))} onChange={(e) => setBranchId(e.target.value)} />
        )}
      </FilterBar>
      <QueryState query={query}>
        {(d) => {
          const needle = search.toLowerCase();
          const items = d.items.filter((s) => s.group === group && `${s.label} ${s.description}`.toLowerCase().includes(needle));
          if (!items.length) return <EmptyState icon={<SlidersHorizontal />} title={search ? 'No settings match.' : 'Nothing to set here.'} description={search ? undefined : 'Settings of modules that are off do not appear.'} />;
          return <div className="setting-list">{items.map((s) => <SettingRow key={`${s.key}:${branchId}:${s.version}:${JSON.stringify(s.effective)}`} s={s} branchId={branchId} />)}</div>;
        }}
      </QueryState>
    </div>
  );
}
