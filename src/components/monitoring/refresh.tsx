"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
export function RefreshEvidence() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-live="polite"
      onClick={() => startTransition(() => router.refresh())}
      className="rounded border border-zinc-700 px-3 py-1 text-xs text-zinc-300 disabled:opacity-50"
    >
      {pending ? "Reading stored evidence…" : "Refresh view"}
    </button>
  );
}
