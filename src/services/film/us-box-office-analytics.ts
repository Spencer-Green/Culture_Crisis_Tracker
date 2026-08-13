export type BoxOfficeWeekendInput = {
  sourceYear: number;
  weekNumber: number;
  weekendStart: Date;
  weekendEnd: Date;
  totalGrossUsd: number;
  top10GrossUsd: number | null;
  sourceWowChangePct: number | null;
  sourceWowChangeLabel?: string | null;
  releaseCount: number | null;
  topFilm: string | null;
};

export type BoxOfficeChartPoint = {
  date: string;
  weeklyGrossUsd: number;
  rolling4WeekGrossUsd: number | null;
  topFilm: string | null;
};

function percentChange(
  current: number,
  previous: number | null,
): number | null {
  if (previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function chronological(records: readonly BoxOfficeWeekendInput[]) {
  return [...records].sort(
    (left, right) => left.weekendEnd.getTime() - right.weekendEnd.getTime(),
  );
}

function isConsecutive(records: readonly BoxOfficeWeekendInput[]): boolean {
  return records.slice(1).every((record, index) => {
    const gap =
      record.weekendEnd.getTime() - records[index].weekendEnd.getTime();
    return gap >= 5 * 86_400_000 && gap <= 10 * 86_400_000;
  });
}

export function rollingGross(
  records: readonly BoxOfficeWeekendInput[],
  windowSize: number,
): number | null {
  if (records.length < windowSize) return null;
  const window = chronological(records).slice(-windowSize);
  if (!isConsecutive(window)) return null;
  return window.reduce((total, record) => total + record.totalGrossUsd, 0);
}

export function trailingGross(
  records: readonly BoxOfficeWeekendInput[],
  latestDate: Date,
  weeks: number,
): number {
  const lowerBound = latestDate.getTime() - weeks * 7 * 86_400_000;
  return records
    .filter(
      (record) =>
        record.weekendEnd.getTime() > lowerBound &&
        record.weekendEnd.getTime() <= latestDate.getTime(),
    )
    .reduce((total, record) => total + record.totalGrossUsd, 0);
}

export function equivalentYearToDateGross(
  records: readonly BoxOfficeWeekendInput[],
  sourceYear: number,
  throughWeekNumber: number,
): number | null {
  const comparable = records.filter(
    (record) =>
      record.sourceYear === sourceYear &&
      record.weekNumber <= throughWeekNumber,
  );
  return comparable.length > 0
    ? comparable.reduce((total, record) => total + record.totalGrossUsd, 0)
    : null;
}

export function buildUSBoxOfficeAnalytics(
  input: readonly BoxOfficeWeekendInput[],
) {
  const records = chronological(input);
  const latest = records.at(-1) ?? null;
  if (!latest) return null;
  const previous = records.at(-2) ?? null;
  const yearAgo = records.find(
    (record) =>
      record.sourceYear === latest.sourceYear - 1 &&
      record.weekNumber === latest.weekNumber,
  );
  const currentYtd = equivalentYearToDateGross(
    records,
    latest.sourceYear,
    latest.weekNumber,
  );
  const previousYtd = equivalentYearToDateGross(
    records,
    latest.sourceYear - 1,
    latest.weekNumber,
  );
  const ytd2019 = equivalentYearToDateGross(records, 2019, latest.weekNumber);
  const chart: BoxOfficeChartPoint[] = records.map((record, index) => ({
    date: record.weekendEnd.toISOString().slice(0, 10),
    weeklyGrossUsd: record.totalGrossUsd,
    rolling4WeekGrossUsd: rollingGross(records.slice(0, index + 1), 4),
    topFilm: record.topFilm,
  }));
  return {
    latest,
    previous,
    yearAgo: yearAgo ?? null,
    wowPct:
      previous && isConsecutive([previous, latest])
        ? percentChange(latest.totalGrossUsd, previous.totalGrossUsd)
        : null,
    yoyPct: percentChange(latest.totalGrossUsd, yearAgo?.totalGrossUsd ?? null),
    rolling4WeekGrossUsd: rollingGross(records, 4),
    trailing52WeekGrossUsd: trailingGross(records, latest.weekendEnd, 52),
    ytdGrossUsd: currentYtd,
    ytdVsPreviousYearPct:
      currentYtd === null ? null : percentChange(currentYtd, previousYtd),
    ytdVs2019Pct:
      currentYtd === null ? null : percentChange(currentYtd, ytd2019),
    previousYearEquivalentYtdGrossUsd: previousYtd,
    equivalent2019YtdGrossUsd: ytd2019,
    chart,
  };
}
