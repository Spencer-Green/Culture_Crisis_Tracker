import { describe, expect, it } from "vitest";

import { parseServerEnv } from "@/lib/env-schema";

describe("server environment parsing", () => {
  it("treats blank optional values as absent", () => {
    const parsed = parseServerEnv({ BEA_API_KEY: "", DATABASE_URL: "" });
    expect(parsed.BEA_API_KEY).toBeUndefined();
    expect(parsed.DATABASE_URL).toBeUndefined();
  });

  it("reports malformed URLs without including unrelated values", () => {
    expect(() =>
      parseServerEnv({
        ABS_BASE_URL: "not-a-url",
        BEA_API_KEY: "must-not-appear-in-errors",
      }),
    ).toThrow("ABS_BASE_URL must be a valid URL");
  });
});
