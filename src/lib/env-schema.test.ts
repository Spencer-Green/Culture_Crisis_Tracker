import { describe, expect, it } from "vitest";

import { parseServerEnv } from "@/lib/env-schema";

describe("server environment parsing", () => {
  it("treats blank optional values as absent", () => {
    const parsed = parseServerEnv({
      BEA_API_KEY: "",
      DATABASE_URL: "",
      DEEPSEEK_API_KEY: "",
    });
    expect(parsed.BEA_API_KEY).toBeUndefined();
    expect(parsed.DATABASE_URL).toBeUndefined();
    expect(parsed.DEEPSEEK_API_KEY).toBeUndefined();
  });

  it("reports malformed URLs without including unrelated values", () => {
    expect(() =>
      parseServerEnv({
        ABS_BASE_URL: "not-a-url",
        BEA_API_KEY: "must-not-appear-in-errors",
      }),
    ).toThrow("ABS_BASE_URL must be a valid URL");
  });

  it("keeps production Luna opt-in and bounded by default", () => {
    const parsed = parseServerEnv({});
    expect(parsed).toMatchObject({
      LUNA_SYNTHESIS_ENABLED: false,
      LUNA_SYNTHESIS_MAX_PER_CYCLE: 4,
      LUNA_SYNTHESIS_DAILY_CALL_LIMIT: 16,
      LUNA_SYNTHESIS_LOOKBACK_HOURS: 48,
      LUNA_SYNTHESIS_REFRESH_HOURS: 3,
    });
  });
});
