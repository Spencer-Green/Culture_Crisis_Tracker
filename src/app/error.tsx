"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-2xl border border-red-900/60 bg-red-950/20 p-6">
      <h1 className="text-lg font-semibold text-red-100">
        This view could not be loaded
      </h1>
      <p className="mt-2 text-sm text-red-200/60">
        Check the server environment and database state, then try again.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-5 rounded-lg border border-red-800 bg-red-950 px-4 py-2 text-sm text-red-200 transition-colors hover:bg-red-900 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Try again
      </button>
    </div>
  );
}
