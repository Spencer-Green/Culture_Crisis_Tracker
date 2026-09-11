import type { ResearchDevelopment } from "@/services/developments/research-development";

export const MONITOR_SECTORS = ["music", "film", "theatre", "gaming"] as const;
export type MonitorSector = (typeof MONITOR_SECTORS)[number];
export type Query = Record<string, string | string[] | undefined>;
export const first = (value: Query[string]) =>
  Array.isArray(value) ? value[0] : value;
export function monitorFilters(query: Query) {
  const sector = first(query.sector);
  const country = first(query.country);
  return {
    sector: MONITOR_SECTORS.includes(sector as MonitorSector)
      ? (sector as MonitorSector)
      : undefined,
    country: ["AU", "US", "GB", "CA", "NZ", "EU"].includes(country ?? "")
      ? country
      : undefined,
    days: first(query.days) === "1" ? 1 : 7,
    page: Math.min(
      1000,
      Math.max(1, Number.parseInt(first(query.page) ?? "1", 10) || 1),
    ),
    quarantine: first(query.state) === "quarantined",
    recent: first(query.view) === "new",
    aiOnly: first(query.theme) === "ai",
  };
}
export type MonitorFilters = ReturnType<typeof monitorFilters>;
export function queryHref(
  path: string,
  query: Record<string, string | number | undefined>,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined && value !== "") params.set(key, String(value));
  return `${path}${params.size ? `?${params}` : ""}`;
}
export function safeSourceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
export function dateLabel(value: string | null | undefined, timestamp = false) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Not recorded";
  return timestamp
    ? new Intl.DateTimeFormat("en-AU", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Australia/Melbourne",
      }).format(date) + " Melbourne"
    : value.slice(0, 10);
}
export function publicationLabel(value: ResearchDevelopment["publication"]) {
  return value.exactDate
    ? dateLabel(value.exactDate)
    : value.raw && value.raw !== "UNKNOWN"
      ? `${value.raw} (reported precision)`
      : "Unknown";
}
export function accessLabel(trace: string, mediation: string) {
  if (trace === "TRACE_ATTEMPTED")
    return "Page access attempted; inspection not established";
  if (
    trace === "TRACE_OPENED" &&
    ["DIRECTLY_OPENED", "DIRECTLY_INSPECTED"].includes(mediation)
  )
    return "Research provider reports opening the page";
  if (mediation === "SEARCH_MEDIATED") return "Search-mediated evidence";
  return "Model-reported source; inspection not established";
}
export function reviewLabel(state: string) {
  if (state === "APPROVED" || state === "APPROVED_FOR_INGESTION_INVESTIGATION")
    return "Approved for ingestion investigation";
  if (state === "REJECTED") return "Investigation rejected";
  return state === "REVIEW_REQUIRED"
    ? "Not reviewed"
    : state.toLowerCase().replaceAll("_", " ");
}
export function isNewResearch(
  item: ResearchDevelopment,
  now: Date,
  days: number,
) {
  const time = new Date(item.firstDiscoveredAt).getTime();
  return (
    item.verification !== "QUARANTINED" &&
    time <= now.getTime() &&
    time >= now.getTime() - days * 86400000
  );
}
export function observations(
  value: unknown,
): Array<{ metric: string; value: string; unit: string; qualifier: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (![row.metric, row.value, row.unit].every((v) => typeof v === "string"))
      return [];
    return [
      {
        metric: row.metric as string,
        value: row.value as string,
        unit: row.unit as string,
        qualifier: typeof row.qualifier === "string" ? row.qualifier : "",
      },
    ];
  });
}
export const COVERAGE_NOTES: Record<MonitorSector, string> = {
  music:
    "US recorded-music demand and UK grassroots venues cover different markets. Neither establishes global music health.",
  film: "Box-office receipts describe exhibition demand, not production-company economics. US coverage includes a provisional community dataset.",
  theatre:
    "Broadway and Australian annual performance data do not establish UK regional theatre conditions.",
  gaming:
    "Release counts and sampled player activity do not establish employment, revenue or studio viability.",
};
