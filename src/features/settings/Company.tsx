import { useRef, useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DownloadButton } from '../../components/DownloadButton';
import { FileUpload } from '../../components/FileUpload';
import { FormActions } from '../../components/FormActions';
import { Input, Textarea } from '../../components/Input';
import { KeyValue } from '../../components/KeyValue';
import { Modal } from '../../components/Modal';
import { QueryState } from '../../components/QueryState';
import { RevealToggle } from '../../components/RevealToggle';
import { useToast } from '../../components/Toast';
import { useAction, useSubmit } from '../../components/useSubmit';
import type { ApiResponse } from '../../lib/api-types';
import { isMaskedField, useRevealable } from '../../lib/masking';
import { invalidateApi } from '../../lib/query';

const URL = '/api/v1/tenant/company';
type Company = ApiResponse<'/api/v1/tenant/company'>;

/** Fields sent as typed. Empty means no value. PAN and bank account stay out unless typed, because they read back masked. */
const TEXT_FIELDS = [
  ['legalName', 'Legal name'], ['gstin', 'GSTIN'], ['tan', 'TAN'], ['cin', 'CIN'], ['pfRegistration', 'PF registration'], ['esiRegistration', 'ESI registration'], ['ptRegistration', 'PT registration'],
  ['signatoryName', 'Authorised signatory'], ['signatoryDesignation', 'Signatory designation'], ['bankAccountHolder', 'Bank account holder'], ['bankName', 'Bank name'], ['bankIfsc', 'IFSC'],
] as const;

export function CompanySettings() {
  const { can } = useAuth();
  const { query, revealed, setRevealed } = useRevealable<Company>(URL);
  const [editing, setEditing] = useState(false);
  const manage = can('company.manage');
  return (
    <QueryState query={query}>
      {(c) => (
        <div className="stack-4">
          <Card title="Company details" actions={<div className="cluster"><RevealToggle revealed={revealed} loading={query.isFetching} onChange={setRevealed} what="bank details" />{manage && c.editable && <Button size="sm" disabled={isMaskedField(c, 'bankAccountHolder')} title={isMaskedField(c, 'bankAccountHolder') ? 'Show the bank details first' : undefined} onClick={() => setEditing(true)}>Edit</Button>}</div>}>
            <KeyValue items={[
              { label: 'Legal name', value: c.legalName }, { label: 'GSTIN', value: c.gstin && <span className="mono">{c.gstin}</span> }, { label: 'PAN', value: c.panMasked && <span className="mono">{c.panMasked}</span> }, { label: 'TAN', value: c.tan && <span className="mono">{c.tan}</span> }, { label: 'CIN', value: c.cin && <span className="mono">{c.cin}</span> },
              { label: 'Registered address', value: c.registeredAddress },
              ...('pfRegistration' in c ? [{ label: 'PF registration', value: c.pfRegistration }, { label: 'ESI registration', value: c.esiRegistration }, { label: 'PT registration', value: c.ptRegistration }] : []),
              { label: 'Authorised signatory', value: [c.signatoryName, c.signatoryDesignation].filter(Boolean).join(', ') || null },
              ...('bankAccountMasked' in c || 'bankAccountHolder' in c ? [
                { label: 'Bank account', value: <span className="mono">{c.bankAccountNumber ?? c.bankAccountMasked ?? '—'}</span> },
                { label: 'Account holder', value: isMaskedField(c, 'bankAccountHolder') ? 'Hidden' : c.bankAccountHolder },
                { label: 'Bank', value: isMaskedField(c, 'bankName') ? 'Hidden' : c.bankName },
                { label: 'IFSC', value: isMaskedField(c, 'bankIfsc') ? 'Hidden' : c.bankIfsc },
              ] : []),
            ]} />
          </Card>
          <Card title="Signature and stamp"><div className="stack-3"><p className="text-sm text-2">Printed on payslips and letters.</p><CompanyImage kind="signature" present={c.hasSignature} manage={manage} /><CompanyImage kind="stamp" present={c.hasStamp} manage={manage} /></div></Card>
          {editing && <CompanyForm company={c} onClose={() => setEditing(false)} />}
        </div>
      )}
    </QueryState>
  );
}

function CompanyForm({ company: c, onClose }: { company: Company; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState<Record<string, string>>(() => Object.fromEntries(TEXT_FIELDS.map(([k]) => [k, String((c as Record<string, unknown>)[k] ?? '')])));
  const [address, setAddress] = useState(c.registeredAddress ?? '');
  const [pan, setPan] = useState('');
  const [account, setAccount] = useState('');
  const form = useSubmit(async () => {
    await api.put(URL, { ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim() || null])), registeredAddress: address.trim() || null, ...(pan ? { pan } : {}), ...(account ? { bankAccountNumber: account } : {}), expectedVersion: c.version });
    toast('Company details saved');
    await invalidateApi(URL);
    onClose();
  });
  return (
    <Modal title="Edit company details" size="lg" onClose={onClose}>
      <form className="stack-3" autoComplete="off" onSubmit={form.submit}>
        <div className="columns-form">
          {TEXT_FIELDS.map(([k, label]) => <Input key={k} label={label} error={form.errors[k]} value={f[k] ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} />)}
          <Input label="PAN" hint={`Leave empty to keep ${c.panMasked ?? 'the current one'}`} pattern="[A-Z]{5}[0-9]{4}[A-Z]" title="Format AAAAA9999A" error={form.errors['pan']} value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} />
          <Input label="Bank account number" hint="Leave empty to keep the current one" inputMode="numeric" error={form.errors['bankAccountNumber']} value={account} onChange={(e) => setAccount(e.target.value.replace(/\D/g, ''))} />
        </div>
        <Textarea label="Registered address" error={form.errors['registeredAddress']} value={address} onChange={(e) => setAddress(e.target.value)} />
        <FormActions error={form.error} busy={form.busy} submitLabel="Save" onCancel={onClose} />
      </form>
    </Modal>
  );
}

function CompanyImage({ kind, present, manage }: { kind: 'signature' | 'stamp'; present: boolean; manage: boolean }) {
  const toast = useToast();
  const { run, isBusy } = useAction();
  const [file, setFile] = useState<File | null>(null);
  const [removing, setRemoving] = useState(false);
  const name = useRef(kind === 'signature' ? 'Signature' : 'Stamp');
  const url = `${URL}/images/${kind}`;
  const upload = useSubmit(async () => {
    const data = new FormData();
    data.append('file', file!);
    await api.upload(url, data);
    toast(`${name.current} saved`);
    setFile(null);
    await invalidateApi(URL);
  });
  return (
    <div className="stack-2">
      <div className="cluster-between">
        <strong>{name.current}</strong>
        {present && <div className="cluster"><DownloadButton url={url} fileName={`${kind}.png`} aria-label={`Download ${kind}`}>Download</DownloadButton>{manage && <Button size="sm" variant="danger-ghost" loading={isBusy(kind)} onClick={() => setRemoving(true)}>Remove</Button>}</div>}
      </div>
      {!present && !manage && <p className="text-sm text-2">None uploaded.</p>}
      {manage && (
        <form className="stack-2" onSubmit={upload.submit}>
          <FileUpload label={present ? `Replace ${kind}` : `Upload ${kind}`} hint="PNG or JPEG." accept=".png,.jpg,.jpeg,image/png,image/jpeg" file={file} onChange={setFile} />
          {file && <FormActions error={upload.error} busy={upload.busy} submitLabel="Upload" onCancel={() => setFile(null)} />}
        </form>
      )}
      {removing && <ConfirmDialog title={`Remove ${kind}`} danger confirmLabel="Remove" message="New payslips and letters will print without it." onClose={() => setRemoving(false)} onConfirm={async () => { await run(kind, async () => { await api.del(url); await invalidateApi(URL); }, `${name.current} removed`); }} />}
    </div>
  );
}
