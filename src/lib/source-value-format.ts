const CURRENCY_SYMBOLS = {
  USD: "$",
  AUD: "A$",
  GBP: "£",
} as const;

export type SupportedCurrency = keyof typeof CURRENCY_SYMBOLS;

export type PublishedValuePresentation = {
  headline: string;
  descriptor: string;
  sourceUnit: string;
  annualized: boolean;
};

function trimTrailingZeros(value: string): string {
  return value.replace(/(\.\d*?[1-9])0+$|\.0+$/u, "$1");
}

function compactPrecision(value: number, scale: "T" | "B" | "M"): number {
  if (scale === "T") {
    return 2;
  }
  if (scale === "B") {
    return Math.abs(value) >= 100 ? 1 : 2;
  }
  return Math.abs(value) >= 100 ? 0 : 1;
}

export function formatMillions(
  value: number,
  currency: SupportedCurrency,
): string {
  if (!Number.isFinite(value)) {
    return String(value);
  }

  const absoluteValue = Math.abs(value);
  const { scaledValue, scale } =
    absoluteValue >= 1_000_000
      ? { scaledValue: value / 1_000_000, scale: "T" as const }
      : absoluteValue >= 1_000
        ? { scaledValue: value / 1_000, scale: "B" as const }
        : { scaledValue: value, scale: "M" as const };
  const precision = compactPrecision(scaledValue, scale);
  const formatted = trimTrailingZeros(
    new Intl.NumberFormat("en-US", {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    }).format(scaledValue),
  );

  return `${CURRENCY_SYMBOLS[currency]}${formatted}${scale}`;
}

function currencyFromUnit(unit: string): SupportedCurrency | null {
  return (
    (Object.keys(CURRENCY_SYMBOLS) as SupportedCurrency[]).find((currency) =>
      unit.includes(currency),
    ) ?? null
  );
}

function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPublishedValue(
  rawValue: string,
  unit: string,
  locale = "en-AU",
): PublishedValuePresentation {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return {
      headline: rawValue,
      descriptor: unit,
      sourceUnit: unit,
      annualized: false,
    };
  }

  const annualized = unit.toUpperCase().includes("SAAR");
  const currency = currencyFromUnit(unit);
  const millions = /millions/iu.test(unit);
  const compactMoney =
    currency && millions ? formatMillions(value, currency) : null;
  const headline = `${
    compactMoney ??
    (unit === "percent"
      ? `${formatNumber(value, locale)}%`
      : formatNumber(value, locale))
  }${annualized ? " annualized" : ""}`;
  const descriptor = annualized
    ? unit.toLowerCase().includes("chained 2017")
      ? "Chained 2017 dollars, SAAR"
      : "Current dollars, SAAR"
    : unit;

  return { headline, descriptor, sourceUnit: unit, annualized };
}
