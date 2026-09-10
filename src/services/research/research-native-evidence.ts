import type {
  NativeSearchTraceV1,
  SanitizedResearchValue,
} from "@/services/research/research-types";

export function record(
  value: unknown,
): value is Record<string, SanitizedResearchValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function evidenceUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null;
    url.hash = "";
    if (url.pathname.length > 1)
      url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return null;
  }
}

export function successfulCall(item: unknown): boolean {
  if (!record(item) || item.status !== "completed" || item.error) return false;
  if (
    record(item.result) &&
    (item.result.error || item.result.is_error === true)
  )
    return false;
  return true;
}

export function hasSuccessfulNativeSearch(trace: NativeSearchTraceV1): boolean {
  return trace.calls.some(({ item }) => {
    if (
      !record(item) ||
      !successfulCall(item) ||
      !record(item.action) ||
      item.action.type !== "search"
    )
      return false;
    const queries = [
      item.action.query,
      ...(Array.isArray(item.action.queries) ? item.action.queries : []),
    ];
    return queries.some(
      (query) =>
        typeof query === "string" &&
        query.trim().length > 0 &&
        !query.startsWith("ws_call_id="),
    );
  });
}

export function tracedSourceUrls(trace: NativeSearchTraceV1): Set<string> {
  const urls = new Set<string>();
  const add = (value: unknown) => {
    const url = evidenceUrl(value);
    if (url) urls.add(url);
  };
  for (const { item } of trace.calls) {
    if (!record(item) || !record(item.action)) continue;
    if (["open_page", "find_in_page"].includes(String(item.action.type)))
      add(item.action.url);
    if (successfulCall(item) && Array.isArray(item.action.sources)) {
      for (const source of item.action.sources)
        if (record(source)) add(source.url);
    }
  }
  for (const { annotation } of trace.annotations) {
    if (record(annotation) && annotation.type === "url_citation")
      add(annotation.url);
  }
  return urls;
}

export function matchingNativeCall(trace: NativeSearchTraceV1, id: string) {
  return trace.calls
    .map((call) => call.item)
    .find((item) => record(item) && item.id === id);
}
