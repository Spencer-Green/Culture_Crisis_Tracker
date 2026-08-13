export type BroadwayWeekValue = {
  weekEnding: Date;
  seasonWeekNumber: number;
  grossUsd: number;
  attendance: number;
  showCount: number | null;
  capacityPct: number | null;
  averageTicketPriceUsd: number | null;
};

export type BroadwayChartPoint = {
  date: string;
  grossUsd: number;
  attendance: number;
  showCount: number | null;
  capacityPct: number | null;
  averageTicketPriceUsd: number | null;
  rolling4GrossUsd: number | null;
  rolling4Attendance: number | null;
};

function percentChange(
  current: number,
  previous: number | null,
): number | null {
  if (previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function consecutiveWindow(
  records: readonly BroadwayWeekValue[],
  endIndex: number,
  size: number,
): BroadwayWeekValue[] | null {
  const values = records.slice(endIndex - size + 1, endIndex + 1);
  if (values.length !== size) return null;
  for (let index = 1; index < values.length; index += 1) {
    if (
      values[index].weekEnding.getTime() -
        values[index - 1].weekEnding.getTime() !==
      7 * 86_400_000
    )
      return null;
  }
  return values;
}

function sum(
  values: readonly BroadwayWeekValue[] | null,
  field: "grossUsd" | "attendance",
): number | null {
  return values?.reduce((total, record) => total + record[field], 0) ?? null;
}

function priorSeasonWeek(
  records: readonly BroadwayWeekValue[],
  latest: BroadwayWeekValue,
): BroadwayWeekValue | null {
  const target = latest.weekEnding.getTime() - 364 * 86_400_000;
  return (
    records
      .filter(
        (record) =>
          record.seasonWeekNumber === latest.seasonWeekNumber &&
          record.weekEnding < latest.weekEnding,
      )
      .sort(
        (left, right) =>
          Math.abs(left.weekEnding.getTime() - target) -
          Math.abs(right.weekEnding.getTime() - target),
      )[0] ?? null
  );
}

function averageTicket(record: BroadwayWeekValue): number | null {
  return (
    record.averageTicketPriceUsd ??
    (record.attendance > 0 ? record.grossUsd / record.attendance : null)
  );
}

function ytdSum(
  records: readonly BroadwayWeekValue[],
  year: number,
  throughMonth: number,
  throughDay: number,
  field: "grossUsd" | "attendance",
): number | null {
  const values = records.filter((record) => {
    const date = record.weekEnding;
    return (
      date.getUTCFullYear() === year &&
      (date.getUTCMonth() < throughMonth ||
        (date.getUTCMonth() === throughMonth &&
          date.getUTCDate() <= throughDay))
    );
  });
  if (values.length === 0) return null;
  return values.reduce((total, record) => total + record[field], 0);
}

function equivalentYtdSum(
  records: readonly BroadwayWeekValue[],
  year: number,
  latest: BroadwayWeekValue,
  field: "grossUsd" | "attendance",
): number | null {
  const yearRecords = records.filter(
    (record) => record.weekEnding.getUTCFullYear() === year,
  );
  if (
    yearRecords.length === 0 ||
    !yearRecords.some((record) => record.weekEnding.getUTCMonth() === 0)
  )
    return null;
  const through = yearRecords.find(
    (record) => record.seasonWeekNumber === latest.seasonWeekNumber,
  );
  if (!through) return null;
  return yearRecords
    .filter((record) => record.weekEnding <= through.weekEnding)
    .reduce((total, record) => total + record[field], 0);
}

export function buildBroadwayAnalytics(input: readonly BroadwayWeekValue[]) {
  const records = [...input].sort(
    (left, right) => left.weekEnding.getTime() - right.weekEnding.getTime(),
  );
  const latest = records.at(-1);
  if (!latest) return null;
  const previous = records.at(-2) ?? null;
  const yearAgo = priorSeasonWeek(records, latest);
  const latestIndex = records.length - 1;
  const rolling4 = consecutiveWindow(records, latestIndex, 4);
  const rolling13 = consecutiveWindow(records, latestIndex, 13);
  const latestYear = latest.weekEnding.getUTCFullYear();
  const month = latest.weekEnding.getUTCMonth();
  const day = latest.weekEnding.getUTCDate();
  const ytdGross = ytdSum(records, latestYear, month, day, "grossUsd");
  const ytdAttendance = ytdSum(records, latestYear, month, day, "attendance");
  const previousYtdGross = equivalentYtdSum(
    records,
    latestYear - 1,
    latest,
    "grossUsd",
  );
  const previousYtdAttendance = equivalentYtdSum(
    records,
    latestYear - 1,
    latest,
    "attendance",
  );
  const ytd2019Gross = equivalentYtdSum(records, 2019, latest, "grossUsd");
  const ytd2019Attendance = equivalentYtdSum(
    records,
    2019,
    latest,
    "attendance",
  );
  const comparable2019 = records.find(
    (record) =>
      record.weekEnding.getUTCFullYear() === 2019 &&
      record.seasonWeekNumber === latest.seasonWeekNumber,
  );
  const comparable2019Index = comparable2019
    ? records.indexOf(comparable2019)
    : -1;
  const rolling2019 =
    comparable2019Index >= 0
      ? consecutiveWindow(records, comparable2019Index, 4)
      : null;
  const chart: BroadwayChartPoint[] = records.map((record, index) => {
    const rolling = consecutiveWindow(records, index, 4);
    return {
      date: record.weekEnding.toISOString().slice(0, 10),
      grossUsd: record.grossUsd,
      attendance: record.attendance,
      showCount: record.showCount,
      capacityPct: record.capacityPct,
      averageTicketPriceUsd: averageTicket(record),
      rolling4GrossUsd: sum(rolling, "grossUsd"),
      rolling4Attendance: sum(rolling, "attendance"),
    };
  });
  const currentRolling4Gross = sum(rolling4, "grossUsd");
  const currentRolling4Attendance = sum(rolling4, "attendance");
  const comparison2019Gross = sum(rolling2019, "grossUsd");
  const comparison2019Attendance = sum(rolling2019, "attendance");
  return {
    latest,
    previous,
    yearAgo,
    grossWowPct: percentChange(latest.grossUsd, previous?.grossUsd ?? null),
    grossYoyPct: percentChange(latest.grossUsd, yearAgo?.grossUsd ?? null),
    attendanceWowPct: percentChange(
      latest.attendance,
      previous?.attendance ?? null,
    ),
    attendanceYoyPct: percentChange(
      latest.attendance,
      yearAgo?.attendance ?? null,
    ),
    showCountYoyPct:
      latest.showCount === null
        ? null
        : percentChange(latest.showCount, yearAgo?.showCount ?? null),
    capacityYoyPp:
      latest.capacityPct !== null && yearAgo?.capacityPct != null
        ? latest.capacityPct - yearAgo.capacityPct
        : null,
    averageTicketPriceUsd: averageTicket(latest),
    averageTicketYoyPct: percentChange(
      averageTicket(latest) ?? 0,
      yearAgo ? averageTicket(yearAgo) : null,
    ),
    grossPerShow:
      latest.showCount && latest.showCount > 0
        ? latest.grossUsd / latest.showCount
        : null,
    attendancePerShow:
      latest.showCount && latest.showCount > 0
        ? latest.attendance / latest.showCount
        : null,
    rolling4GrossUsd: currentRolling4Gross,
    rolling4Attendance: currentRolling4Attendance,
    rolling13GrossUsd: sum(rolling13, "grossUsd"),
    rolling13Attendance: sum(rolling13, "attendance"),
    rolling4Vs2019GrossPct: percentChange(
      currentRolling4Gross ?? 0,
      comparison2019Gross,
    ),
    rolling4Vs2019AttendancePct: percentChange(
      currentRolling4Attendance ?? 0,
      comparison2019Attendance,
    ),
    ytdGrossUsd: ytdGross,
    ytdAttendance,
    ytdGrossVsPreviousPct: percentChange(ytdGross ?? 0, previousYtdGross),
    ytdAttendanceVsPreviousPct: percentChange(
      ytdAttendance ?? 0,
      previousYtdAttendance,
    ),
    ytdGrossVs2019Pct: percentChange(ytdGross ?? 0, ytd2019Gross),
    ytdAttendanceVs2019Pct: percentChange(
      ytdAttendance ?? 0,
      ytd2019Attendance,
    ),
    chart,
  };
}
