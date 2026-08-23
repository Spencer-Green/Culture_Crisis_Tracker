import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../prisma/migrations/20260823000000_add_positive_media_classification_review/migration.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("positive media classification review migration", () => {
  it("preserves existing feedback as wrong and leaves absent feedback absent", () => {
    expect(migration).toContain(
      'UPDATE "MediaClassificationFeedback"\nSET "reviewState" = \'WRONG_CLASSIFICATION\'',
    );
    expect(migration).not.toContain(
      'INSERT INTO "MediaClassificationFeedback"',
    );
  });

  it("enforces mutually exclusive positive and negative review payloads", () => {
    expect(migration).toContain("\"reviewState\" = 'WRONG_CLASSIFICATION'");
    expect(migration).toContain('cardinality("reasons") > 0');
    expect(migration).toContain("\"reviewState\" = 'CORRECT'");
    expect(migration).toContain('cardinality("reasons") = 0');
    expect(migration).toContain('"approvedSector" IS NOT NULL');
  });
});
