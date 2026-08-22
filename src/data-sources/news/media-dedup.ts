import { createHash } from "node:crypto";

const TRACKING_PARAMETERS = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "referrer",
  "utm_campaign",
  "utm_content",
  "utm_medium",
  "utm_source",
  "utm_term",
]);

const HEADLINE_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "is",
  "of",
  "on",
  "the",
  "to",
  "with",
]);

export function canonicaliseMediaUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if (url.port === "443") url.port = "";
    for (const key of [...url.searchParams.keys()]) {
      const lower = key.toLowerCase();
      if (TRACKING_PARAMETERS.has(lower) || lower.startsWith("utm_")) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/{2,}/g, "/");
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/$/, "");
    return url.toString();
  } catch {
    return null;
  }
}

export function normaliseHeadline(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !HEADLINE_STOP_WORDS.has(token))
    .join(" ");
}

function headlineTokens(value: string): Set<string> {
  return new Set(normaliseHeadline(value).split(" ").filter(Boolean));
}

export function likelyDuplicateStory(
  left: { title: string; publishedAt: Date },
  right: { title: string; publishedAt: Date },
): boolean {
  if (
    Math.abs(left.publishedAt.getTime() - right.publishedAt.getTime()) >
    48 * 60 * 60 * 1_000
  ) {
    return false;
  }
  const leftHeadline = normaliseHeadline(left.title);
  const rightHeadline = normaliseHeadline(right.title);
  const leftTokens = new Set(leftHeadline.split(" ").filter(Boolean));
  const rightTokens = new Set(rightHeadline.split(" ").filter(Boolean));
  if (leftTokens.size < 4 || rightTokens.size < 4) return false;
  if (leftHeadline === rightHeadline) return true;
  const intersection = [...leftTokens].filter((token) =>
    rightTokens.has(token),
  ).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  const smallerHeadline = Math.min(leftTokens.size, rightTokens.size);
  return (
    intersection >= 6 &&
    union > 0 &&
    (intersection / union >= 0.82 || intersection / smallerHeadline >= 0.62)
  );
}

export function storyFingerprint(title: string, publishedAt: Date): string {
  const day = publishedAt.toISOString().slice(0, 10);
  const tokens = [...headlineTokens(title)].sort().slice(0, 12).join("|");
  return createHash("sha256")
    .update(`${day}:${tokens}`)
    .digest("hex")
    .slice(0, 24);
}

export function mediaSourceMatchKey(input: {
  sourceSlug: string;
  externalId: string | null;
  canonicalUrl: string;
  queryFamily: string | null;
  feedSlug: string | null;
}): string {
  return createHash("sha256")
    .update(
      [
        input.sourceSlug,
        input.externalId ?? input.canonicalUrl,
        input.queryFamily ?? "",
        input.feedSlug ?? "",
      ].join(":"),
    )
    .digest("hex");
}
