import { describe, expect, it, vi } from "vitest";

import {
  fetchScreenAustraliaWidget,
  validateScreenAustraliaWidgetUrl,
} from "@/data-sources/film/screen-australia-api";
import { SCREEN_AUSTRALIA_WIDGET_URL } from "@/data-sources/film/screen-australia-types";

describe("Screen Australia widget fetch", () => {
  it("makes one bounded identified request to the exact official host", async () => {
    const fetchImplementation = vi.fn(async (_input, init) => {
      expect(init?.method).toBe("GET");
      expect(new Headers(init?.headers).get("user-agent")).toContain(
        "private non-commercial research",
      );
      return new Response("<html></html>", {
        status: 200,
        headers: {
          "content-type": "text/html",
          "cache-control": "max-age=3600",
        },
      });
    });

    const result = await fetchScreenAustraliaWidget(
      SCREEN_AUSTRALIA_WIDGET_URL,
      { fetchImplementation },
    );

    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(result.requestCount).toBe(1);
    expect(result.cacheControl).toBe("max-age=3600");
  });

  it("does not retry an HTTP failure", async () => {
    const fetchImplementation = vi.fn(async () =>
      Promise.resolve(new Response("failure", { status: 500 })),
    );
    await expect(
      fetchScreenAustraliaWidget(SCREEN_AUSTRALIA_WIDGET_URL, {
        fetchImplementation,
      }),
    ).rejects.toThrow(/HTTP 500/);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("rejects secondary and non-widget URLs", () => {
    expect(() =>
      validateScreenAustraliaWidgetUrl(
        `${SCREEN_AUSTRALIA_WIDGET_URL}/archive`,
      ),
    ).toThrow(/official public widget URL/);
    expect(() =>
      validateScreenAustraliaWidgetUrl("https://www.boxofficemojo.com"),
    ).toThrow(/official public widget URL/);
  });
});
