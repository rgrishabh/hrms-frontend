import { Link, useNavigate } from 'react-router-dom';
import { BellOff } from 'lucide-react';
import { qs } from '../../api';
import { Button, ButtonLink } from '../../components/Button';
import { Drawer } from '../../components/Drawer';
import { EmptyState } from '../../components/EmptyState';
import { QueryState } from '../../components/QueryState';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../api';
import { markAllRead, markRead, type NotificationItem, type NotificationPage } from '../../features/notifications';
import { fmtDateTime } from '../../format';
import { useApiQuery } from '../../lib/query';
import './NotificationCentre.css';

export function NotificationRow({ n, onOpen }: { n: NotificationItem; onOpen: (n: NotificationItem) => void }) {
  return (
    <button type="button" className={`notice-row${n.read_at ? '' : ' notice-row--unread'}`} onClick={() => onOpen(n)}>
      <span className="notice-row__dot" aria-hidden="true" />
      <span className="grow">
        <span className="notice-row__title">{!n.read_at && <span className="visually-hidden">Unread: </span>}{n.title}</span>
        {n.body && <span className="notice-row__body">{n.body}</span>}
      </span>
      <span className="notice-row__time">{fmtDateTime(n.created_at)}</span>
    </button>
  );
}

/** The bell's panel: latest notifications, without leaving the current page. */
export function NotificationCentre({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const toast = useToast();
  const query = useApiQuery<NotificationPage>(`/api/v1/notifications${qs({ page: 1, pageSize: 15 })}`);
  const open = async (n: NotificationItem) => {
    if (!n.read_at) await markRead(n.id).catch(() => undefined);
    if (n.link) { onClose(); nav(n.link); }
  };
  return (
    <Drawer
      title="Notifications"
      onClose={onClose}
      footer={(
        <>
          <Button size="sm" variant="ghost" onClick={() => markAllRead().catch((e: unknown) => toast(errorMessage(e), 'error'))}>Mark all read</Button>
          <ButtonLink to="/notifications" size="sm" onClick={onClose}>View all</ButtonLink>
        </>
      )}
    >
      <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<BellOff />} title="Nothing new" description={<>Approvals and reminders appear here. <Link to="/account" onClick={onClose}>Email preferences</Link></>} />}>
        {(d) => <div className="notice-list">{d.items.map((n) => <NotificationRow key={n.id} n={n} onOpen={open} />)}</div>}
      </QueryState>
    </Drawer>
  );
}
