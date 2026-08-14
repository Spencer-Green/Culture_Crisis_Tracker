export type CensusRecordIndustryYearValue = {
  year: number;
  naicsCode: string;
  industryLabel: string;
  revenueUsd: number | null;
  payrollUsd: number | null;
  employment: number | null;
  operatingExpensesUsd: number | null;
  sourceVintage: string;
};

function percentChange(current: number | null, previous: number | null) {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function perEmployee(value: number | null, employment: number | null) {
  if (value === null || employment === null || employment === 0) return null;
  return value / employment;
}

export function buildCensusRecordIndustryAnalytics(
  input: readonly CensusRecordIndustryYearValue[],
) {
  const records = [...input].sort((left, right) => left.year - right.year);
  const latest = records.at(-1);
  if (!latest) return null;
  const previous = records.at(-2) ?? null;
  const isYearOverYear = previous?.year === latest.year - 1;
  return {
    latest,
    previous,
    changeLabel: previous
      ? isYearOverYear
        ? "YoY"
        : `Change since ${previous.year}`
      : "Insufficient comparable AIES history",
    isYearOverYear,
    revenueChangePct: percentChange(
      latest.revenueUsd,
      previous?.revenueUsd ?? null,
    ),
    payrollChangePct: percentChange(
      latest.payrollUsd,
      previous?.payrollUsd ?? null,
    ),
    employmentChangePct: percentChange(
      latest.employment,
      previous?.employment ?? null,
    ),
    operatingExpensesChangePct: percentChange(
      latest.operatingExpensesUsd,
      previous?.operatingExpensesUsd ?? null,
    ),
    revenuePerEmployeeUsd: perEmployee(latest.revenueUsd, latest.employment),
    payrollPerEmployeeUsd: perEmployee(latest.payrollUsd, latest.employment),
    chart: records.map((record) => ({
      year: record.year,
      revenueUsd: record.revenueUsd,
      payrollUsd: record.payrollUsd,
      employment: record.employment,
    })),
  };
}
