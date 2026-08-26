import { fetchText, type FetchImplementation } from "@/lib/http";
import { SCREEN_AUSTRALIA_WIDGET_URL } from "@/data-sources/film/screen-australia-types";

export class ScreenAustraliaResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScreenAustraliaResponseError";
  }
}

export function validateScreenAustraliaWidgetUrl(value: string): URL {
  const url = new URL(value);
  const official = new URL(SCREEN_AUSTRALIA_WIDGET_URL);
  if (
    url.protocol !== "https:" ||
    url.hostname !== official.hostname ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash
  )
    throw new ScreenAustraliaResponseError(
      "Screen Australia requests require the official public widget URL.",
    );
  return url;
}

export async function fetchScreenAustraliaWidget(
  url: string,
  options: {
    fetchImplementation?: FetchImplementation;
    timeoutMs?: number;
  } = {},
) {
  const requestUrl = validateScreenAustraliaWidgetUrl(url);
  const response = await fetchText(requestUrl, {
    accept: "text/html",
    acceptedContentTypes: ["text/html"],
    timeoutMs: options.timeoutMs ?? 12_000,
    maxResponseBytes: 500_000,
    fetchImplementation: options.fetchImplementation,
    requestHeaders: {
      "User-Agent":
        "CultureCrisisTracker/0.1 (private non-commercial research; one weekly request)",
    },
  });
  validateScreenAustraliaWidgetUrl(response.responseUrl);
  return {
    html: response.body,
    latencyMs: response.latencyMs,
    cacheControl: response.headers.get("cache-control"),
    retrievedUrl: SCREEN_AUSTRALIA_WIDGET_URL,
    requestCount: 1 as const,
  };
}
