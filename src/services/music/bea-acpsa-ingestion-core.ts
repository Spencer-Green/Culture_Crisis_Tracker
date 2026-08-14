import type { BEAACPSASoundRecordingRecord } from "@/data-sources/music/bea-acpsa-types";

export function classifyBEAACPSAUpserts(
  records: readonly BEAACPSASoundRecordingRecord[],
  existingYears: ReadonlySet<number>,
) {
  return {
    created: records.filter((record) => !existingYears.has(record.year)).length,
    updated: records.filter((record) => existingYears.has(record.year)).length,
  };
}
