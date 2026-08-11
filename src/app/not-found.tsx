import Link from "next/link";

export default function NotFound() {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-8 text-center">
      <p className="font-data text-xs tracking-[0.2em] text-zinc-600 uppercase">
        404
      </p>
      <h1 className="mt-3 text-xl font-semibold text-zinc-100">
        View not found
      </h1>
      <p className="mt-2 text-sm text-zinc-500">
        This dashboard section has not been defined.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
      >
        Return to overview
      </Link>
    </div>
  );
}
