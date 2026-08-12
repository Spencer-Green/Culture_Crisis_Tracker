import { createHash } from "node:crypto";

import type { GdeltArticle } from "@/data-sources/news/gdelt-api";

const TRACKING_PARAMETERS = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "referrer",
  "utm_campaign",
  "utm_content",
  "utm_medium",
  "utm_source",
  "utm_term",
]);

export function canonicaliseArticleUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if (
      (url.protocol === "http:" && url.port === "80") ||
      (url.protocol === "https:" && url.port === "443")
    ) {
      url.port = "";
    }
    for (const parameter of [...url.searchParams.keys()]) {
      if (
        TRACKING_PARAMETERS.has(parameter.toLowerCase()) ||
        parameter.toLowerCase().startsWith("utm_")
      ) {
        url.searchParams.delete(parameter);
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

export function articleIdentity(canonicalUrl: string): string {
  const digest = createHash("sha256")
    .update(`gdelt:${canonicalUrl}`)
    .digest("hex")
    .slice(0, 32)
    .split("");
  digest[12] = "5";
  digest[16] = ((Number.parseInt(digest[16], 16) & 0x3) | 0x8).toString(16);
  const value = digest.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export type DeduplicatedArticles = {
  articles: GdeltArticle[];
  duplicateCount: number;
  overlapCount: number;
};

export function deduplicateGdeltArticles(
  input: readonly GdeltArticle[],
): DeduplicatedArticles {
  const byUrl = new Map<string, GdeltArticle>();
  for (const article of input) {
    const canonicalUrl = canonicaliseArticleUrl(article.url);
    if (!canonicalUrl) continue;
    const existing = byUrl.get(canonicalUrl);
    if (existing) {
      existing.queryFamilies = [
        ...new Set([...existing.queryFamilies, ...article.queryFamilies]),
      ];
      continue;
    }
    byUrl.set(canonicalUrl, { ...article, url: canonicalUrl });
  }
  const articles = [...byUrl.values()].sort(
    (left, right) => right.publishedAt.getTime() - left.publishedAt.getTime(),
  );
  return {
    articles,
    duplicateCount: input.length - articles.length,
    overlapCount: articles.filter((article) => article.queryFamilies.length > 1)
      .length,
  };
}
