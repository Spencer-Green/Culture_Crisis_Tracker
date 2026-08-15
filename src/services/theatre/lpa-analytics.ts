import type { LPACategory } from "@/data-sources/theatre/lpa-types";

export type LPAPerformanceValue = {
  year: number;
  category: LPACategory;
  categoryLabel: string;
  revenueAud: number | null;
  attendance: number | null;
  averageTicketPriceAud: number | null;
};

export type LPAPerformanceChartPoint = {
  year: number;
  revenueAud: number | null;
  attendance: number | null;
  averageTicketPriceAud: number | null;
};

function percentChange(current: number | null, previous: number | null) {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function buildCategoryAnalytics(input: readonly LPAPerformanceValue[]) {
  const records = [...input].sort((left, right) => left.year - right.year);
  const latest = records.at(-1);
  if (!latest) return null;
  const previous = records.at(-2) ?? null;
  const baseline2019 = records.find((record) => record.year === 2019) ?? null;
  return {
    latest,
    previous,
    baseline2019,
    revenueChangePct: percentChange(
      latest.revenueAud,
      previous?.revenueAud ?? null,
    ),
    attendanceChangePct: percentChange(
      latest.attendance,
      previous?.attendance ?? null,
    ),
    averageTicketPriceChangePct: percentChange(
      latest.averageTicketPriceAud,
      previous?.averageTicketPriceAud ?? null,
    ),
    revenueVs2019Pct: percentChange(
      latest.revenueAud,
      baseline2019?.revenueAud ?? null,
    ),
    attendanceVs2019Pct: percentChange(
      latest.attendance,
      baseline2019?.attendance ?? null,
    ),
    chart: records.map<LPAPerformanceChartPoint>((record) => ({
      year: record.year,
      revenueAud: record.revenueAud,
      attendance: record.attendance,
      averageTicketPriceAud: record.averageTicketPriceAud,
    })),
  };
}

function combineCategories(
  theatre: readonly LPAPerformanceValue[],
  musicalTheatre: readonly LPAPerformanceValue[],
) {
  const theatreByYear = new Map(theatre.map((record) => [record.year, record]));
  const musicalByYear = new Map(
    musicalTheatre.map((record) => [record.year, record]),
  );
  const commonYears = [...theatreByYear.keys()]
    .filter((year) => musicalByYear.has(year))
    .sort((left, right) => left - right);
  return commonYears.flatMap<LPAPerformanceValue>((year) => {
    const left = theatreByYear.get(year)!;
    const right = musicalByYear.get(year)!;
    if (
      left.revenueAud === null ||
      right.revenueAud === null ||
      left.attendance === null ||
      right.attendance === null
    )
      return [];
    return [
      {
        year,
        category: "THEATRE",
        categoryLabel: "Theatre + Musical Theatre",
        revenueAud: left.revenueAud + right.revenueAud,
        attendance: left.attendance + right.attendance,
        averageTicketPriceAud: null,
      },
    ];
  });
}

export function buildLPAPerformanceAnalytics(
  input: readonly LPAPerformanceValue[],
) {
  const theatreRecords = input.filter(
    (record) => record.category === "THEATRE",
  );
  const musicalTheatreRecords = input.filter(
    (record) => record.category === "MUSICAL_THEATRE",
  );
  return {
    theatre: buildCategoryAnalytics(theatreRecords),
    musicalTheatre: buildCategoryAnalytics(musicalTheatreRecords),
    combined: buildCategoryAnalytics(
      combineCategories(theatreRecords, musicalTheatreRecords),
    ),
  };
}
