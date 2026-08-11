const QUARTER_PATTERN = /^(\d{4})-Q([1-4])$/;

export type OnsQuarterRange = {
  startQuarter: string;
  endQuarter: string;
  startDate: Date;
  endDate: Date;
};

export function parseOnsQuarter(quarter: string): Date {
  const match = QUARTER_PATTERN.exec(quarter);
  if (!match) {
    throw new Error(
      `Invalid quarter "${quarter}". Expected YYYY-Q1 to YYYY-Q4.`,
    );
  }

  return new Date(Date.UTC(Number(match[1]), (Number(match[2]) - 1) * 3, 1));
}

export function formatOnsQuarter(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date supplied for an ONS quarterly period.");
  }

  return `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
}

export function getOnsQuarterBoundaries(quarter: string): {
  periodStart: Date;
  periodEnd: Date;
} {
  const periodStart = parseOnsQuarter(quarter);
  const periodEnd = new Date(
    Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 3, 1) -
      1,
  );

  return { periodStart, periodEnd };
}

export function validateOnsQuarterRange(
  startQuarter: string,
  endQuarter: string,
): OnsQuarterRange {
  const startDate = parseOnsQuarter(startQuarter);
  const endDate = parseOnsQuarter(endQuarter);

  if (endDate < startDate) {
    throw new Error(
      "ONS ingestion end quarter must not precede start quarter.",
    );
  }

  return { startQuarter, endQuarter, startDate, endDate };
}

export function getRecentOnsQuarterRange(
  latestQuarter: string,
  quarterCount = 8,
): OnsQuarterRange {
  if (!Number.isInteger(quarterCount) || quarterCount < 1) {
    throw new Error("ONS recent quarter count must be a positive integer.");
  }

  const endDate = parseOnsQuarter(latestQuarter);
  const startDate = new Date(
    Date.UTC(
      endDate.getUTCFullYear(),
      endDate.getUTCMonth() - (quarterCount - 1) * 3,
      1,
    ),
  );

  return validateOnsQuarterRange(
    formatOnsQuarter(startDate),
    formatOnsQuarter(endDate),
  );
}
