import type { MVTReportInspection } from "@/data-sources/music/mvt-types";

export type MVTFetchImplementation = typeof fetch;

export class MVTResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MVTResponseError";
  }
}

export function validateMVTUrl(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    !["musicvenuetrust.com", "www.musicvenuetrust.com"].includes(url.hostname)
  )
    throw new MVTResponseError(
      "MVT retrieval requires the official HTTPS host.",
    );
  url.hash = "";
  return url.toString();
}

export async function inspectMVTReport(
  input: { year: number; url: string; fields: string[] },
  options: {
    fetchImplementation?: MVTFetchImplementation;
    timeoutMs?: number;
  } = {},
): Promise<MVTReportInspection> {
  const safeUrl = validateMVTUrl(input.url);
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 10_000,
  );
  try {
    const response = await (options.fetchImplementation ?? fetch)(safeUrl, {
      method: "HEAD",
      redirect: "follow",
      headers: { "User-Agent": "CultureCrisisTracker/0.1.0" },
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type");
    if (!response.ok)
      return {
        year: input.year,
        url: safeUrl,
        reachable: false,
        httpStatus: response.status,
        contentType,
        contentLength: null,
        fields: [...input.fields],
      };
    if (!contentType?.toLowerCase().includes("application/pdf"))
      throw new MVTResponseError("MVT report did not return a PDF response.");
    const rawLength = response.headers.get("content-length");
    const contentLength = rawLength ? Number(rawLength) : null;
    return {
      year: input.year,
      url: safeUrl,
      reachable: true,
      httpStatus: response.status,
      contentType,
      contentLength:
        contentLength !== null && Number.isFinite(contentLength)
          ? contentLength
          : null,
      fields: [...input.fields],
    };
  } catch (error) {
    if (error instanceof MVTResponseError) throw error;
    if (error instanceof Error && error.name === "AbortError")
      throw new MVTResponseError("MVT report validation timed out.");
    throw new MVTResponseError("MVT report validation failed.");
  } finally {
    clearTimeout(timeout);
  }
}
