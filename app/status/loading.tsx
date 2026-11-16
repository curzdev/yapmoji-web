export default function StatusLoading() {
  return (
    <main className="dark min-h-screen bg-[#101114] px-4 py-6 text-white sm:px-6 sm:py-10">
      <div className="mx-auto max-w-5xl" role="status" aria-live="polite">
        <div className="flex items-center justify-between border-b border-white/10 pb-5">
          <div className="h-10 w-36 animate-pulse rounded-lg bg-white/10" />
          <div className="h-10 w-48 animate-pulse rounded-lg bg-white/10" />
        </div>
        <p className="mt-8 text-sm text-white/55">Checking current Yapmoji services…</p>
        <div className="mt-6 h-24 animate-pulse rounded-xl border border-white/10 bg-[#191B20]" />
        <div className="mt-4 space-y-2">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="h-16 animate-pulse rounded-xl border border-white/10 bg-[#191B20]" />
          ))}
        </div>
        <span className="sr-only">Loading current system status</span>
      </div>
    </main>
  )
}
