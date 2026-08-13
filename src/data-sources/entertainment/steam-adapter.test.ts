import { describe, expect, it } from "vitest";

import { SteamDataSourceAdapter } from "@/data-sources/entertainment/steam-adapter";

describe("Steam adapter", () => {
  it("requires the official URL and configured server key", () => {
    expect(
      new SteamDataSourceAdapter({
        getBaseUrl: () => "https://api.steampowered.com/",
        getApiKey: () => undefined,
      }).isConfigured(),
    ).toBe(false);
    expect(
      new SteamDataSourceAdapter({
        getBaseUrl: () => "https://example.com/",
        getApiKey: () => "secret",
      }).isConfigured(),
    ).toBe(false);
    expect(
      new SteamDataSourceAdapter({
        getBaseUrl: () => "https://api.steampowered.com/",
        getApiKey: () => "secret",
      }).isConfigured(),
    ).toBe(true);
  });
});
