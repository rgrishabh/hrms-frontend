import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Landmark } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Alert } from '../components/Alert';
import { Badge, StatusBadge } from '../components/Badge';
import { Button } from '../components/Button';
import { DownloadButton } from '../components/DownloadButton';
import { EmptyState } from '../components/EmptyState';
import { InlineError } from '../components/ErrorState';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { Money } from '../components/Money';
import { RevealToggle } from '../components/RevealToggle';
import { isMaskedField, useRevealable, type Maskable } from '../lib/masking';
import { PageHeader } from '../components/PageHeader';
import { QueryState } from '../components/QueryState';
import { Table, type Column } from '../components/Table';
import { TabPanel, Tabs, useTabParam, type TabItem } from '../components/Tabs';
import { useToast } from '../components/Toast';
import { useSubmit } from '../components/useSubmit';
import { fmtDate, fmtDateTime } from '../format';
import { invalidateApi, useApiQuery } from '../lib/query';

type Tab = 'exports' | 'ledgers';
type SourceKind = 'payroll-runs' | 'reimbursement-batches';

interface LastExport { at: string; format: string; by: string }
interface RunSource extends Maskable { id: string; period: string; kind: string; status: string; totals: { gross?: number | string } | null; legal_entity: string; last_export: LastExport | null }
interface BatchSource { id: string; status: string; total: number | string; claim_count: number; created_at: string; payment_reference: string | null; last_export: LastExport | null }
interface Sources { runs: RunSource[]; batches: BatchSource[] }
interface JournalEntry { key: string; label: string; ledger: string | null; debit: number | string; credit: number | string }
interface Journal { number: string; date: string; narration: string; missing: string[]; balanced: boolean; total: number | string; entries: JournalEntry[] }
interface LedgerMap { items: { map_key: string; ledger_name: string }[]; heads: { key: string; label: string }[] }
interface Preview { kind: SourceKind; id: string; title: string }

const SOURCES_URL = '/api/v1/accounting/sources';
const MAP_URL = '/api/v1/accounting/ledger-map';

export function Accounting() {
  const { can } = useAuth();
  const tabs: TabItem<Tab>[] = [];
  if (can('accounting.export')) tabs.push({ key: 'exports', label: 'Journals' });
  if (can('accounting.configure') || can('accounting.export')) tabs.push({ key: 'ledgers', label: 'Ledger map' });
  const [tab, setTab] = useTabParam<Tab>(tabs.length ? tabs.map((t) => t.key) : ['ledgers']);
  return (
    <div className="stack-4">
      <PageHeader title="Accounting" description="Payroll and reimbursement journals for your accounts, mapped to your ledger names. Download as CSV or as Tally XML to import." />
      {!tabs.length && <EmptyState icon={<Landmark />} title="You do not have access to accounting exports" />}
      {tabs.length > 1 && <Tabs label="Accounting" idBase="accounting" tabs={tabs} value={tab} onChange={setTab} />}
      {tabs.length > 0 && (
        <TabPanel idBase="accounting" tab={tab}>
          {tab === 'exports' ? <Journals /> : <Ledgers />}
        </TabPanel>
      )}
    </div>
  );
}

const lastExport = (x: { last_export: LastExport | null }) => (x.last_export
  ? <span className="text-sm text-2">{x.last_export.format === 'csv' ? 'CSV' : 'Tally'} · {fmtDateTime(x.last_export.at)} · {x.last_export.by}</span>
  : <span className="text-sm text-2">Not exported</span>);

function Journals() {
  const { hasFeature } = useAuth();
  const { query: sources, revealed, setRevealed } = useRevealable<Sources>(SOURCES_URL);
  const [preview, setPreview] = useState<Preview | null>(null);
  const runColumns: Column<RunSource>[] = [
    { key: 'month', header: 'Month', card: 'title', cell: (r) => <span className="tnum">{r.period}{r.kind === 'fnf' ? ' · full and final' : ''}</span> },
    { key: 'entity', header: 'Entity', card: 'subtitle', cell: (r) => r.legal_entity },
    { key: 'gross', header: 'Gross', align: 'right', cell: (r) => <Money value={r.totals?.gross} masked={isMaskedField(r, 'totals')} /> },
    { key: 'status', header: 'Status', card: 'status', cell: (r) => <StatusBadge status={r.status} /> },
    { key: 'last', header: 'Last export', cell: lastExport },
    { key: 'actions', header: 'Actions', card: 'actions', cell: (r) => <div className="table__actions"><Button size="sm" variant="primary" aria-label={`Journal for payroll ${r.period}, ${r.legal_entity}`} onClick={() => setPreview({ kind: 'payroll-runs', id: r.id, title: `Payroll ${r.period}${r.kind === 'fnf' ? ' (F&F)' : ''}` })}>Journal</Button></div> },
  ];
  const batchColumns: Column<BatchSource>[] = [
    { key: 'prepared', header: 'Prepared', card: 'title', cell: (b) => fmtDateTime(b.created_at) },
    { key: 'claims', header: 'Claims', align: 'right', cell: (b) => b.claim_count },
    { key: 'total', header: 'Total', align: 'right', cell: (b) => <Money value={b.total} /> },
    { key: 'status', header: 'Status', card: 'status', cell: (b) => <StatusBadge status={b.status} /> },
    { key: 'reference', header: 'Payment reference', cell: (b) => (b.payment_reference ? <span className="mono">{b.payment_reference}</span> : '—') },
    { key: 'last', header: 'Last export', cell: lastExport },
    { key: 'actions', header: 'Actions', card: 'actions', cell: (b) => <div className="table__actions"><Button size="sm" variant="primary" aria-label={`Journal for reimbursements prepared ${fmtDateTime(b.created_at)}`} onClick={() => setPreview({ kind: 'reimbursement-batches', id: b.id, title: `Reimbursements ${fmtDateTime(b.created_at)}` })}>Journal</Button></div> },
  ];
  return (
    <QueryState query={sources}>
      {(d) => (
        <div className="stack-4">
          <section className="stack-2">
            <div className="cluster-between"><h2>Payroll runs</h2><RevealToggle revealed={revealed} loading={sources.isFetching} onChange={setRevealed} /></div>
            {d.runs.length ? <Table label="Payroll runs" columns={runColumns} rows={d.runs} rowKey={(r) => r.id} /> : <EmptyState compact title="No finalized payroll runs yet" />}
          </section>
          {hasFeature('FEATURE_EXPENSE_CLAIMS') && (
            <section className="stack-2">
              <h2>Reimbursement batches</h2>
              {d.batches.length ? <Table label="Reimbursement batches" columns={batchColumns} rows={d.batches} rowKey={(b) => b.id} /> : <EmptyState compact title="No approved reimbursement batches" />}
            </section>
          )}
          {preview && <JournalPreview {...preview} onClose={() => setPreview(null)} />}
        </div>
      )}
    </QueryState>
  );
}

const entryColumns: Column<JournalEntry>[] = [
  { key: 'ledger', header: 'Ledger', card: 'title', cell: (e) => e.ledger ?? <Badge tone="danger">Not mapped</Badge> },
  { key: 'head', header: 'Head', card: 'subtitle', cell: (e) => <>{e.label}<div className="table__cell-sub mono">{e.key}</div></> },
  { key: 'debit', header: 'Debit', align: 'right', cell: (e) => (Number(e.debit) ? <Money value={e.debit} /> : '') },
  { key: 'credit', header: 'Credit', align: 'right', cell: (e) => (Number(e.credit) ? <Money value={e.credit} /> : '') },
];

function JournalPreview({ kind, id, title, onClose }: Preview & { onClose: () => void }) {
  const { can } = useAuth();
  const journal = useApiQuery<Journal>(`/api/v1/accounting/${kind}/${id}/journal`, { staleTime: 0 });
  const url = (format: string) => `/api/v1/accounting/${kind}/${id}/export?format=${format}`;
  const refresh = () => void invalidateApi(SOURCES_URL);
  const ready = journal.data && !journal.data.missing.length && journal.data.balanced;
  return (
    <Modal
      title={`Journal — ${title}`}
      size="lg"
      onClose={onClose}
      footer={ready ? (
        <>
          <DownloadButton size="md" url={url('csv')} fileName={`${journal.data!.number}.csv`} onDone={refresh}>Download CSV</DownloadButton>
          <DownloadButton size="md" variant="primary" url={url('tally_xml')} fileName={`${journal.data!.number}.xml`} onDone={refresh}>Download Tally XML</DownloadButton>
        </>
      ) : undefined}
    >
      <QueryState query={journal}>
        {(j) => (
          <div className="stack-3">
            <p className="text-sm text-2">{j.number} · {fmtDate(j.date)} · {j.narration}</p>
            {j.missing.length > 0 && <Alert tone="warn">Map these heads to ledgers before exporting: {j.missing.join(', ')}. {can('accounting.configure') ? <Link to="/accounting?tab=ledgers">Open the ledger map</Link> : 'Ask finance to map them.'}</Alert>}
            {!j.balanced && <Alert tone="warn">The journal does not balance. Check the run before exporting.</Alert>}
            <Table
              label="Journal entries"
              columns={entryColumns}
              rows={j.entries}
              rowKey={(e) => e.key}
              footer={<p className="cluster-between text-sm"><strong>Total debit and credit</strong><strong><Money value={j.total} /></strong></p>}
            />
          </div>
        )}
      </QueryState>
    </Modal>
  );
}

interface MapRow { key: string; label: string }

function Ledgers() {
  const { can } = useAuth();
  const map = useApiQuery<LedgerMap>(MAP_URL);
  return (
    <QueryState query={map} isEmpty={(d) => !d.heads.length && !d.items.length} empty={<EmptyState title="Nothing to map yet" description="Heads appear once pay components are set up." />}>
      {(d) => <LedgerForm data={d} editable={can('accounting.configure')} />}
    </QueryState>
  );
}

function LedgerForm({ data, editable }: { data: LedgerMap; editable: boolean }) {
  const toast = useToast();
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const saved = Object.fromEntries(data.items.map((i) => [i.map_key, i.ledger_name]));
  const values = draft ?? saved;
  const rows: MapRow[] = [...data.heads, ...data.items.filter((i) => !data.heads.some((h) => h.key === i.map_key)).map((i) => ({ key: i.map_key, label: i.map_key }))];
  const changed = rows.filter((k) => (values[k.key] ?? '') !== (saved[k.key] ?? ''));
  const save = useSubmit(async () => {
    await api.put(MAP_URL, { entries: changed.map((k) => ({ key: k.key, ledger: values[k.key] ?? '' })) });
    toast('Ledger map saved');
    await invalidateApi(MAP_URL);
    setDraft(null);
  });
  const columns: Column<MapRow>[] = [
    { key: 'head', header: 'Head', card: 'title', cell: (k) => <>{k.label}{k.label !== k.key && <div className="table__cell-sub mono">{k.key}</div>}</> },
    {
      key: 'ledger', header: 'Ledger', card: 'subtitle', cell: (k) => (editable
        ? <Input label={`Ledger for ${k.key}`} hideLabel value={values[k.key] ?? ''} maxLength={200} onChange={(e) => setDraft({ ...values, [k.key]: e.target.value })} />
        : values[k.key] ?? '—'),
    },
  ];
  return (
    <div className="stack-3">
      <div className="cluster-between">
        <h2>Ledger map</h2>
        {editable && <Button variant="primary" size="sm" disabled={!changed.length} loading={save.busy} onClick={() => void save.submit()}>Save{changed.length ? ` (${changed.length})` : ''}</Button>}
      </div>
      <p className="text-sm text-2">Enter the ledger names exactly as they are in your accounts (Tally needs them to exist). Heads ending in <span className="mono">*</span> catch everything of that kind without its own ledger.</p>
      <InlineError error={save.error} />
      <Table label="Ledger map" columns={columns} rows={rows} rowKey={(k) => k.key} />
    </div>
  );
}
