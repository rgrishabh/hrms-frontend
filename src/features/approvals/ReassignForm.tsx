import { useState } from 'react';
import { api } from '../../api';
import { FormActions } from '../../components/FormActions';
import { Textarea } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { Picker, type PickerItem } from '../../components/Picker';
import { useToast } from '../../components/Toast';
import { useSubmit } from '../../components/useSubmit';
import { invalidateApi } from '../../lib/query';
import { searchDelegates } from './Delegations';

/** Sends a stuck request to someone else. The server refuses anyone who prepared it, or who it concerns. */
export function ReassignForm({ request, onClose }: { request: { id: string; summary: string }; onClose: () => void }) {
  const toast = useToast();
  const [person, setPerson] = useState<PickerItem | null>(null);
  const [reason, setReason] = useState('');
  const form = useSubmit(async () => {
    await api.post(`/api/v1/approvals/${request.id}/reassign`, { userId: person!.id, reason: reason.trim() });
    toast(`Request reassigned to ${person!.label}`);
    await invalidateApi('/api/v1/approvals');
    onClose();
  }, {
    validate: () => ({
      ...(person ? {} : { userId: 'Choose who should decide this' }),
      ...(reason.trim().length >= 5 ? {} : { reason: 'Say why, in at least 5 characters' }),
    }),
  });
  return (
    <Modal title="Reassign request" description={request.summary} onClose={onClose}>
      <form className="stack-3" onSubmit={form.submit}>
        <Picker label="Decided by" hint="Type at least two letters of a name or employee code" placeholder="Search people" queryKey="delegates" minChars={2} search={searchDelegates} required error={form.errors['userId']} value={person} onChange={(p) => { setPerson(p); form.clearError('userId'); }} />
        <Textarea label="Reason" required maxLength={500} error={form.errors['reason']} value={reason} onChange={(e) => { setReason(e.target.value); form.clearError('reason'); }} />
        <FormActions error={form.error} busy={form.busy} submitLabel="Reassign" onCancel={onClose} />
      </form>
    </Modal>
  );
}
