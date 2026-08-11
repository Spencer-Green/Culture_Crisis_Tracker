const PERIOD_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

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
