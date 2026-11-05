import { useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import { Alert } from '../../components/Alert';
import { DatePicker } from '../../components/DatePicker';
import { FormActions } from '../../components/FormActions';
import { Input, Textarea } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { useSubmit } from '../../components/useSubmit';
import { addDays, currencySymbol, fmtDate, todayLocal } from '../../format';
import { invalidateApi, useApiQuery } from '../../lib/query';
import { useOrg } from '../org/useOrg';
import { OrgFields } from './OrgFields';
import type { Offer, OrgValues, Requisition } from './types';

interface OfferValues extends OrgValues { designation: string; annualCtc: number | string; joiningDate: string; probationMonths: number | string; contractEndDate: string; notes: string }

const blank = (): OfferValues => ({ designation: '', legalEntityId: '', branchId: '', departmentId: null, employmentType: 'permanent', annualCtc: '', joiningDate: addDays(todayLocal(), 30), probationMonths: 6, contractEndDate: '', notes: '' });

const fromOffer = (o: Offer): OfferValues => ({
  designation: o.designation, legalEntityId: o.legal_entity_id ?? '', branchId: o.branch_id ?? '', departmentId: o.department_id ?? null, employmentType: o.employment_type, annualCtc: o.annual_ctc ?? '',
  joiningDate: o.joining_date, probationMonths: o.probation_months ?? '', contractEndDate: o.contract_end_date ?? '', notes: o.notes ?? '',
});

/**
 * Drafts or edits an offer. PUT replaces the whole offer, but the application's offer rows carry only the branch name, not the
 * ids. So the branch is matched by name and the legal entity follows it; the department starts from the requisition.
 * A new offer also starts from the requisition, because it nearly always repeats it.
 */
export function OfferForm({ applicationId, requisitionId, offer, onClose }: { applicationId: string; requisitionId: string; offer?: Offer; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState<OfferValues>(() => (offer ? fromOffer(offer) : blank()));
  const set = (p: Partial<OfferValues>) => setF((c) => ({ ...c, ...p }));
  const org = useOrg();
  const req = useApiQuery<Requisition>(`/api/v1/recruitment/requisitions/${requisitionId}`);
  const filled = useRef(false);
  useEffect(() => {
    if (filled.current || !org.data || req.isPending) return;
    filled.current = true;
    const r = req.data;
    if (offer) {
      const branch = org.data.branches.find((b) => b.id === offer.branch_id || b.name === offer.branch_name);
      setF((c) => ({ ...c, branchId: c.branchId || branch?.id || '', legalEntityId: c.legalEntityId || branch?.legal_entity_id || '', departmentId: offer.department_id !== undefined ? offer.department_id : r?.department_id ?? null }));
    } else if (r) {
      setF((c) => ({ ...c, designation: c.designation || (r.designation ?? ''), legalEntityId: c.legalEntityId || r.legal_entity_id, branchId: c.branchId || r.branch_id, departmentId: c.departmentId ?? r.department_id, employmentType: r.employment_type }));
    }
  }, [org.data, req.data, req.isPending, offer]);
  const form = useSubmit(async () => {
    const body = { ...f, annualCtc: Number(f.annualCtc), probationMonths: f.probationMonths === '' ? null : Number(f.probationMonths), contractEndDate: f.contractEndDate || null, notes: f.notes || null };
    const r = offer ? await api.put<{ aboveBudget: boolean }>(`/api/v1/recruitment/offers/${offer.id}`, body) : await api.post<{ aboveBudget: boolean }>(`/api/v1/recruitment/applications/${applicationId}/offers`, body);
    toast(r.aboveBudget ? 'Draft saved — above the requisition budget' : 'Draft saved');
    await invalidateApi('/api/v1/recruitment');
    onClose();
  });
  return (
    <Modal title={offer ? 'Edit offer' : 'Draft offer'} size="lg" onClose={onClose}>
      <form className="stack-4" onSubmit={form.submit}>
        <Input label="Designation" required minLength={2} error={form.errors['designation']} value={f.designation} onChange={(e) => set({ designation: e.target.value })} />
        <OrgFields v={f} set={set} errors={form.errors} />
        <div className="columns-form">
          <Input label={`Annual CTC (${currencySymbol()})`} type="number" inputMode="decimal" required min={1} step="0.01" error={form.errors['annualCtc']} value={f.annualCtc} onChange={(e) => set({ annualCtc: e.target.value })} />
          <DatePicker label="Joining date" required min={offer ? undefined : todayLocal()} error={form.errors['joiningDate']} value={f.joiningDate} onChange={(e) => set({ joiningDate: e.target.value })} />
          <Input label="Probation (months)" type="number" inputMode="numeric" min={0} max={24} error={form.errors['probationMonths']} value={f.probationMonths} onChange={(e) => set({ probationMonths: e.target.value })} />
          {f.employmentType === 'contract' && <DatePicker label="Contract end" required error={form.errors['contractEndDate']} value={f.contractEndDate} onChange={(e) => set({ contractEndDate: e.target.value })} />}
        </div>
        <Textarea label="Notes" error={form.errors['notes']} value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
        {offer?.status === 'rejected' && <Alert tone="warn">This offer was rejected. Saving returns it to draft, and it needs approval again.</Alert>}
        {offer && offer.department_id === undefined && <p className="text-xs text-3">Check the department and contract end date. They start from the requisition, not from the saved offer.</p>}
        <p className="text-xs text-3">The approval request shows candidate and designation only. Compensation stays visible only to people with compensation access.</p>
        <FormActions error={form.error} busy={form.busy} submitLabel={offer ? 'Save changes' : 'Save draft'} onCancel={onClose} />
      </form>
    </Modal>
  );
}

export function HireForm({ offer, onClose }: { offer: Offer; onClose: () => void }) {
  const toast = useToast();
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const form = useSubmit(async () => {
    const r = await api.post<{ requisitionClosed?: boolean }>(`/api/v1/recruitment/offers/${offer.id}/hire`, { employeeCode: code, workEmail: email || undefined });
    toast(r.requisitionClosed ? 'Employee created (pre-joining); the requisition is now filled and closed' : 'Employee created (pre-joining)');
    await invalidateApi('/api/v1/recruitment', '/api/v1/employees');
    onClose();
  });
  return (
    <Modal title="Hire — create employee record" onClose={onClose}>
      <form className="stack-4" onSubmit={form.submit}>
        <p className="text-sm text-2">Creates the employee as <strong>pre-joining</strong> from the offer (designation, branch, joining date {fmtDate(offer.joining_date)}, probation), with the hiring manager as reporting manager.</p>
        <div className="columns-form">
          <Input label="Employee code" required error={form.errors['employeeCode']} value={code} onChange={(e) => setCode(e.target.value)} />
          <Input label="Work email (optional)" type="email" inputMode="email" error={form.errors['workEmail']} value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <FormActions error={form.error} busy={form.busy} submitLabel="Create employee" onCancel={onClose} />
      </form>
    </Modal>
  );
}
