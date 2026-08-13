export function parseUSBoxOfficeCli(argv: readonly string[]): {
  startYear: number;
} {
  let startYear = 2015;
  for (const argument of argv) {
    const match = /^--start=(\d{4})$/.exec(argument);
    if (!match)
      throw new Error(`Invalid argument "${argument}". Use --start=YYYY.`);
    startYear = Number(match[1]);
  }
  if (startYear < 1977 || startYear > new Date().getUTCFullYear())
    throw new Error("start must be between 1977 and the current year.");
  return { startYear };
}
