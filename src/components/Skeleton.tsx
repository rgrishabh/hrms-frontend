import './Skeleton.css';

export function Skeleton({ width = 'full', height = 'line' }: { width?: 'xs' | 'sm' | 'md' | 'lg' | 'full'; height?: 'line' | 'heading' | 'tile' | 'block' }) {
  return <span className={`skeleton skeleton--w-${width} skeleton--h-${height}`} aria-hidden="true" />;
}

/** Announces once and keeps the placeholder bars out of the accessibility tree. */
function LoadingRegion({ label = 'Loading', children }: { label?: string; children: React.ReactNode }) {
  return <div aria-busy="true" role="status" aria-label={label} className="skeleton-region">{children}</div>;
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <LoadingRegion>
      <div className="stack-3">
        {Array.from({ length: rows }, (_, i) => <Skeleton key={i} width={i % 3 === 2 ? 'lg' : 'full'} />)}
      </div>
    </LoadingRegion>
  );
}

export function SkeletonPage() {
  return (
    <LoadingRegion label="Loading page">
      <div className="stack-6">
        <div className="stack-2"><Skeleton width="sm" height="heading" /><Skeleton width="md" /></div>
        <div className="skeleton-tiles">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} height="tile" />)}</div>
        <Skeleton height="block" />
      </div>
    </LoadingRegion>
  );
}
