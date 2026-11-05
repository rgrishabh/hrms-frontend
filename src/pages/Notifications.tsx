import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellOff } from 'lucide-react';
import { errorMessage, qs } from '../api';
import { NotificationRow } from '../app/shell/NotificationCentre';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { Checkbox } from '../components/Input';
import { PageHeader } from '../components/PageHeader';
import { Pagination } from '../components/Pagination';
import { QueryState } from '../components/QueryState';
import { useToast } from '../components/Toast';
import { Card } from '../components/Card';
import { markAllRead, markRead, type NotificationItem, type NotificationPage } from '../features/notifications';
import { useApiQuery } from '../lib/query';

export function Notifications() {
  const nav = useNavigate();
  const toast = useToast();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const query = useApiQuery<NotificationPage>(`/api/v1/notifications${qs({ unread: unreadOnly || undefined, page, pageSize: 20 })}`, { placeholderData: (previous) => previous });
  const open = async (n: NotificationItem) => {
    if (!n.read_at) await markRead(n.id).catch(() => undefined);
    if (n.link) void nav(n.link);
  };
  return (
    <div className="stack-4">
      <PageHeader
        title="Notifications"
        description="Approvals, decisions, reminders and security notices."
        actions={<Button onClick={() => markAllRead().catch((e: unknown) => toast(errorMessage(e), 'error'))}>Mark all read</Button>}
      />
      <Checkbox label="Unread only" checked={unreadOnly} onChange={(e) => { setUnreadOnly(e.target.checked); setPage(1); }} />
      <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<BellOff />} title={unreadOnly ? 'No unread notifications' : 'No notifications yet'} />}>
        {(d) => (
          <div className="stack-3">
            <Card flush aria-label="Notifications"><div className="notice-list">{d.items.map((n) => <NotificationRow key={n.id} n={n} onOpen={open} />)}</div></Card>
            <Pagination page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
          </div>
        )}
      </QueryState>
    </div>
  );
}
