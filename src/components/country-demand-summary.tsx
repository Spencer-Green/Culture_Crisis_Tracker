import type {
  MetricTrend,
  RecreationShareTrend,
} from "@/lib/consumer-spending-analysis";
import { formatPublishedValue } from "@/lib/source-value-format";
import type { ConsumerSpendingObservation } from "@/services/consumer-spending-core";

export type DemandSummaryRow = {
  label: string;
  trend: MetricTrend | null;
  locale: string;
  basis: string;
  officialPeriodChange?: ConsumerSpendingObservation;
  periodLabel?: "MoM" | "QoQ";
};

type CountryDemandSummaryProps = {
  country: string;
  description: string;
  rows: readonly DemandSummaryRow[];
  share: RecreationShareTrend | null;
  shareLabel: string;
  source: string;
  sourceSemantics: string;
  nominalRealGap?: number | null;
  periodLabel: "MoM" | "QoQ";
  realUnavailable?: string;
  ancillarySignal?: {
    label: string;
    observation?: ConsumerSpendingObservation;
    description: string;
  };
};

function formatPeriod(observation: ConsumerSpendingObservation): string {
  const date = new Date(observation.periodStart);
  if (observation.frequency === "quarterly") {
    return `${date.getUTCFullYear()} Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
  }
  return new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatChange(value: number | null, suffix = "%") {
  if (value === null) return "—";
  const precision = Math.abs(value) > 0 && Math.abs(value) < 0.1 ? 2 : 1;
  return `${new Intl.NumberFormat("en-US", {
    signDisplay: "always",
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  }).format(value)}${suffix}`;
}

function directionTone(value: number | null) {
  if (value === null || Math.abs(value) < 0.05) return "text-zinc-400";
  return value > 0 ? "text-emerald-300" : "text-amber-300";
}

function retrievedDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function CountryDemandSummary({
  country,
  description,
  rows,
  share,
  shareLabel,
  source,
  sourceSemantics,
  nominalRealGap,
  periodLabel,
  realUnavailable,
  ancillarySignal,
}: CountryDemandSummaryProps) {
  const latest = rows.find((row) => row.trend)?.trend?.current;

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-800/90 bg-zinc-950/70 shadow-2xl shadow-black/10">
      <div className="flex flex-col gap-2 border-b border-zinc-800 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">{country}</h2>
          <p className="mt-1 text-xs text-zinc-500">{description}</p>
        </div>
        <p className="text-xs text-zinc-400">
          Latest period: {latest ? formatPeriod(latest) : "Not available"}
        </p>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[700px]">
          <div className="grid grid-cols-[minmax(230px,1.7fr)_1fr_0.7fr_0.7fr] border-b border-zinc-800/70 px-5 py-2 text-[10px] font-medium tracking-[0.12em] text-zinc-600 uppercase">
            <span>Metric</span>
            <span>Latest</span>
            <span>Native change</span>
            <span>YoY</span>
          </div>
          {rows.map((row) => {
            const officialChange = row.officialPeriodChange
              ? Number(row.officialPeriodChange.value)
              : null;
            const periodChange = row.officialPeriodChange
              ? Number.isFinite(officialChange)
                ? officialChange
                : null
              : (row.trend?.periodChange ?? null);
            return (
              <div
                key={row.label}
                className="grid grid-cols-[minmax(230px,1.7fr)_1fr_0.7fr_0.7fr] items-center border-b border-zinc-800/50 px-5 py-3 last:border-0"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-200">
                    {row.label}
                  </p>
                  <p className="mt-0.5 text-[11px] text-zinc-600">
                    {row.basis}
                    {row.trend ? ` · ${formatPeriod(row.trend.current)}` : ""}
                  </p>
                </div>
                <p className="font-data text-base text-zinc-100">
                  {row.trend
                    ? formatPublishedValue(
                        row.trend.current.value,
                        row.trend.current.unit,
                        row.locale,
                      ).headline
                    : "—"}
                </p>
                <div>
                  <p
                    className={`font-data text-sm ${directionTone(periodChange)}`}
                  >
                    {formatChange(periodChange)}
                  </p>
                  <p className="mt-0.5 text-[10px] text-zinc-700">
                    {row.officialPeriodChange
                      ? `${row.periodLabel ?? periodLabel} · ${source} published`
                      : `${row.periodLabel ?? periodLabel} · Tracker calculated`}
                  </p>
                </div>
                <p
                  className={`font-data text-sm ${directionTone(row.trend?.yearOverYearChange ?? null)}`}
                >
                  {formatChange(row.trend?.yearOverYearChange ?? null)}
                </p>
              </div>
            );
          })}
          <div className="grid grid-cols-[minmax(230px,1.7fr)_1fr_0.7fr_0.7fr] items-center px-5 py-3">
            <div>
              <p className="text-sm font-medium text-zinc-200">{shareLabel}</p>
              <p className="mt-0.5 text-[11px] text-zinc-600">
                Nominal recreation ÷ nominal household total
              </p>
              {share ? (
                <p className="mt-0.5 text-[10px] text-zinc-700">
                  Previous {periodLabel}: {share.previous?.toFixed(1) ?? "—"}% ·
                  year ago: {share.yearAgo?.toFixed(1) ?? "—"}%
                </p>
              ) : null}
            </div>
            <p className="font-data text-base text-zinc-100">
              {share ? `${share.current.toFixed(1)}%` : "—"}
            </p>
            <p className="font-data text-sm text-zinc-500">—</p>
            <p
              className={`font-data text-sm ${directionTone(share?.yearOverYearPointChange ?? null)}`}
            >
              {formatChange(share?.yearOverYearPointChange ?? null, " pp")}
            </p>
          </div>
        </div>
      </div>

      {(nominalRealGap !== undefined || realUnavailable || ancillarySignal) && (
        <div className="grid gap-3 border-t border-zinc-800/70 bg-zinc-950/50 px-5 py-4 md:grid-cols-3">
          {nominalRealGap !== undefined ? (
            <div>
              <p className="text-[11px] text-zinc-600">
                Nominal-real recreation YoY gap
              </p>
              <p className="font-data mt-1 text-sm text-zinc-300">
                {formatChange(nominalRealGap ?? null, " pp")}
              </p>
            </div>
          ) : null}
          {realUnavailable ? (
            <p className="text-[11px] leading-5 text-zinc-600">
              {realUnavailable}
            </p>
          ) : null}
          {ancillarySignal ? (
            <div>
              <p className="text-[11px] text-zinc-600">
                {ancillarySignal.label}
              </p>
              <p className="font-data mt-1 text-sm text-zinc-300">
                {ancillarySignal.observation
                  ? formatPublishedValue(
                      ancillarySignal.observation.value,
                      ancillarySignal.observation.unit,
                    ).headline
                  : "—"}
              </p>
              <p className="mt-1 text-[10px] text-zinc-700">
                {ancillarySignal.description}
              </p>
            </div>
          ) : null}
        </div>
      )}

      <p className="border-t border-zinc-800/70 px-5 py-3 text-[11px] text-zinc-600">
        {source} · {latest?.frequency ?? "native frequency"} ·{" "}
        {latest ? formatPeriod(latest) : "no current observation"} ·{" "}
        {sourceSemantics}
        {latest
          ? ` · retrieved ${retrievedDate(latest.retrievedAt, rows[0]?.locale ?? "en")}`
          : ""}
      </p>
    </section>
  );
}
