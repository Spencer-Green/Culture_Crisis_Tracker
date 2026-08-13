import { z } from "zod";

import type {
  SteamGameObservation,
  SteamReviewSummary,
  SteamStoreDetails,
} from "@/data-sources/entertainment/steam-types";
import { fetchText, HttpRequestError, sanitiseUrl } from "@/lib/http";

const playerSchema = z.object({
  response: z.object({
    player_count: z.number().int().nonnegative().optional(),
    result: z.number().int(),
  }),
});
const reviewSchema = z.object({
  success: z.number().int(),
  query_summary: z
    .object({
      review_score: z.number().int().optional(),
      review_score_desc: z.string().optional(),
      total_positive: z.number().int().nonnegative().optional(),
      total_negative: z.number().int().nonnegative().optional(),
      total_reviews: z.number().int().nonnegative().optional(),
    })
    .optional(),
});
const storeDataSchema = z.object({
  type: z.string(),
  name: z.string(),
  steam_appid: z.number().int().positive(),
  is_free: z.boolean(),
  developers: z.array(z.string()).optional(),
  publishers: z.array(z.string()).optional(),
  price_overview: z
    .object({
      currency: z.string(),
      initial: z.number().int().nonnegative(),
      final: z.number().int().nonnegative(),
      discount_percent: z.number().int().min(0).max(100),
    })
    .optional(),
  release_date: z
    .object({ coming_soon: z.boolean(), date: z.string() })
    .optional(),
  genres: z
    .array(z.object({ id: z.string(), description: z.string() }))
    .optional(),
});

export class SteamResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SteamResponseError";
  }
}

export function parseSteamPlayerCount(value: unknown): number | null {
  const parsed = playerSchema.safeParse(value);
  return parsed.success && parsed.data.response.result === 1
    ? (parsed.data.response.player_count ?? null)
    : null;
}

export function parseSteamReviewSummary(value: unknown): SteamReviewSummary {
  const parsed = reviewSchema.safeParse(value);
  if (
    !parsed.success ||
    parsed.data.success !== 1 ||
    !parsed.data.query_summary
  ) {
    return {
      totalReviews: null,
      positiveReviews: null,
      positivePercent: null,
      reviewScore: null,
      reviewScoreLabel: null,
    };
  }
  const summary = parsed.data.query_summary;
  const total = summary.total_reviews ?? null;
  const positive = summary.total_positive ?? null;
  return {
    totalReviews: total,
    positiveReviews: positive,
    positivePercent:
      total !== null && total > 0 && positive !== null
        ? (positive / total) * 100
        : null,
    reviewScore: summary.review_score ?? null,
    reviewScoreLabel: summary.review_score_desc ?? null,
  };
}

export function parseSteamStoreDetails(
  value: unknown,
  steamAppId: number,
): SteamStoreDetails {
  const envelope = z
    .record(
      z.string(),
      z.object({ success: z.boolean(), data: z.unknown().optional() }),
    )
    .safeParse(value);
  const item = envelope.success ? envelope.data[String(steamAppId)] : undefined;
  if (!item?.success) {
    return {
      storeAvailable: false,
      name: null,
      type: null,
      developers: [],
      publishers: [],
      freeToPlay: null,
      currentPrice: null,
      originalPrice: null,
      discountPercent: null,
      currency: null,
      releaseDate: null,
      comingSoon: null,
      genres: [],
    };
  }
  const parsed = storeDataSchema.safeParse(item.data);
  if (!parsed.success || parsed.data.steam_appid !== steamAppId) {
    throw new SteamResponseError("Steam returned invalid store metadata.");
  }
  const details = parsed.data;
  return {
    storeAvailable: true,
    name: details.name,
    type: details.type,
    developers: details.developers ?? [],
    publishers: details.publishers ?? [],
    freeToPlay: details.is_free,
    currentPrice: details.price_overview?.final ?? null,
    originalPrice: details.price_overview?.initial ?? null,
    discountPercent: details.price_overview?.discount_percent ?? null,
    currency: details.price_overview?.currency ?? null,
    releaseDate: details.release_date?.date || null,
    comingSoon: details.release_date?.coming_soon ?? null,
    genres: (details.genres ?? []).map((genre) => genre.description),
  };
}

export function buildSteamPlayerUrl(baseUrl: string, steamAppId: number): URL {
  const base = new URL(baseUrl);
  if (base.protocol !== "https:" || base.hostname !== "api.steampowered.com") {
    throw new SteamResponseError(
      "Steam requires the official HTTPS Web API endpoint.",
    );
  }
  const url = new URL(
    "ISteamUserStats/GetNumberOfCurrentPlayers/v1/",
    `${baseUrl.replace(/\/+$/, "")}/`,
  );
  url.searchParams.set("appid", String(steamAppId));
  return url;
}

export function buildSteamReviewUrl(steamAppId: number): URL {
  const url = new URL(
    `https://store.steampowered.com/appreviews/${steamAppId}`,
  );
  url.searchParams.set("json", "1");
  url.searchParams.set("language", "all");
  url.searchParams.set("purchase_type", "all");
  url.searchParams.set("num_per_page", "0");
  return url;
}

export function buildSteamStoreDetailsUrl(steamAppId: number): URL {
  const url = new URL("https://store.steampowered.com/api/appdetails");
  url.searchParams.set("appids", String(steamAppId));
  url.searchParams.set("cc", "US");
  url.searchParams.set("l", "en");
  return url;
}

export function sanitiseSteamUrl(url: URL): string {
  return sanitiseUrl(url, ["key"]);
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class SteamClient {
  private lastRequestAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly baseUrl: string,
    private readonly options: {
      fetchImplementation?: typeof fetch;
      now?: () => number;
      sleep?: (milliseconds: number) => Promise<void>;
      maxRetries?: number;
    } = {},
  ) {}

  private async request(url: URL): Promise<unknown> {
    const now = this.options.now ?? Date.now;
    const wait = Math.max(0, 275 - (now() - this.lastRequestAt));
    if (wait > 0) await (this.options.sleep ?? sleep)(wait);
    this.lastRequestAt = now();
    const retries = Math.min(Math.max(this.options.maxRetries ?? 2, 0), 3);
    for (let attempt = 0; ; attempt += 1) {
      try {
        const response = await fetchText(url, {
          accept: "application/json",
          acceptedContentTypes: ["application/json", "text/javascript"],
          timeoutMs: 15_000,
          maxResponseBytes: 2_000_000,
          fetchImplementation: this.options.fetchImplementation,
        });
        try {
          return JSON.parse(response.body);
        } catch {
          throw new SteamResponseError("Steam returned invalid JSON.");
        }
      } catch (error) {
        const retryable =
          error instanceof HttpRequestError &&
          (error.kind === "rate-limit" ||
            (error.kind === "http" && (error.status ?? 0) >= 500));
        if (!retryable || attempt >= retries) throw error;
        await (this.options.sleep ?? sleep)(
          Math.min(error.retryAfterMs ?? 1_000 * 2 ** attempt, 8_000),
        );
      }
    }
  }

  async fetchSnapshot(
    steamAppId: number,
    retrievedAt = new Date(),
  ): Promise<SteamGameObservation> {
    if (!Number.isSafeInteger(steamAppId) || steamAppId <= 0) {
      throw new SteamResponseError("Steam app ID must be a positive integer.");
    }
    const store = parseSteamStoreDetails(
      await this.request(buildSteamStoreDetailsUrl(steamAppId)),
      steamAppId,
    );
    let currentPlayers: number | null = null;
    let reviews = parseSteamReviewSummary(null);
    if (store.storeAvailable && store.type === "game") {
      try {
        currentPlayers = parseSteamPlayerCount(
          await this.request(buildSteamPlayerUrl(this.baseUrl, steamAppId)),
        );
      } catch (error) {
        if (error instanceof HttpRequestError && error.kind === "rate-limit")
          throw error;
      }
      try {
        reviews = parseSteamReviewSummary(
          await this.request(buildSteamReviewUrl(steamAppId)),
        );
      } catch (error) {
        if (error instanceof HttpRequestError && error.kind === "rate-limit")
          throw error;
      }
    }
    return { steamAppId, ...store, currentPlayers, ...reviews, retrievedAt };
  }
}
