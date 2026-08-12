const BEA_MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const BEA_API_MONTH_PATTERN = /^(\d{4})M(0[1-9]|1[0-2])$/;

export type BeaMonthRange = {
  startPeriod: string;
  endPeriod: string;
  startDate: Date;
  endDate: Date;
};

export function parseBeaMonth(period: string): Date {
  const match = BEA_MONTH_PATTERN.exec(period);
  if (!match) {
    throw new Error(`Invalid BEA month "${period}"; expected YYYY-MM.`);
  }
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
}

export function parseBeaApiMonth(period: string): {
  periodStart: Date;
  periodEnd: Date;
  normalisedPeriod: string;
} {
  const match = BEA_API_MONTH_PATTERN.exec(period);
  if (!match) {
    throw new Error("BEA returned an invalid monthly period.");
  }
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  return {
    periodStart: new Date(Date.UTC(year, monthIndex, 1)),
    periodEnd: new Date(Date.UTC(year, monthIndex + 1, 1) - 1),
    normalisedPeriod: `${match[1]}-${match[2]}`,
  };
}

export function formatBeaMonth(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function validateBeaMonthRange(
  startPeriod: string,
  endPeriod: string,
): BeaMonthRange {
  const startDate = parseBeaMonth(startPeriod);
  const endDate = parseBeaMonth(endPeriod);
  if (endDate < startDate) {
    throw new Error("BEA end month must not precede start month.");
  }
  return { startPeriod, endPeriod, startDate, endDate };
}

export function getBeaYears(startDate: Date, endDate: Date): string[] {
  const years: string[] = [];
  for (
    let year = startDate.getUTCFullYear();
    year <= endDate.getUTCFullYear();
    year += 1
  ) {
    years.push(String(year));
  }
  return years;
}
