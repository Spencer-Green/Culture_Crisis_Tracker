export type BEAACPSAYearValue = {
  year: number;
  categoryLabel: string;
  acpsaOutputUsd: number | null;
  acpsaValueAddedUsd: number | null;
  acpsaEmployment: number | null;
  acpsaEmployeeCompensationUsd: number | null;
};

function percentChange(current: number | null, previous: number | null) {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function ratio(numerator: number | null, denominator: number | null) {
  if (numerator === null || denominator === null || denominator === 0)
    return null;
  return numerator / denominator;
}

function index(value: number | null, baseline: number | null) {
  const result = ratio(value, baseline);
  return result === null ? null : result * 100;
}

function cagr(current: number | null, baseline: number | null, years: number) {
  if (
    current === null ||
    baseline === null ||
    current <= 0 ||
    baseline <= 0 ||
    years <= 0
  )
    return null;
  return (Math.pow(current / baseline, 1 / years) - 1) * 100;
}

function comparison(current: BEAACPSAYearValue, baseline: BEAACPSAYearValue) {
  const years = current.year - baseline.year;
  return {
    baselineYear: baseline.year,
    outputChangePct: percentChange(
      current.acpsaOutputUsd,
      baseline.acpsaOutputUsd,
    ),
    valueAddedChangePct: percentChange(
      current.acpsaValueAddedUsd,
      baseline.acpsaValueAddedUsd,
    ),
    employmentChangePct: percentChange(
      current.acpsaEmployment,
      baseline.acpsaEmployment,
    ),
    compensationChangePct: percentChange(
      current.acpsaEmployeeCompensationUsd,
      baseline.acpsaEmployeeCompensationUsd,
    ),
    outputCagrPct: cagr(current.acpsaOutputUsd, baseline.acpsaOutputUsd, years),
    employmentCagrPct: cagr(
      current.acpsaEmployment,
      baseline.acpsaEmployment,
      years,
    ),
  };
}

export function buildBEAACPSAAnalytics(input: readonly BEAACPSAYearValue[]) {
  const records = [...input].sort((left, right) => left.year - right.year);
  const latest = records.at(-1);
  if (!latest) return null;
  const previous = records.find((record) => record.year === latest.year - 1);
  const baseline1998 = records.find((record) => record.year === 1998) ?? null;
  const baseline2019 = records.find((record) => record.year === 2019) ?? null;
  return {
    latest,
    previous: previous ?? null,
    latestGrowth: {
      outputPct: percentChange(
        latest.acpsaOutputUsd,
        previous?.acpsaOutputUsd ?? null,
      ),
      valueAddedPct: percentChange(
        latest.acpsaValueAddedUsd,
        previous?.acpsaValueAddedUsd ?? null,
      ),
      employmentPct: percentChange(
        latest.acpsaEmployment,
        previous?.acpsaEmployment ?? null,
      ),
      compensationPct: percentChange(
        latest.acpsaEmployeeCompensationUsd,
        previous?.acpsaEmployeeCompensationUsd ?? null,
      ),
    },
    valueAddedSharePct:
      ratio(latest.acpsaValueAddedUsd, latest.acpsaOutputUsd) === null
        ? null
        : ratio(latest.acpsaValueAddedUsd, latest.acpsaOutputUsd)! * 100,
    outputPerWorkerUsd: ratio(latest.acpsaOutputUsd, latest.acpsaEmployment),
    valueAddedPerWorkerUsd: ratio(
      latest.acpsaValueAddedUsd,
      latest.acpsaEmployment,
    ),
    compensationPerWorkerUsd: ratio(
      latest.acpsaEmployeeCompensationUsd,
      latest.acpsaEmployment,
    ),
    since1998: baseline1998 ? comparison(latest, baseline1998) : null,
    since2019: baseline2019 ? comparison(latest, baseline2019) : null,
    chart: records.map((record) => ({
      year: record.year,
      outputUsd: record.acpsaOutputUsd,
      valueAddedUsd: record.acpsaValueAddedUsd,
      employment: record.acpsaEmployment,
      compensationUsd: record.acpsaEmployeeCompensationUsd,
      outputIndex1998: index(
        record.acpsaOutputUsd,
        baseline1998?.acpsaOutputUsd ?? null,
      ),
      employmentIndex1998: index(
        record.acpsaEmployment,
        baseline1998?.acpsaEmployment ?? null,
      ),
      outputIndex2019: index(
        record.acpsaOutputUsd,
        baseline2019?.acpsaOutputUsd ?? null,
      ),
      employmentIndex2019: index(
        record.acpsaEmployment,
        baseline2019?.acpsaEmployment ?? null,
      ),
    })),
  };
}
