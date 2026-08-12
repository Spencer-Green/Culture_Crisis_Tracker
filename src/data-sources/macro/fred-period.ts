const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseFredDate(value: string): Date {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match)
    throw new Error(`Invalid FRED date "${value}"; expected YYYY-MM-DD.`);
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  if (
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() !== Number(match[2]) - 1 ||
    date.getUTCDate() !== Number(match[3])
  ) {
    throw new Error(`Invalid FRED date "${value}"; expected YYYY-MM-DD.`);
  }
  return date;
}

export function formatFredDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function normaliseFredPeriod(
  sourceDate: string,
  periodType: "monthly" | "quarterly",
): { periodStart: Date; periodEnd: Date } {
  const parsed = parseFredDate(sourceDate);
  const year = parsed.getUTCFullYear();
  const month = parsed.getUTCMonth();
  if (periodType === "monthly") {
    return {
      periodStart: new Date(Date.UTC(year, month, 1)),
      periodEnd: new Date(Date.UTC(year, month + 1, 1) - 1),
    };
  }
  const quarterStartMonth = Math.floor(month / 3) * 3;
  return {
    periodStart: new Date(Date.UTC(year, quarterStartMonth, 1)),
    periodEnd: new Date(Date.UTC(year, quarterStartMonth + 3, 1) - 1),
  };
}

export function validateFredDateRange(start: string, end: string) {
  const startDate = parseFredDate(start);
  const endDate = parseFredDate(end);
  if (endDate < startDate) {
    throw new Error("FRED end date must not precede start date.");
  }
  return { startDate, endDate, startPeriod: start, endPeriod: end };
}
