import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';
import './Pagination.css';

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="pagination__range tnum">{total === 0 ? 'No records' : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}</span>
      <Button size="sm" icon={<ChevronLeft aria-hidden="true" />} disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
      <Button size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next<ChevronRight aria-hidden="true" /></Button>
    </nav>
  );
}
