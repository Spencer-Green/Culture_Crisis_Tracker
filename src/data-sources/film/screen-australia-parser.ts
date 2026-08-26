import type {
  ScreenAustraliaBoxOfficeRecord,
  ScreenAustraliaParsedWidget,
  ScreenAustraliaPeriodType,
} from "@/data-sources/film/screen-australia-types";

export class ScreenAustraliaParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScreenAustraliaParseError";
  }
}

type ViewDefinition = {
  id: string;
  periodType: ScreenAustraliaPeriodType;
  title: string;
  datePrefix: string;
  maximumRows: number;
  grossAttribute: "data-weekbo" | "data-yearbo";
  releaseAttribute: "data-week" | "data-weeks" | null;
  tipId: string;
};

const VIEWS: readonly ViewDefinition[] = [
  {
    id: "top5_weekly",
    periodType: "WEEKLY_TOP_5",
    title: "Top 5 Films: weekly",
    datePrefix: "Week ending",
    maximumRows: 5,
    grossAttribute: "data-weekbo",
    releaseAttribute: "data-week",
    tipId: "weekly-tip",
  },
  {
    id: "top20_aus_ytd",
    periodType: "AUSTRALIAN_YTD",
    title: "Top Australian: YTD",
    datePrefix: "As at",
    maximumRows: 20,
    grossAttribute: "data-yearbo",
    releaseAttribute: "data-weeks",
    tipId: "aus-monthly-tip",
  },
  {
    id: "top20_monthly",
    periodType: "MONTHLY_TOP_20",
    title: "Top 20 Films: monthly",
    datePrefix: "4 weeks ending",
    maximumRows: 20,
    grossAttribute: "data-weekbo",
    releaseAttribute: "data-week",
    tipId: "monthly-tip",
  },
  {
    id: "top50_ytd",
    periodType: "OVERALL_YTD_TOP_50",
    title: "Top 50 Films: YTD",
    datePrefix: "As at",
    maximumRows: 50,
    grossAttribute: "data-weekbo",
    releaseAttribute: null,
    tipId: "top50-tip",
  },
] as const;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeHtml(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function normalizeScreenAustraliaTitle(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function parseScreenAustraliaAud(
  value: string | undefined,
): number | null {
  if (!value || value.trim() === "" || value.trim() === "-") return null;
  const normalized = value.replace(/[,$\s]/g, "");
  if (!/^\d+$/.test(normalized))
    throw new ScreenAustraliaParseError(
      "Screen Australia returned an invalid AUD value.",
    );
  const amount = Number(normalized);
  if (!Number.isSafeInteger(amount))
    throw new ScreenAustraliaParseError(
      "Screen Australia returned an out-of-range AUD value.",
    );
  return amount;
}

export function parseScreenAustraliaReportDate(value: string): Date {
  const match = /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/.exec(value.trim());
  if (!match)
    throw new ScreenAustraliaParseError(
      "Screen Australia returned an unsupported report date.",
    );
  const months = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ];
  const month = months.indexOf(match[2].toLowerCase());
  const day = Number(match[1]);
  const year = Number(match[3]);
  if (month < 0) throw new ScreenAustraliaParseError("Invalid report month.");
  const date = new Date(Date.UTC(year, month, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day
  )
    throw new ScreenAustraliaParseError("Invalid report date.");
  return date;
}

function sectionHtml(html: string, view: ViewDefinition): string {
  const pattern = new RegExp(
    `<div\\s+class="table-wrap"\\s+id="ds-${escapeRegExp(view.id)}"[^>]*>([\\s\\S]*?)(?=<div\\s+class="table-wrap"\\s+id="ds-|<script\\b)`,
    "i",
  );
  const match = pattern.exec(html);
  if (!match)
    throw new ScreenAustraliaParseError(
      `Screen Australia layout changed: ${view.title} was not found.`,
    );
  return match[1];
}

function parseAttributes(value: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const match of value.matchAll(/\b(data-[\w-]+)="([^"]*)"/gi))
    attributes.set(match[1].toLowerCase(), decodeHtml(match[2]));
  return attributes;
}

function optionalAttribute(
  attributes: ReadonlyMap<string, string>,
  name: string | null,
): string | null {
  if (!name) return null;
  const value = attributes.get(name)?.trim();
  return value ? value : null;
}

function parseView(
  html: string,
  view: ViewDefinition,
): {
  records: ScreenAustraliaBoxOfficeRecord[];
  reportDate: Date;
  rowsRead: number;
  rowsSkipped: number;
  warnings: string[];
} {
  const section = sectionHtml(html, view);
  const expectedHeading = new RegExp(
    `<h2[^>]*id="title-${escapeRegExp(view.id)}"[^>]*>\\s*${escapeRegExp(view.title)}\\s*</h2>`,
    "i",
  );
  if (!expectedHeading.test(section))
    throw new ScreenAustraliaParseError(
      `Screen Australia layout changed: ${view.title} heading was invalid.`,
    );
  const dateMatch = new RegExp(
    `<p\\s+class="ds-date">\\s*${escapeRegExp(view.datePrefix)}:\\s*<strong>([^<]+)</strong>\\s*</p>`,
    "i",
  ).exec(section);
  if (!dateMatch)
    throw new ScreenAustraliaParseError(
      `Screen Australia layout changed: ${view.title} report date was missing.`,
    );
  const reportDate = parseScreenAustraliaReportDate(decodeHtml(dateMatch[1]));
  const tableMatch = new RegExp(
    `<table\\s+aria-labelledby="title-${escapeRegExp(view.id)}"[^>]*>[\\s\\S]*?<tbody>([\\s\\S]*?)</tbody>[\\s\\S]*?</table>`,
    "i",
  ).exec(section);
  if (!tableMatch)
    throw new ScreenAustraliaParseError(
      `Screen Australia layout changed: ${view.title} table was missing.`,
    );

  const rows = [...tableMatch[1].matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)];
  if (rows.length === 0)
    throw new ScreenAustraliaParseError(
      `Screen Australia returned no rows for ${view.title}.`,
    );
  const records: ScreenAustraliaBoxOfficeRecord[] = [];
  const warnings: string[] = [];
  let rowsSkipped = 0;
  for (const row of rows) {
    const attributes = parseAttributes(row[1]);
    if (attributes.get("data-tipid") !== view.tipId)
      throw new ScreenAustraliaParseError(
        `Screen Australia layout changed: ${view.title} row semantics were invalid.`,
      );
    const rank = Number(attributes.get("data-rank"));
    const title = attributes.get("data-title")?.trim() ?? "";
    const normalizedTitle = normalizeScreenAustraliaTitle(title);
    if (
      !Number.isInteger(rank) ||
      rank < 1 ||
      rank > view.maximumRows ||
      !title ||
      !normalizedTitle
    ) {
      rowsSkipped += 1;
      warnings.push(`${view.title}: skipped an invalid rank/title row.`);
      continue;
    }
    records.push({
      reportDate,
      periodType: view.periodType,
      rank,
      title,
      normalizedTitle,
      periodGrossAud: parseScreenAustraliaAud(
        attributes.get(view.grossAttribute),
      ),
      cumulativeGrossAud: parseScreenAustraliaAud(attributes.get("data-cume")),
      releaseWeeks: optionalAttribute(attributes, view.releaseAttribute),
    });
  }
  if (records.length === 0)
    throw new ScreenAustraliaParseError(
      `Screen Australia returned no valid rows for ${view.title}.`,
    );
  const ranks = records.map((record) => record.rank);
  if (new Set(ranks).size !== ranks.length)
    throw new ScreenAustraliaParseError(
      `Screen Australia returned duplicate ranks for ${view.title}.`,
    );
  if (records.length < view.maximumRows)
    warnings.push(
      `${view.title}: published ${records.length} of ${view.maximumRows} possible rows.`,
    );
  return { records, reportDate, rowsRead: rows.length, rowsSkipped, warnings };
}

export function parseScreenAustraliaWidgetHtml(
  html: string,
): ScreenAustraliaParsedWidget {
  if (!/<title>\s*Box Office Widget\s*<\/title>/i.test(html))
    throw new ScreenAustraliaParseError(
      "Screen Australia response was not the expected box-office widget.",
    );
  const parsed = VIEWS.map((view) => ({ view, result: parseView(html, view) }));
  return {
    records: parsed.flatMap(({ result }) => result.records),
    views: parsed.map(({ view, result }) => ({
      periodType: view.periodType,
      label: view.title,
      reportDate: result.reportDate,
      rowCount: result.records.length,
    })),
    rowsRead: parsed.reduce((sum, { result }) => sum + result.rowsRead, 0),
    rowsSkipped: parsed.reduce(
      (sum, { result }) => sum + result.rowsSkipped,
      0,
    ),
    warnings: parsed.flatMap(({ result }) => result.warnings),
  };
}
