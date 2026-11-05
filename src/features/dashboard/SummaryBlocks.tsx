import { Link } from 'react-router-dom';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { QueryState } from '../../components/QueryState';
import { Skeleton } from '../../components/Skeleton';
import { StatGrid, StatTile, type StatTone } from '../../components/StatTile';
import { fmtDate, fmtNumber } from '../../format';
import type { ApiResponse, Refine } from '../../lib/api-types';
import { useApiQuery } from '../../lib/query';
import './SummaryBlocks.css';

type SummaryAnswer = ApiResponse<'/api/v1/dashboard'>;
type SectionAnswer = SummaryAnswer['sections'][number];
/** The schema says `tone` is a string. The server sends one of these. */
type Summary = Refine<SummaryAnswer, { sections: Refine<SectionAnswer, { tiles: Refine<SectionAnswer['tiles'][number], { tone?: StatTone }>[] }>[] }>;

/** Role-specific numbers from the server. Each tile links to the screen behind its number. */
export function SummaryBlocks() {
  const query = useApiQuery<Summary>('/api/v1/dashboard');
  return (
    <QueryState query={query} loading={<StatGrid>{[1, 2, 3, 4].map((i) => <Skeleton key={i} height="tile" />)}</StatGrid>}>
      {({ sections, lists }) => (
        <>
          {sections.map((s) => (
            <section key={s.key} aria-label={s.title} className="stack-2">
              <h2>{s.title}</h2>
              <StatGrid>
                {s.tiles.map((t) => <StatTile key={t.key} tileKey={t.key} label={t.label} value={typeof t.value === 'number' ? fmtNumber(t.value) : t.value} detail={t.detail} tone={t.tone} href={t.href} />)}
              </StatGrid>
            </section>
          ))}
          {lists.length > 0 && (
            <div className="columns-2">
              {lists.map((l) => (
                <Card key={l.key} title={l.title} aria-label={l.title} actions={l.href && l.items.length > 0 ? <Link to={l.href} className="text-sm">View all</Link> : undefined}>
                  {!l.items.length
                    ? <EmptyState compact title={l.key === 'on_leave_today' ? 'Nobody is on leave today.' : 'Nothing to show.'} />
                    : (
                      <ul className="list-plain summary-list">
                        {l.items.map((i, n) => (
                          <li key={n}>
                            <span className="grow">{i.primary}{i.secondary && <span className="text-2"> · {i.secondary}</span>}</span>
                            {i.date && <span className="text-2 text-sm nowrap">{l.key === 'on_leave_today' ? `until ${fmtDate(i.date)}` : fmtDate(i.date)}</span>}
                          </li>
                        ))}
                        {(l.more ?? 0) > 0 && <li className="text-2">and {l.more} more</li>}
                      </ul>
                    )}
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </QueryState>
  );
}
