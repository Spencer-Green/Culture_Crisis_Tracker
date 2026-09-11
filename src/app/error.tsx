"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="space-y-3">
      <h1 className="text-xl font-semibold">Evidence could not be loaded</h1>
      <p className="text-sm text-zinc-400">
        This is a reading failure, not an absence of evidence. Refreshing this
        view does not run research.
      </p>
      <button
        onClick={reset}
        className="rounded border border-zinc-600 px-3 py-2"
      >
        Reload stored evidence
      </button>
    </section>
  );
}
