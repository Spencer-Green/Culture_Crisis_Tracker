export type FetchImplementation = typeof fetch;

export type FetchTextOptions = {
  accept: string;
  acceptedContentTypes: readonly string[];
  timeoutMs?: number;
  maxResponseBytes?: number;
  fetchImplementation?: FetchImplementation;
  httpErrorKinds?: Readonly<Partial<Record<number, HttpErrorKind>>>;
};

export type FetchTextResult = {
  body: string;
  contentType: string;
  latencyMs: number;
  responseUrl: string;
  headers: Headers;
};

export type HttpErrorKind =
  | "timeout"
  | "network"
  | "authentication"
  | "rate-limit"
  | "http"
  | "content-type"
  | "response-size";

export class HttpRequestError extends Error {
  readonly kind: HttpErrorKind;
  readonly status?: number;
  readonly retryAfterMs?: number;

  constructor(
    kind: HttpErrorKind,
    message: string,
    status?: number,
    retryAfterMs?: number,
  ) {
    super(message);
    this.name = "HttpRequestError";
    this.kind = kind;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESPONSE_BYTES = 2_000_000;
const USER_AGENT = "CultureCrisisTracker/0.1.0";

export function sanitiseUrl(
  url: URL,
  secretParameterNames: readonly string[],
): string {
  const safeUrl = new URL(url);
  for (const parameterName of secretParameterNames) {
    safeUrl.searchParams.delete(parameterName);
  }
  return safeUrl.toString();
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds * 1_000);
  }

  const date = Date.parse(value);
  if (Number.isNaN(date)) {
    return undefined;
  }

  return Math.max(0, date - Date.now());
}

export async function fetchText(
  url: URL,
  options: FetchTextOptions,
): Promise<FetchTextResult> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();

  try {
    const response = await (options.fetchImplementation ?? globalThis.fetch)(
      url,
      {
        headers: {
          Accept: options.accept,
          "User-Agent": USER_AGENT,
        },
        signal: controller.signal,
      },
    );
    const latencyMs = Math.round(performance.now() - startedAt);

    if (!response.ok) {
      const kind =
        options.httpErrorKinds?.[response.status] ??
        (response.status === 401 || response.status === 403
          ? "authentication"
          : response.status === 429
            ? "rate-limit"
            : "http");
      throw new HttpRequestError(
        kind,
        `Remote service returned HTTP ${response.status}.`,
        response.status,
        parseRetryAfter(response.headers.get("retry-after")),
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (
      !options.acceptedContentTypes.some((accepted) =>
        contentType.toLowerCase().includes(accepted.toLowerCase()),
      )
    ) {
      throw new HttpRequestError(
        "content-type",
        "Remote service returned an unexpected content type.",
      );
    }

    const maxResponseBytes =
      options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
      throw new HttpRequestError(
        "response-size",
        "Remote response exceeded the configured size limit.",
      );
    }

    const body = await response.text();
    if (Buffer.byteLength(body, "utf8") > maxResponseBytes) {
      throw new HttpRequestError(
        "response-size",
        "Remote response exceeded the configured size limit.",
      );
    }

    return {
      body,
      contentType,
      latencyMs,
      responseUrl: response.url || url.toString(),
      headers: response.headers,
    };
  } catch (error) {
    if (error instanceof HttpRequestError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new HttpRequestError(
        "timeout",
        `Remote request timed out after ${timeoutMs}ms.`,
      );
    }

    throw new HttpRequestError("network", "Remote service was unavailable.");
  } finally {
    clearTimeout(timeout);
  }
}
