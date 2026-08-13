import { getSourceDefinition } from "@/data-sources/catalog";
import { getSourceConfigurationStatus } from "@/data-sources/configuration";
import {
  IgdbClient,
  IgdbResponseError,
  IgdbTokenCache,
} from "@/data-sources/entertainment/igdb-api";
import type {
  AvailableMetric,
  DataSourceAdapter,
  DataSourceHealth,
  NormalisedObservation,
  ObservationRequest,
} from "@/data-sources/types";
import { HttpRequestError } from "@/lib/http";

export class IgdbStructuredAdapterError extends Error {
  constructor() {
    super(
      "IGDB supplies structured game records rather than metric observations.",
    );
    this.name = "IgdbStructuredAdapterError";
  }
}

export type IgdbAdapterOptions = {
  getBaseUrl: () => string | undefined;
  getClientId: () => string | undefined;
  getClientSecret: () => string | undefined;
  fetchImplementation?: typeof fetch;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  maxRetries?: number;
  nowDate?: () => Date;
};

export class IgdbDataSourceAdapter implements DataSourceAdapter {
  readonly slug = "igdb";
  readonly name = "IGDB";
  readonly countries = ["AU", "US", "GB", "CA", "NZ", "EU"] as const;
  readonly sectors = ["gaming"] as const;
  private tokenCache: IgdbTokenCache | null = null;

  constructor(private readonly options: IgdbAdapterOptions) {}

  isConfigured(): boolean {
    const status = getSourceConfigurationStatus(getSourceDefinition("igdb"), {
      IGDB_BASE_URL: this.options.getBaseUrl(),
      IGDB_CLIENT_ID: this.options.getClientId(),
      IGDB_CLIENT_SECRET: this.options.getClientSecret(),
    });
    if (!status.configured) return false;
    try {
      const url = new URL(this.options.getBaseUrl()!);
      return (
        url.protocol === "https:" &&
        url.hostname === "api.igdb.com" &&
        url.pathname.replace(/\/+$/, "") === "/v4"
      );
    } catch {
      return false;
    }
  }

  requireRequestConfiguration(): {
    baseUrl: string;
    clientId: string;
    clientSecret: string;
  } {
    const baseUrl = this.options.getBaseUrl();
    const clientId = this.options.getClientId();
    const clientSecret = this.options.getClientSecret();
    if (!baseUrl || !clientId || !clientSecret || !this.isConfigured()) {
      throw new IgdbResponseError("IGDB configuration is incomplete.");
    }
    return { baseUrl, clientId, clientSecret };
  }

  createClient(): IgdbClient {
    const { baseUrl, clientId, clientSecret } =
      this.requireRequestConfiguration();
    this.tokenCache ??= new IgdbTokenCache(clientId, clientSecret, {
      fetchImplementation: this.options.fetchImplementation,
      now: this.options.now,
    });
    return new IgdbClient(baseUrl, clientId, this.tokenCache, {
      fetchImplementation: this.options.fetchImplementation,
      now: this.options.now,
      sleep: this.options.sleep,
      maxRetries: this.options.maxRetries,
    });
  }

  async healthCheck(): Promise<DataSourceHealth> {
    const checkedAt = (this.options.nowDate ?? (() => new Date()))();
    if (!this.isConfigured()) {
      return {
        status: "unavailable",
        checkedAt: checkedAt.toISOString(),
        message: "IGDB configuration is incomplete.",
      };
    }
    try {
      const startedAt = performance.now();
      await this.createClient().query("game_types", "fields id,type; limit 1;");
      return {
        status: "healthy",
        checkedAt: checkedAt.toISOString(),
        latencyMs: Math.round(performance.now() - startedAt),
        message: "IGDB game-types endpoint responded successfully.",
      };
    } catch (error) {
      const degraded =
        error instanceof HttpRequestError &&
        (error.kind === "rate-limit" || error.kind === "http");
      return {
        status: degraded ? "degraded" : "unavailable",
        checkedAt: checkedAt.toISOString(),
        message:
          error instanceof HttpRequestError ||
          error instanceof IgdbResponseError
            ? error.message
            : "IGDB health check failed.",
      };
    }
  }

  fetchAvailableMetrics(): Promise<AvailableMetric[]> {
    return Promise.resolve([]);
  }

  fetchObservations(
    request: ObservationRequest,
  ): Promise<NormalisedObservation[]> {
    void request;
    return Promise.reject(new IgdbStructuredAdapterError());
  }
}
