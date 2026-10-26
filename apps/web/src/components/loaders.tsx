// Loading primitives. Captions say what is happening, never just "Loading".

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="spinner" role={label ? "status" : undefined}>
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}

/** Full-area loader: a veil of light passes over the wordmark. */
export function VeilLoader({ caption }: { caption: string }) {
  return (
    <div className="veil-loader" role="status" aria-live="polite">
      <span className="veil-mark" aria-hidden="true">VELUM</span>
      <span className="veil-line" aria-hidden="true" />
      <span className="veil-caption">{caption}</span>
    </div>
  );
}

/** Placeholder blocks shaped like the content that is about to arrive. */
export function Skeleton({ lines = 3, label, heading = false }: { lines?: number; label: string; heading?: boolean }) {
  return (
    <div className="skeleton" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {heading ? <span className="skeleton-block skeleton-heading" aria-hidden="true" /> : null}
      {Array.from({ length: lines }, (_, index) => (
        <span className="skeleton-block" aria-hidden="true" key={index} style={{ width: `${92 - ((index * 17) % 40)}%` }} />
      ))}
    </div>
  );
}

/** Determinate progress for multi-step work such as uploads. */
export function Progress({ value, max, label }: { value: number; max: number; label: string }) {
  const percent = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-valuetext={label}>
      <span className="progress-label">{label}</span>
      <span className="progress-track" aria-hidden="true"><span className="progress-fill" style={{ width: `${percent}%` }} /></span>
    </div>
  );
}
