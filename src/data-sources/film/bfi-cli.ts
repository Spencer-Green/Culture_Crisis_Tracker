export type BFICliOptions = { sinceYear: number };

export function parseBFICli(
  args: readonly string[],
  currentYear = new Date().getUTCFullYear(),
): BFICliOptions {
  let sinceYear = currentYear;
  for (const arg of args) {
    if (!arg.startsWith("--since="))
      throw new Error(`Unknown argument: ${arg}`);
    const value = arg.slice("--since=".length);
    if (!/^\d{4}$/.test(value))
      throw new Error("--since must be a four-digit year.");
    sinceYear = Number(value);
  }
  if (sinceYear < 2017 || sinceYear > currentYear)
    throw new Error(`--since must be between 2017 and ${currentYear}.`);
  return { sinceYear };
}
