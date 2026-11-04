import type { HTMLAttributes, ReactNode } from 'react';
import './Card.css';

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  headingLevel?: 2 | 3;
  actions?: ReactNode;
  /** No padding, for lists and tables that run edge to edge. */
  flush?: boolean;
}

/** A bordered section. Use sparingly: most content sits directly on the page. */
export function Card({ title, headingLevel = 2, actions, flush, className, children, ...rest }: CardProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <section {...rest} className={['panel', flush && 'panel--flush', className].filter(Boolean).join(' ')}>
      {(title || actions) && (
        <header className="panel__header">
          {title && <Heading className="panel__title">{title}</Heading>}
          {actions && <div className="panel__actions">{actions}</div>}
        </header>
      )}
      <div className="panel__body">{children}</div>
    </section>
  );
}
