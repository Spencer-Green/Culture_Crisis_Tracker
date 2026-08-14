export type BFIWeekendInput = {
  weekendStart: Date;
  weekendEnd: Date;
  reportedGrossGbp: number;
  top15GrossGbp: number;
  releaseCount: number;
  topFilm: string | null;
  topFilmGrossGbp: number | null;
  top3GrossGbp: number | null;
  top5GrossGbp: number | null;
  top10GrossGbp: number | null;
};

export type BFIStructuralInput = {
  year: number;
  cinemaAdmissionsMillions: number | null;
  ukBoxOfficeGrossGbpM: number | null;
  releaseCount: number | null;
  filmProductionSpendGbpM: number | null;
  filmProductionCount: number | null;
};

export type BFIBoxOfficeChartPoint = {
  date: string;
  weeklyGrossGbp: number;
  rolling4WeekGrossGbp: number | null;
  topFilm: string | null;
};

function chronological<T extends { weekendEnd: Date }>(records: readonly T[]) {
  return [...records].sort(
    (left, right) => left.weekendEnd.getTime() - right.weekendEnd.getTime(),
  );
}

function percentChange(current: number | null, previous: number | null) {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function isConsecutive(records: readonly BFIWeekendInput[]) {
  return records.slice(1).every((record, index) => {
    const gap =
      record.weekendEnd.getTime() - records[index].weekendEnd.getTime();
    return gap >= 5 * 86_400_000 && gap <= 10 * 86_400_000;
  });
}

export function bfiRollingGross(
  records: readonly BFIWeekendInput[],
  windowSize: number,
) {
  if (records.length < windowSize) return null;
  const window = chronological(records).slice(-windowSize);
  if (!isConsecutive(window)) return null;
  return window.reduce((total, record) => total + record.reportedGrossGbp, 0);
}

function isoWeek(date: Date) {
  const current = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = current.getUTCDay() || 7;
  current.setUTCDate(current.getUTCDate() + 4 - day);
  const year = current.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(
    ((current.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return { year, week };
}

export function equivalentBFIYtdGross(
  records: readonly BFIWeekendInput[],
  year: number,
  throughWeek: number,
) {
  const comparable = records.filter((record) => {
    const period = isoWeek(record.weekendEnd);
    return period.year === year && period.week <= throughWeek;
  });
  return comparable.length
    ? comparable.reduce((total, record) => total + record.reportedGrossGbp, 0)
    : null;
}

function trailingGross(
  records: readonly BFIWeekendInput[],
  latest: Date,
  weeks: number,
) {
  const lower = latest.getTime() - weeks * 7 * 86_400_000;
  return records
    .filter(
      (record) =>
        record.weekendEnd.getTime() > lower && record.weekendEnd <= latest,
    )
    .reduce((total, record) => total + record.reportedGrossGbp, 0);
}

function share(part: number | null, total: number) {
  return part === null || total === 0 ? null : (part / total) * 100;
}

export function buildBFIAnalytics(
  weeklyInput: readonly BFIWeekendInput[],
  structuralInput: readonly BFIStructuralInput[],
) {
  const records = chronological(weeklyInput);
  const latest = records.at(-1) ?? null;
  if (!latest) return null;
  const previous = records.at(-2) ?? null;
  const latestPeriod = isoWeek(latest.weekendEnd);
  const yearAgo =
    records.find((record) => {
      const period = isoWeek(record.weekendEnd);
      return (
        period.year === latestPeriod.year - 1 &&
        period.week === latestPeriod.week
      );
    }) ?? null;
  const currentYtd = equivalentBFIYtdGross(
    records,
    latestPeriod.year,
    latestPeriod.week,
  );
  const previousYtd = equivalentBFIYtdGross(
    records,
    latestPeriod.year - 1,
    latestPeriod.week,
  );
  const ytd2019 = equivalentBFIYtdGross(records, 2019, latestPeriod.week);
  const chart: BFIBoxOfficeChartPoint[] = records.map((record, index) => ({
    date: record.weekendEnd.toISOString().slice(0, 10),
    weeklyGrossGbp: record.reportedGrossGbp,
    rolling4WeekGrossGbp: bfiRollingGross(records.slice(0, index + 1), 4),
    topFilm: record.topFilm,
  }));
  const structural = [...structuralInput].sort(
    (left, right) => left.year - right.year,
  );
  const latestStructural = structural.at(-1) ?? null;
  const previousStructural = structural.at(-2) ?? null;
  const structural2019 =
    structural.find((record) => record.year === 2019) ?? null;
  return {
    latest,
    previous,
    yearAgo,
    wowPct:
      previous && isConsecutive([previous, latest])
        ? percentChange(latest.reportedGrossGbp, previous.reportedGrossGbp)
        : null,
    yoyPct: percentChange(
      latest.reportedGrossGbp,
      yearAgo?.reportedGrossGbp ?? null,
    ),
    rolling4WeekGrossGbp: bfiRollingGross(records, 4),
    trailing52WeekGrossGbp: trailingGross(records, latest.weekendEnd, 52),
    ytdGrossGbp: currentYtd,
    ytdVsPreviousYearPct: percentChange(currentYtd, previousYtd),
    ytdVs2019Pct: percentChange(currentYtd, ytd2019),
    topFilmSharePct: share(latest.topFilmGrossGbp, latest.reportedGrossGbp),
    top3SharePct: share(latest.top3GrossGbp, latest.reportedGrossGbp),
    top5SharePct: share(latest.top5GrossGbp, latest.reportedGrossGbp),
    chart,
    structural: latestStructural
      ? {
          latest: latestStructural,
          admissionsYoyPct: percentChange(
            latestStructural.cinemaAdmissionsMillions,
            previousStructural?.cinemaAdmissionsMillions ?? null,
          ),
          admissionsVs2019Pct: percentChange(
            latestStructural.cinemaAdmissionsMillions,
            structural2019?.cinemaAdmissionsMillions ?? null,
          ),
          productionSpendYoyPct: percentChange(
            latestStructural.filmProductionSpendGbpM,
            previousStructural?.filmProductionSpendGbpM ?? null,
          ),
        }
      : null,
  };
}
