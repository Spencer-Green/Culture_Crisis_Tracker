import { z } from "zod";

import {
  IGDB_INCLUDED_GAME_TYPES,
  IGDB_STEAM_EXTERNAL_SOURCE_ID,
  type IgdbExternalId,
  type IgdbGameRecord,
  type IgdbNamedReference,
} from "@/data-sources/entertainment/igdb-types";
import { fetchText, HttpRequestError } from "@/lib/http";

const namedReferenceSchema = z.object({
  id: z.number().int(),
  name: z.string(),
});
const gameTypeSchema = z.object({ id: z.number().int(), type: z.string() });
const gameSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  slug: z.string().min(1),
  first_release_date: z.number().int().optional(),
  game_type: gameTypeSchema,
  game_status: z
    .object({ id: z.number().int(), status: z.string() })
    .optional(),
  parent_game: z.object({ id: z.number().int() }).optional(),
  version_parent: z.object({ id: z.number().int() }).optional(),
  created_at: z.number().int().optional(),
  updated_at: z.number().int().optional(),
  genres: z.array(namedReferenceSchema).optional(),
  themes: z.array(namedReferenceSchema).optional(),
  platforms: z.array(namedReferenceSchema).optional(),
  involved_companies: z
    .array(
      z.object({
        developer: z.boolean().optional(),
        publisher: z.boolean().optional(),
        company: namedReferenceSchema,
      }),
    )
    .optional(),
  external_games: z
    .array(
      z.object({
        uid: z.string().min(1),
        name: z.string().optional(),
        url: z.string().optional(),
        external_game_source: namedReferenceSchema,
      }),
    )
    .optional(),
  release_dates: z
    .array(
      z.object({
        id: z.number().int().positive(),
        date: z.number().int().optional(),
        date_format: z.number().int().optional(),
        release_region: z.number().int().optional(),
        status: z.number().int().optional(),
        platform: namedReferenceSchema.optional(),
      }),
    )
    .optional(),
});

const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  token_type: z.string(),
});

export class IgdbResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IgdbResponseError";
  }
}

function unixDate(value: number | undefined): Date | null {
  if (value === undefined) return null;
  const date = new Date(value * 1_000);
  return Number.isNaN(date.getTime()) ? null : date;
}

function safeExternalUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function dedupeNamed(
  values: readonly IgdbNamedReference[],
): IgdbNamedReference[] {
  return [...new Map(values.map((value) => [value.igdbId, value])).values()];
}

export function parseIgdbGame(value: unknown): IgdbGameRecord | null {
  const parsed = gameSchema.safeParse(value);
  if (!parsed.success) return null;
  const game = parsed.data;
  if (
    !(IGDB_INCLUDED_GAME_TYPES as readonly number[]).includes(game.game_type.id)
  ) {
    return null;
  }
  if (game.version_parent) return null;

  const externalIds: IgdbExternalId[] = (game.external_games ?? []).map(
    (external) => ({
      category: external.external_game_source.id,
      sourceName: external.external_game_source.name,
      uid: external.uid,
      name: external.name ?? null,
      sourceUrl: safeExternalUrl(external.url),
    }),
  );
  const steamExternal = externalIds.find(
    (external) =>
      external.category === IGDB_STEAM_EXTERNAL_SOURCE_ID &&
      /^\d+$/.test(external.uid),
  );
  const steamAppId = steamExternal ? Number(steamExternal.uid) : null;
  const companies = new Map<number, IgdbGameRecord["companies"][number]>();
  for (const role of game.involved_companies ?? []) {
    const current = companies.get(role.company.id);
    companies.set(role.company.id, {
      igdbId: role.company.id,
      name: role.company.name,
      developer: (current?.developer ?? false) || (role.developer ?? false),
      publisher: (current?.publisher ?? false) || (role.publisher ?? false),
    });
  }

  return {
    igdbId: game.id,
    name: game.name,
    slug: game.slug,
    firstReleaseDate: unixDate(game.first_release_date),
    gameType: { igdbId: game.game_type.id, name: game.game_type.type },
    gameStatus: game.game_status
      ? { igdbId: game.game_status.id, name: game.game_status.status }
      : null,
    parentIgdbId: game.parent_game?.id ?? null,
    versionParentIgdbId: null,
    igdbCreatedAt: unixDate(game.created_at),
    igdbUpdatedAt: unixDate(game.updated_at),
    companies: [...companies.values()],
    genres: dedupeNamed(
      (game.genres ?? []).map((item) => ({
        igdbId: item.id,
        name: item.name,
      })),
    ),
    themes: dedupeNamed(
      (game.themes ?? []).map((item) => ({
        igdbId: item.id,
        name: item.name,
      })),
    ),
    platforms: dedupeNamed(
      (game.platforms ?? []).map((item) => ({
        igdbId: item.id,
        name: item.name,
      })),
    ),
    releases: (game.release_dates ?? []).map((release) => ({
      igdbId: release.id,
      releaseDate: unixDate(release.date),
      dateCategory: release.date_format ?? null,
      regionId: release.release_region ?? null,
      platform: release.platform
        ? { igdbId: release.platform.id, name: release.platform.name }
        : null,
      statusId: release.status ?? null,
    })),
    externalIds,
    steamAppId:
      steamAppId !== null && Number.isSafeInteger(steamAppId) && steamAppId > 0
        ? steamAppId
        : null,
  };
}

export function buildIgdbGamesQuery(input: {
  startDate: Date;
  endDateExclusive: Date;
  limit?: number;
  offset?: number;
}): string {
  if (input.endDateExclusive <= input.startDate) {
    throw new IgdbResponseError("IGDB release window must be positive.");
  }
  const start = Math.floor(input.startDate.getTime() / 1_000);
  const end = Math.floor(input.endDateExclusive.getTime() / 1_000);
  const limit = Math.min(Math.max(input.limit ?? 500, 1), 500);
  const offset = Math.max(input.offset ?? 0, 0);
  const includedTypes = IGDB_INCLUDED_GAME_TYPES.join(",");
  return [
    "fields id,name,slug,first_release_date,game_type.id,game_type.type,game_status.id,game_status.status,parent_game.id,version_parent.id,created_at,updated_at,genres.id,genres.name,themes.id,themes.name,platforms.id,platforms.name,involved_companies.developer,involved_companies.publisher,involved_companies.company.id,involved_companies.company.name,external_games.uid,external_games.name,external_games.url,external_games.external_game_source.id,external_games.external_game_source.name,release_dates.id,release_dates.date,release_dates.date_format,release_dates.release_region,release_dates.status,release_dates.platform.id,release_dates.platform.name;",
    `where first_release_date >= ${start} & first_release_date < ${end} & game_type = (${includedTypes}) & version_parent = null & involved_companies != null & (game_status = null | game_status != (6,7));`,
    "sort first_release_date asc;",
    `limit ${limit};`,
    `offset ${offset};`,
  ].join(" ");
}

type IgdbToken = { accessToken: string; expiresAt: number };

export class IgdbTokenCache {
  private token: IgdbToken | null = null;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly options: {
      fetchImplementation?: typeof fetch;
      now?: () => number;
    } = {},
  ) {}

  async getToken(): Promise<string> {
    const now = (this.options.now ?? Date.now)();
    if (this.token && this.token.expiresAt - 60_000 > now) {
      return this.token.accessToken;
    }
    const url = new URL("https://id.twitch.tv/oauth2/token");
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("client_secret", this.clientSecret);
    url.searchParams.set("grant_type", "client_credentials");
    let response;
    try {
      response = await fetchText(url, {
        accept: "application/json",
        acceptedContentTypes: ["application/json"],
        method: "POST",
        timeoutMs: 10_000,
        maxResponseBytes: 100_000,
        fetchImplementation: this.options.fetchImplementation,
      });
    } catch {
      throw new IgdbResponseError("IGDB authentication failed.");
    }
    let payload: unknown;
    try {
      payload = JSON.parse(response.body);
    } catch {
      throw new IgdbResponseError("IGDB authentication returned invalid JSON.");
    }
    const parsed = tokenSchema.safeParse(payload);
    if (!parsed.success) {
      throw new IgdbResponseError(
        "IGDB authentication returned an invalid response.",
      );
    }
    this.token = {
      accessToken: parsed.data.access_token,
      expiresAt: now + parsed.data.expires_in * 1_000,
    };
    return this.token.accessToken;
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class IgdbClient {
  private lastRequestAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly baseUrl: string,
    private readonly clientId: string,
    private readonly tokenCache: IgdbTokenCache,
    private readonly options: {
      fetchImplementation?: typeof fetch;
      now?: () => number;
      sleep?: (milliseconds: number) => Promise<void>;
      maxRetries?: number;
    } = {},
  ) {}

  private async throttle(): Promise<void> {
    const now = this.options.now ?? Date.now;
    const wait = Math.max(0, 275 - (now() - this.lastRequestAt));
    if (wait > 0) await (this.options.sleep ?? sleep)(wait);
    this.lastRequestAt = now();
  }

  async query(endpoint: string, body: string): Promise<unknown[]> {
    const base = new URL(this.baseUrl);
    if (
      base.protocol !== "https:" ||
      base.hostname !== "api.igdb.com" ||
      base.pathname.replace(/\/+$/, "") !== "/v4"
    ) {
      throw new IgdbResponseError(
        "IGDB requires the official HTTPS v4 endpoint.",
      );
    }
    const url = new URL(
      endpoint.replace(/^\//, ""),
      `${this.baseUrl.replace(/\/+$/, "")}/`,
    );
    const retries = Math.min(Math.max(this.options.maxRetries ?? 2, 0), 3);
    for (let attempt = 0; ; attempt += 1) {
      await this.throttle();
      try {
        const token = await this.tokenCache.getToken();
        const response = await fetchText(url, {
          accept: "application/json",
          acceptedContentTypes: ["application/json"],
          method: "POST",
          requestHeaders: {
            "Client-ID": this.clientId,
            Authorization: `Bearer ${token}`,
            "Content-Type": "text/plain",
          },
          body,
          timeoutMs: 20_000,
          maxResponseBytes: 20_000_000,
          fetchImplementation: this.options.fetchImplementation,
        });
        let payload: unknown;
        try {
          payload = JSON.parse(response.body);
        } catch {
          throw new IgdbResponseError("IGDB returned invalid JSON.");
        }
        if (!Array.isArray(payload)) {
          throw new IgdbResponseError("IGDB returned an invalid response.");
        }
        return payload;
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

  async fetchGames(input: {
    startDate: Date;
    endDateExclusive: Date;
    limit?: number;
    offset?: number;
  }): Promise<IgdbGameRecord[]> {
    return (await this.fetchGamesPage(input)).games;
  }

  async fetchGamesPage(input: {
    startDate: Date;
    endDateExclusive: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ games: IgdbGameRecord[]; rawCount: number }> {
    const payload = await this.query("games", buildIgdbGamesQuery(input));
    return {
      games: payload.map(parseIgdbGame).filter((game) => game !== null),
      rawCount: payload.length,
    };
  }
}
