export class GamingCliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GamingCliError";
  }
}

function parseIsoDate(value: string, name: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new GamingCliError(`${name} must use YYYY-MM-DD.`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new GamingCliError(`${name} is not a valid calendar date.`);
  }
  return date;
}

function argumentsMap(arguments_: readonly string[]): Map<string, string> {
  const values = new Map<string, string>();
  for (const argument of arguments_) {
    const match = /^--([^=]+)=(.+)$/.exec(argument);
    if (!match) throw new GamingCliError(`Unsupported argument "${argument}".`);
    values.set(match[1], match[2]);
  }
  return values;
}

export function parseIgdbCliArguments(
  arguments_: readonly string[],
  now = new Date(),
): {
  startDate: Date;
  endDateExclusive: Date;
  startPeriod: string;
  endPeriod: string;
} {
  const values = argumentsMap(arguments_);
  for (const key of values.keys()) {
    if (key !== "start" && key !== "end") {
      throw new GamingCliError(`Unsupported IGDB argument "--${key}".`);
    }
  }
  const startPeriod = values.get("start") ?? "2019-01-01";
  const defaultEnd = new Date(now);
  defaultEnd.setUTCDate(defaultEnd.getUTCDate() + 180);
  const endPeriod = values.get("end") ?? defaultEnd.toISOString().slice(0, 10);
  const startDate = parseIsoDate(startPeriod, "--start");
  const endDate = parseIsoDate(endPeriod, "--end");
  if (endDate < startDate)
    throw new GamingCliError("--end must not precede --start.");
  const endDateExclusive = new Date(endDate);
  endDateExclusive.setUTCDate(endDateExclusive.getUTCDate() + 1);
  return { startDate, endDateExclusive, startPeriod, endPeriod };
}

export function parseSteamCliArguments(
  arguments_: readonly string[],
  now = new Date(),
): { limit: number; offset: number; capturedAt: Date } {
  const values = argumentsMap(arguments_);
  for (const key of values.keys()) {
    if (key !== "limit" && key !== "offset" && key !== "captured-at") {
      throw new GamingCliError(`Unsupported Steam argument "--${key}".`);
    }
  }
  const limit = Number(values.get("limit") ?? 100);
  const offset = Number(values.get("offset") ?? 0);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) {
    throw new GamingCliError("--limit must be an integer from 1 to 1000.");
  }
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new GamingCliError("--offset must be a non-negative integer.");
  }
  const suppliedCapture = values.get("captured-at");
  const capture = suppliedCapture ? new Date(suppliedCapture) : new Date(now);
  if (Number.isNaN(capture.getTime())) {
    throw new GamingCliError("--captured-at must be an ISO-8601 timestamp.");
  }
  capture.setUTCMinutes(0, 0, 0);
  return { limit, offset, capturedAt: capture };
}
