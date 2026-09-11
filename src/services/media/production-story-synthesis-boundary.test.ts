import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const REQUEST_TIME_PATHS = [
  "src/app/page.tsx",
  "src/app/brief/page.tsx",
  "src/app/media/page.tsx",
  "src/app/developments/page.tsx",
  "src/components/monitoring/situation.tsx",
  "src/services/monitoring/situation-read.ts",
  "src/services/monitoring/developments-read.ts",
];

const FORBIDDEN_INFERENCE_REFERENCES = [
  'production-story-synthesis"',
  "generateProductionStorySyntheses",
  "createOpenAIStorySynthesisClient",
  "requestOpenAIStorySynthesis",
  "synthesizeStorySynthesisEvidence",
];

describe("production Luna request-time boundary", () => {
  it.each(REQUEST_TIME_PATHS)("keeps %s free of model inference", (path) => {
    const source = readFileSync(join(process.cwd(), path), "utf8");
    for (const forbidden of FORBIDDEN_INFERENCE_REFERENCES) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("keeps the persisted read service independent from OpenAI", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src/services/media/production-story-synthesis-read.ts",
      ),
      "utf8",
    );
    expect(source).not.toContain('from "openai"');
    expect(source).not.toContain("requestOpenAIStorySynthesis");
    expect(source).not.toContain("generateProductionStorySyntheses");
  });

  it("uses one batched persisted synthesis read per opted-in page service", () => {
    for (const path of [
      "src/services/media/daily-brief.ts",
      "src/services/media/media.ts",
    ]) {
      const source = readFileSync(join(process.cwd(), path), "utf8");
      expect(source.match(/getPersistedStorySyntheses\(/g)).toHaveLength(1);
    }
    const developments = readFileSync(
      join(process.cwd(), "src/app/developments/page.tsx"),
      "utf8",
    );
    expect(developments.match(/getPersistedStorySyntheses\(/g)).toHaveLength(1);
  });
});
