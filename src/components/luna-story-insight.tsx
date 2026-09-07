import type { StorySynthesisReadResult } from "@/services/media/production-story-synthesis-core";

export function LunaStoryInsight({
  result,
}: {
  result: StorySynthesisReadResult | null | undefined;
}) {
  if (!result?.artifact) return null;
  const synthesis = result.artifact.synthesis;
  const uncertainty = synthesis.uncertainties[0]?.statement;
  const whatToWatch = synthesis.whatToWatch[0];
  return (
    <aside
      aria-label="Luna intelligence"
      data-luna-freshness={result.freshness}
      className="mt-3 border-l border-violet-800/70 pl-3 text-xs leading-5"
    >
      <p className="text-[10px] tracking-[0.16em] text-violet-400 uppercase">
        Luna intelligence
        {result.freshness === "STALE" ? (
          <span className="ml-2 tracking-normal text-zinc-600 normal-case">
            last validated · evidence changed
          </span>
        ) : null}
      </p>
      <p className="mt-1 text-zinc-400">{synthesis.whyItMatters}</p>
      {uncertainty ? (
        <p className="mt-1 text-zinc-600">
          <span className="text-zinc-500">Uncertainty:</span> {uncertainty}
        </p>
      ) : null}
      {whatToWatch ? (
        <p className="mt-1 text-zinc-600">
          <span className="text-zinc-500">What to watch:</span> {whatToWatch}
        </p>
      ) : null}
    </aside>
  );
}
