import { useQueryClient } from '@tanstack/react-query';
import { Package } from 'lucide-react';
import { api, errorMessage } from '../../api';
import { Alert } from '../../components/Alert';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { QueryState } from '../../components/QueryState';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { fmtDate, fmtDateOfInstant } from '../../format';
import { invalidateApi, useApiQuery } from '../../lib/query';
import { useAssetTerms } from './terms';
import { ASSETS_URL, type MyAsset } from './types';

const URL_MINE = `${ASSETS_URL}/mine`;
type Mine = { items: MyAsset[] };

export function MyAssets() {
  const toast = useToast();
  const client = useQueryClient();
  const terms = useAssetTerms();
  const query = useApiQuery<Mine>(URL_MINE);
  // Optimistic: confirming receipt is safe to repeat, and a failure puts the button back.
  const confirm = async (a: MyAsset) => {
    const key = ['api', URL_MINE];
    const before = client.getQueryData<Mine>(key);
    client.setQueryData<Mine>(key, (d) => d && { items: d.items.map((x) => (x.id === a.id ? { ...x, acknowledged_at: new Date().toISOString() } : x)) });
    try {
      await api.post(`${ASSETS_URL}/assignments/${a.id}/acknowledge`);
      toast('Receipt confirmed');
      await invalidateApi(URL_MINE, '/api/v1/dashboard');
    } catch (e) {
      client.setQueryData(key, before);
      toast(errorMessage(e), 'error');
    }
  };
  const columns: Column<MyAsset>[] = [
    { key: 'asset', header: 'Asset', card: 'title', cell: (x) => <><strong>{x.tag}</strong> {x.name}</> },
    { key: 'category', header: 'Category', card: 'subtitle', cell: (x) => terms.categoryLabel(x.category) },
    { key: 'serial', header: 'Serial no.', cell: (x) => x.serial_number ?? '—' },
    { key: 'issued', header: 'Issued', cell: (x) => fmtDate(x.issued_at) },
    { key: 'due', header: 'Due back', cell: (x) => fmtDate(x.due_back) },
    { key: 'condition', header: 'Condition at issue', cell: (x) => x.condition_out ?? '—' },
    { key: 'actions', header: 'Receipt', card: 'actions', cell: (x) => (x.acknowledged_at ? <Badge tone="ok">Received {fmtDateOfInstant(x.acknowledged_at)}</Badge> : <Button size="sm" variant="primary" onClick={() => void confirm(x)}>I received it</Button>) },
  ];
  return (
    <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<Package />} title="No assets are issued to you" />}>
      {(d) => {
        const pending = d.items.filter((x) => !x.acknowledged_at).length;
        return (
          <div className="stack-3">
            {pending > 0 && <Alert tone="warn">Confirm that you received {pending === 1 ? 'the item' : `${pending} items`} below. You are responsible for assets issued to you until they are returned.</Alert>}
            <Table label="My assets" columns={columns} rows={d.items} rowKey={(x) => x.id} />
          </div>
        );
      }}
    </QueryState>
  );
}
