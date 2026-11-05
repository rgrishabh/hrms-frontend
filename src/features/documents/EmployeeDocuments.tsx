import { useState } from 'react';
import { api, qs } from '../../api';
import { useAuth } from '../../auth';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { QueryState } from '../../components/QueryState';
import { useToast } from '../../components/Toast';
import { invalidateApi, useApiQuery } from '../../lib/query';
import { DocumentTable, UploadDialog, type DocumentCategoryList, type DocumentList, type DocumentRow } from './DocumentTable';

/** Documents tab on an employee profile. */
export function EmployeeDocuments({ employeeId }: { employeeId: string }) {
  const { can, me } = useAuth();
  const toast = useToast();
  const cats = useApiQuery<DocumentCategoryList>('/api/v1/documents/categories');
  const docs = useApiQuery<DocumentList>(`/api/v1/documents${qs({ employeeId, pageSize: 100 })}`);
  const [uploading, setUploading] = useState(false);
  const [archive, setArchive] = useState<DocumentRow | null>(null);
  const self = me?.user.employeeId === employeeId;
  const uploadable = (cats.data?.items ?? []).filter((c) => c.scope === 'employee' && c.status === 'active' && (can('documents.manage') || (self && c.employee_upload)));
  const reload = () => invalidateApi('/api/v1/documents');
  return (
    <div className="stack-3">
      {uploadable.length > 0 && <div className="cluster-between"><span /><Button variant="primary" size="sm" onClick={() => setUploading(true)}>Upload</Button></div>}
      <QueryState query={docs}>{(d) => <DocumentTable items={d.items} onArchive={can('documents.manage') ? setArchive : undefined} />}</QueryState>
      {uploading && <UploadDialog categories={uploadable} employeeId={employeeId} onClose={() => setUploading(false)} onDone={() => void reload()} />}
      {archive && <ConfirmDialog title="Archive document" message={`Archive “${archive.title}”?`} confirmLabel="Archive" danger onClose={() => setArchive(null)} onConfirm={async () => { await api.post(`/api/v1/documents/${archive.id}/archive`); toast('Archived'); await reload(); }} />}
    </div>
  );
}
