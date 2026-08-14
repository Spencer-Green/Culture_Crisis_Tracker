export type MVTCliOptions = { year?: number };

export function parseMVTCli(args: readonly string[]): MVTCliOptions {
  let year: number | undefined;
  for (const arg of args) {
    if (!arg.startsWith("--year=")) throw new Error(`Unknown argument: ${arg}`);
    const value = arg.slice("--year=".length);
    if (!/^\d{4}$/.test(value))
      throw new Error("--year must be a four-digit year.");
    year = Number(value);
  }
  if (year !== undefined && (year < 2023 || year > 2025))
    throw new Error("--year must be an available MVT report year (2023-2025).");
  return { year };
}
