import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const migrationUrl = new URL(
  "../../../prisma/migrations/20260904000000_add_research_shadow_staging/migration.sql",
  import.meta.url,
);

describe("research shadow staging migration", () => {
  it("creates only research-owned tables and no scheduler source", async () => {
    const migration = await readFile(migrationUrl, "utf8");
    expect(migration).toContain('CREATE TABLE "ResearchRun"');
    expect(migration).toContain('CREATE TABLE "ResearchSourceDocument"');
    expect(migration).toContain('CREATE TABLE "ResearchCandidate"');
    expect(migration).toContain('CREATE TABLE "ResearchCandidateReviewEvent"');
    expect(migration).not.toMatch(
      /INSERT INTO|UPDATE "(?:MetricObservation|MediaArticle|IndustryEvent|DataSource)"/,
    );
    expect(migration).not.toMatch(/SchedulerSource|SourceScheduleState/);
  });

  it("enforces unique source and candidate fingerprints", async () => {
    const migration = await readFile(migrationUrl, "utf8");
    expect(migration).toContain("ResearchSourceDocument_sourceFingerprint_key");
    expect(migration).toContain("ResearchCandidate_candidateFingerprint_key");
  });

  it("preserves run occurrence and append-only review relations", async () => {
    const migration = await readFile(migrationUrl, "utf8");
    expect(migration).toContain('CREATE TABLE "ResearchRunSource"');
    expect(migration).toContain('CREATE TABLE "ResearchRunCandidate"');
    expect(migration).toContain(
      "ResearchCandidateReviewEvent_supersedesReviewEventId_fkey",
    );
  });
});
