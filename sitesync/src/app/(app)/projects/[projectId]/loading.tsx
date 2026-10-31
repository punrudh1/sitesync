export default function Loading() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading">
      <div className="h-8 w-64 animate-pulse rounded bg-slate-200" />
      <div className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-slate-200" />)}</div>
      <div className="h-64 animate-pulse rounded-lg bg-slate-200" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
