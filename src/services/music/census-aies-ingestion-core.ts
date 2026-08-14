import type { CensusRecordIndustryRecord } from "@/data-sources/music/census-aies-types";

export function classifyCensusAiesUpserts(
  records: readonly CensusRecordIndustryRecord[],
  existingIdentities: ReadonlySet<string>,
) {
  const identity = (record: CensusRecordIndustryRecord) =>
    `${record.year}:${record.naicsCode}:${record.sourceVintage}`;
  return {
    created: records.filter(
      (record) => !existingIdentities.has(identity(record)),
    ).length,
    updated: records.filter((record) =>
      existingIdentities.has(identity(record)),
    ).length,
  };
}
