import {
  LPA_ACCESS_CLASSIFICATION,
  LPA_CATEGORIES,
  LPA_GEOGRAPHY_SCOPE,
  type LPAArchiveReport,
  type LPAInspection,
  type LPAPerformanceYearRecord,
} from "@/data-sources/theatre/lpa-types";

export class LPAParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LPAParseError";
  }
}

function cleanHtmlText(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePublicationDate(value: string) {
  const match = value.trim().match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!match) return null;
  const month = [
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
  ].indexOf(match[1].slice(0, 3).toLowerCase());
  const year = Number(match[2]);
  return month >= 0 && Number.isInteger(year)
    ? new Date(Date.UTC(year, month, 1))
    : null;
}

export function parseLPAArchiveIndex(html: string, archiveUrl: string) {
  const reports: LPAArchiveReport[] = [];
  const pattern =
    /<li\s+id="ticket-survey-(\d{4})"[^>]*>[\s\S]*?<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<span\s+class="pub">Published\s+([^<]+)<\/span>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    const reportYear = Number(match[1]);
    const reportUrl = new URL(match[2], archiveUrl).toString();
    reports.push({
      reportYear,
      title: cleanHtmlText(match[3]),
      reportUrl,
      publishedAt: parsePublicationDate(match[4]),
    });
  }
  if (!reports.length)
    throw new LPAParseError("LPA report archive contained no annual reports.");
  return reports.sort((left, right) => left.reportYear - right.reportYear);
}

export function parseLPAReportBundleUrl(html: string, reportUrl: string) {
  const matches = [...html.matchAll(/(?:href|src)="(js\/app\.[^"]+\.js)"/g)];
  const bundleUrls = [
    ...new Set(matches.map((match) => new URL(match[1], reportUrl).toString())),
  ];
  if (bundleUrls.length !== 1)
    throw new LPAParseError(
      `Expected one LPA application bundle; found ${bundleUrls.length}.`,
    );
  return bundleUrls[0];
}

function parseArray(value: string, field: string) {
  const parsed = value.split(",").map((item) => {
    const normalized = item.trim().replace(/^['"]|['"]$/g, "");
    if (!normalized)
      throw new LPAParseError(`LPA ${field} contains a missing value.`);
    const number = Number(normalized);
    if (!Number.isFinite(number))
      throw new LPAParseError(`LPA ${field} contains a non-numeric value.`);
    return number;
  });
  if (!parsed.length) throw new LPAParseError(`LPA ${field} is empty.`);
  return parsed;
}

function exactMatch(value: string, pattern: RegExp, field: string) {
  const match = value.match(pattern);
  if (!match) throw new LPAParseError(`LPA static report is missing ${field}.`);
  return match[1];
}

function parseAverageTicketPrices(narrative: string): Map<number, number> {
  const matches = [
    ...narrative.matchAll(
      /average ticket price[^$]*\$([0-9.]+) in (\d{4}) to \$([0-9.]+) in (\d{4})/gi,
    ),
  ];
  const latest = matches.at(-1);
  if (!latest) return new Map();
  return new Map([
    [Number(latest[2]), Number(latest[1])],
    [Number(latest[4]), Number(latest[3])],
  ]);
}

function parseCategory(
  bundle: string,
  category: (typeof LPA_CATEGORIES)[number],
  report: LPAArchiveReport,
  bundleUrl: string,
) {
  const marker = `Categories ${category.label} Final.pdf`;
  const markerIndex = bundle.indexOf(marker);
  if (markerIndex < 0)
    throw new LPAParseError(`LPA bundle is missing ${category.label}.`);
  const chartIndex = bundle.indexOf("totalRevenueAttendance:", markerIndex);
  if (chartIndex < 0 || chartIndex - markerIndex > 3_000)
    throw new LPAParseError(
      `LPA bundle is missing ${category.label} chart data.`,
    );
  const narrative = bundle.slice(Math.max(0, markerIndex - 9_000), markerIndex);
  const chart = bundle.slice(chartIndex, chartIndex + 8_000);
  const years = parseArray(
    exactMatch(chart, /xAxis:\[\{categories:\[([^\]]+)\]/, "year labels"),
    "year labels",
  );
  const revenue = parseArray(
    exactMatch(
      chart,
      /series:\[\{name:"Revenue",type:"column",data:\[([^\]]+)\]/,
      "revenue series",
    ),
    "revenue series",
  );
  const attendance = parseArray(
    exactMatch(
      chart,
      /\{name:"Attendance",type:"column",yAxis:1,data:\[([^\]]+)\]/,
      "attendance series",
    ),
    "attendance series",
  );
  if (years.length !== revenue.length || years.length !== attendance.length)
    throw new LPAParseError(
      `LPA ${category.label} chart arrays have incompatible lengths.`,
    );
  if (years.at(-1) !== report.reportYear)
    throw new LPAParseError(
      `LPA ${category.label} history does not end in report year ${report.reportYear}.`,
    );
  const ticketPrices = parseAverageTicketPrices(narrative);
  return years.map<LPAPerformanceYearRecord>((year, index) => ({
    year,
    category: category.code,
    categoryLabel: category.label,
    geographyScope: LPA_GEOGRAPHY_SCOPE,
    revenueAud: Math.round(revenue[index] * 1_000_000),
    attendance: Math.round(attendance[index] * 1_000_000),
    averageTicketPriceAud: ticketPrices.get(year) ?? null,
    sourceReportTitle: report.title,
    sourceReportUrl: report.reportUrl,
    sourceBundleUrl: bundleUrl,
    sourcePublishedAt: report.publishedAt,
  }));
}

export function parseLPAReportBundle(
  bundle: string,
  input: {
    archiveUrl: string;
    report: LPAArchiveReport;
    bundleUrl: string;
    latencyMs?: number;
  },
): LPAInspection {
  const records = LPA_CATEGORIES.flatMap((category) =>
    parseCategory(bundle, category, input.report, input.bundleUrl),
  ).sort(
    (left, right) =>
      left.year - right.year || left.category.localeCompare(right.category),
  );
  const years = [...new Set(records.map((record) => record.year))].sort(
    (left, right) => left - right,
  );
  const earliestYear = years[0];
  const latestYear = years.at(-1)!;
  const observed = new Set(years);
  const missingYears = Array.from(
    { length: latestYear - earliestYear + 1 },
    (_, index) => earliestYear + index,
  ).filter((year) => !observed.has(year));
  return {
    accessClassification: LPA_ACCESS_CLASSIFICATION,
    archiveUrl: input.archiveUrl,
    report: input.report,
    bundleUrl: input.bundleUrl,
    requestCount: 3,
    records,
    categories: LPA_CATEGORIES.map((category) => ({ ...category })),
    earliestYear,
    latestYear,
    missingYears,
    units: {
      revenue: "millions of nominal AUD; normalized to AUD",
      attendance: "millions of tickets issued; normalized to tickets",
      averageTicketPrice: "nominal AUD; only retained when explicit",
    },
    comparabilityNotes: [
      "LPA category coverage depends on participating ticketing providers and events in market.",
      "Pandemic-affected years are preserved without interpolation.",
      "The 2024 report notes that 2018 figures were revised for a source-data error.",
      "Regional reporting was introduced in 2024 and is not treated as a historical series.",
    ],
    latencyMs: input.latencyMs ?? 0,
  };
}
