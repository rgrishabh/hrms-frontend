import { useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { Alert } from '../../components/Alert';
import { StatusBadge } from '../../components/Badge';
import { ButtonAnchor } from '../../components/Button';
import { FormActions } from '../../components/FormActions';
import { Checkbox } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { QueryState } from '../../components/QueryState';
import { useToast } from '../../components/Toast';
import { useSubmit } from '../../components/useSubmit';
import { fmtDate, fmtDateTime } from '../../format';
import { invalidateApi, useApiQuery } from '../../lib/query';
import { POLICIES_URL, type PolicyVersionView } from './types';
import './Policies.css';

export function PolicyViewer({ id, onClose }: { id: string; onClose: () => void }) {
  const { me } = useAuth();
  const query = useApiQuery<PolicyVersionView>(`${POLICIES_URL}/versions/${id}`);
  const v = query.data;
  return (
    <Modal title={v ? `${v.title} — v${v.versionNo}` : 'Policy'} size="lg" onClose={onClose}>
      <QueryState query={query}>
        {(d) => (
          <div className="stack-3">
            <div className="cluster"><StatusBadge status={d.status} /><span className="text-2">Effective {fmtDate(d.effectiveFrom)}</span></div>
            <p className="text-sm text-2">What changed: {d.changeSummary}</p>
            {d.body && <div className="policy-body pre-wrap">{d.body}</div>}
            {d.hasFile && <div><ButtonAnchor href={`${POLICIES_URL}/versions/${id}/file?inline=true`} target="_blank" rel="noreferrer">Open {d.fileName}</ButtonAnchor></div>}
            {me?.user.employeeId && d.requiresAck && (d.acknowledgedAt
              ? <Alert tone="ok">You acknowledged this version on {fmtDateTime(d.acknowledgedAt)}.</Alert>
              : d.status === 'published' && <Acknowledge version={d} />)}
          </div>
        )}
      </QueryState>
    </Modal>
  );
}

function Acknowledge({ version }: { version: PolicyVersionView }) {
  const toast = useToast();
  const [read, setRead] = useState(false);
  const form = useSubmit(async () => {
    await api.post(`${POLICIES_URL}/versions/${version.id}/acknowledge`, { contentSha256: version.contentSha256 });
    toast('Thank you — acknowledgement recorded');
    await invalidateApi(POLICIES_URL, '/api/v1/dashboard');
  });
  return (
    <form className="stack-3" onSubmit={form.submit}>
      <Checkbox label="I have read and understood this policy and agree to follow it." checked={read} onChange={(e) => setRead(e.target.checked)} />
      <FormActions error={form.error} busy={form.busy} submitLabel="Acknowledge" disabled={!read} />
    </form>
  );
}
