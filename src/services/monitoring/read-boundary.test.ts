import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

describe("monitoring read boundary", () => {
  it("contains no provider dispatch, persistence mutations or approval writes", () => {
    const files = readdirSync(
      join(process.cwd(), "src/services/monitoring"),
    ).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"));
    const source = files
      .map((name) =>
        readFileSync(
          join(process.cwd(), "src/services/monitoring", name),
          "utf8",
        ),
      )
      .join("\n");
    expect(source).not.toMatch(
      /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/,
    );
    expect(source).not.toMatch(
      /research-audit-service|research-scheduler|deepseek-responses|generateProductionStorySyntheses|fetch\(/,
    );
  });
  it("does not use composite analytics or research to calculate sector health", () => {
    const source = readFileSync(
      join(process.cwd(), "src/services/monitoring/situation-read.ts"),
      "utf8",
    );
    expect(source).not.toContain("getOverviewAnalytics");
    expect(source).not.toContain("buildIndustryViability");
  });
});
