import type { LPAPerformanceYearRecord } from "@/data-sources/theatre/lpa-types";

export function lpaRecordIdentity(
  record: Pick<LPAPerformanceYearRecord, "year"> & {
    category: string;
    geographyScope: string;
  },
) {
  return `${record.year}:${record.category}:${record.geographyScope}`;
}

export function classifyLPAUpserts(
  records: readonly LPAPerformanceYearRecord[],
  existingIdentities: ReadonlySet<string>,
) {
  const updated = records.filter((record) =>
    existingIdentities.has(lpaRecordIdentity(record)),
  ).length;
  return { created: records.length - updated, updated };
}
