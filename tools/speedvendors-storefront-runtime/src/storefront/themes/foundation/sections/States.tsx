import { EmptyMark } from './icons';

export function ProductSkeleton({ count }: { count: number }) {
  return (
    <div className="fd-skeleton" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="fd-skeleton__card" />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="fd-empty">
      <EmptyMark />
      <h3>{title}</h3>
      <p>{body}</p>
      {actionLabel && onAction ? (
        <button type="button" className="fd-btn fd-btn--ghost" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
