import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../prisma/migrations/20260830120000_add_media_classification_review_ledger/migration.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("media classification review ledger migration", () => {
  it("creates an append-only event table without fabricating legacy events", () => {
    expect(migration).toContain(
      'CREATE TABLE "MediaClassificationReviewEvent"',
    );
    expect(migration).not.toContain(
      'INSERT INTO "MediaClassificationReviewEvent"',
    );
    expect(migration).not.toContain(
      'SELECT FROM "MediaClassificationFeedback"',
    );
  });

  it("retains article identity, versions, supersession, and explicit review states", () => {
    expect(migration).toContain('"supersedesReviewEventId" UUID');
    expect(migration).toContain('"contentHash" CHAR(64) NOT NULL');
    expect(migration).toContain('"inputSnapshot" JSONB NOT NULL');
    expect(migration).toContain('"machinePrediction" JSONB NOT NULL');
    expect(migration).toContain('"classifierVersion" TEXT NOT NULL');
    expect(migration).toContain('"taxonomyVersion" TEXT NOT NULL');
    expect(migration).toContain(
      '"eventTypeReviewStatus" "MediaClassificationDimensionReviewStatus" NOT NULL',
    );
  });
});
