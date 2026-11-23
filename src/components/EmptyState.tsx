import type { ReactNode } from 'react';
import './EmptyState.css';

export function EmptyState({ title, description, action, icon, compact }: { title: string; description?: ReactNode; action?: ReactNode; icon?: ReactNode; compact?: boolean }) {
  return (
    <div className={`empty-state${compact ? ' empty-state--compact' : ''}`}>
      {icon && <div className="empty-state__icon" aria-hidden="true">{icon}</div>}
      <p className="empty-state__title">{title}</p>
      {description && <p className="empty-state__description">{description}</p>}
      {action && <div className="empty-state__action">{action}</div>}
    </div>
  );
}
