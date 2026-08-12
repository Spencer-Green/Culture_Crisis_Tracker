const YEAR_PATTERN = /^\d{4}$/;

export type EurostatYearRange = {
  startYear: string;
  endYear: string;
  startDate: Date;
  endDate: Date;
};

export function parseEurostatYear(year: string): Date {
  if (!YEAR_PATTERN.test(year)) {
    throw new Error(`Invalid Eurostat year "${year}". Expected YYYY.`);
  }
  return new Date(Date.UTC(Number(year), 0, 1));
}

export function formatEurostatYear(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date supplied for a Eurostat annual period.");
  }
  return String(date.getUTCFullYear());
}

export function getEurostatYearBoundaries(year: string) {
  const periodStart = parseEurostatYear(year);
  const periodEnd = new Date(
    Date.UTC(periodStart.getUTCFullYear() + 1, 0, 1) - 1,
  );
  return { periodStart, periodEnd };
}

export function validateEurostatYearRange(
  startYear: string,
  endYear: string,
): EurostatYearRange {
  const startDate = parseEurostatYear(startYear);
  const endDate = parseEurostatYear(endYear);
  if (endDate < startDate) {
    throw new Error("Eurostat ingestion end year must not precede start year.");
  }
  return { startYear, endYear, startDate, endDate };
}
