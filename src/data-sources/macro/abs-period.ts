const PERIOD_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const QUARTER_PATTERN = /^(\d{4})-Q([1-4])$/;

export type AbsPeriodRange = {
  startPeriod: string;
  endPeriod: string;
  startDate: Date;
  endDate: Date;
};

export function parseAbsPeriod(period: string): Date {
  const match = PERIOD_PATTERN.exec(period);
  if (!match) {
    throw new Error(`Invalid period "${period}". Expected YYYY-MM.`);
  }

  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
}

export function formatAbsPeriod(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date supplied for an ABS monthly period.");
  }

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}`;
}

export function getAbsMonthBoundaries(period: string): {
  periodStart: Date;
  periodEnd: Date;
} {
  const periodStart = parseAbsPeriod(period);
  const periodEnd = new Date(
    Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 1) -
      1,
  );

  return { periodStart, periodEnd };
}

export function parseAbsQuarter(period: string): Date {
  const match = QUARTER_PATTERN.exec(period);
  if (!match) {
    throw new Error(`Invalid period "${period}". Expected YYYY-Qn.`);
  }
  return new Date(Date.UTC(Number(match[1]), (Number(match[2]) - 1) * 3, 1));
}

export function formatAbsQuarter(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date supplied for an ABS quarterly period.");
  }
  return `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
}

export function getAbsQuarterBoundaries(period: string): {
  periodStart: Date;
  periodEnd: Date;
} {
  const periodStart = parseAbsQuarter(period);
  const periodEnd = new Date(
    Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 3, 1) -
      1,
  );
  return { periodStart, periodEnd };
}

export function validateAbsQuarterRange(
  startPeriod: string,
  endPeriod: string,
): AbsPeriodRange {
  const startDate = parseAbsQuarter(startPeriod);
  const { periodEnd: endDate } = getAbsQuarterBoundaries(endPeriod);
  if (endDate < startDate) {
    throw new Error("ABS ingestion end period must not precede start period.");
  }
  return { startPeriod, endPeriod, startDate, endDate };
}

export function validateAbsPeriodRange(
  startPeriod: string,
  endPeriod: string,
): AbsPeriodRange {
  const startDate = parseAbsPeriod(startPeriod);
  const endDate = parseAbsPeriod(endPeriod);

  if (endDate < startDate) {
    throw new Error("ABS ingestion end period must not precede start period.");
  }

  return { startPeriod, endPeriod, startDate, endDate };
}

export function getDefaultAbsPeriodRange(now = new Date()): AbsPeriodRange {
  const endDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
  );
  const startDate = new Date(
    Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth() - 11, 1),
  );

  return validateAbsPeriodRange(
    formatAbsPeriod(startDate),
    formatAbsPeriod(endDate),
  );
}
