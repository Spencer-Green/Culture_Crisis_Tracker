import type { MVTGrassrootsYearRecord } from "@/data-sources/music/mvt-types";

export function classifyMVTUpserts(
  reports: readonly MVTGrassrootsYearRecord[],
  existingYears: ReadonlySet<number>,
) {
  return {
    created: reports.filter((report) => !existingYears.has(report.year)).length,
    updated: reports.filter((report) => existingYears.has(report.year)).length,
  };
}
