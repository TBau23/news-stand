export default function DashboardLoading(): React.JSX.Element {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      {/* Header skeleton */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
          <div className="h-6 w-20 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
          <div className="flex items-center gap-3">
            <div className="h-5 w-12 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
            <div className="h-8 w-8 rounded-full bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
          </div>
        </div>
      </div>

      {/* Banner skeleton */}
      <div className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-5xl px-4 py-3">
          <div className="h-4 w-64 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
        </div>
      </div>

      {/* Grid skeleton */}
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden"
            >
              <div className="p-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-24 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                  <div className="h-3 w-16 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                </div>
              </div>
              <div className="h-48 bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
              <div className="p-4 space-y-2">
                <div className="h-4 w-full rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                <div className="h-3 w-3/4 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                <div className="h-3 w-16 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse mt-3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
