const QUARTER_PATTERN = /^(\d{4})-Q([1-4])$/;

export type StatCanQuarterRange = {
  startQuarter: string;
  endQuarter: string;
  startDate: Date;
  endDate: Date;
};

export function parseStatCanQuarter(quarter: string): Date {
  const match = QUARTER_PATTERN.exec(quarter);
  if (!match) {
    throw new Error(
      `Invalid Statistics Canada quarter "${quarter}". Expected YYYY-Q1 to YYYY-Q4.`,
    );
  }
  return new Date(Date.UTC(Number(match[1]), (Number(match[2]) - 1) * 3, 1));
}

export function formatStatCanQuarter(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    throw new Error(
      "Invalid date supplied for a Statistics Canada quarterly period.",
    );
  }
  return `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
}

export function getStatCanQuarterBoundaries(quarter: string) {
  const periodStart = parseStatCanQuarter(quarter);
  const periodEnd = new Date(
    Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 3, 1) -
      1,
  );
  return { periodStart, periodEnd };
}

export function validateStatCanQuarterRange(
  startQuarter: string,
  endQuarter: string,
): StatCanQuarterRange {
  const startDate = parseStatCanQuarter(startQuarter);
  const endStart = parseStatCanQuarter(endQuarter);
  if (endStart < startDate) {
    throw new Error(
      "Statistics Canada ingestion end quarter must not precede start quarter.",
    );
  }
  const { periodEnd: endDate } = getStatCanQuarterBoundaries(endQuarter);
  return { startQuarter, endQuarter, startDate, endDate };
}
