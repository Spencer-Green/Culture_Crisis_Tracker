import { getSourceDefinition } from "@/data-sources/catalog";
import { getSourceConfigurationStatus } from "@/data-sources/configuration";
import {
  SteamClient,
  SteamResponseError,
} from "@/data-sources/entertainment/steam-api";
import type {
  AvailableMetric,
  DataSourceAdapter,
  DataSourceHealth,
  NormalisedObservation,
  ObservationRequest,
} from "@/data-sources/types";
import { HttpRequestError } from "@/lib/http";

export class SteamStructuredAdapterError extends Error {
  constructor() {
    super(
      "Steam supplies structured game snapshots rather than metric observations.",
    );
    this.name = "SteamStructuredAdapterError";
  }
}

export type SteamAdapterOptions = {
  getBaseUrl: () => string | undefined;
  getApiKey: () => string | undefined;
  fetchImplementation?: typeof fetch;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  maxRetries?: number;
  nowDate?: () => Date;
};

export class SteamDataSourceAdapter implements DataSourceAdapter {
  readonly slug = "steam";
  readonly name = "Steam Web API";
  readonly countries = ["AU", "US", "GB", "CA", "NZ", "EU"] as const;
  readonly sectors = ["gaming"] as const;

  constructor(private readonly options: SteamAdapterOptions) {}

  isConfigured(): boolean {
    const status = getSourceConfigurationStatus(getSourceDefinition("steam"), {
      STEAM_BASE_URL: this.options.getBaseUrl(),
      STEAM_WEB_API_KEY: this.options.getApiKey(),
    });
    if (!status.configured) return false;
    try {
      const url = new URL(this.options.getBaseUrl()!);
      return (
        url.protocol === "https:" && url.hostname === "api.steampowered.com"
      );
    } catch {
      return false;
    }
  }

  requireRequestConfiguration(): { baseUrl: string; apiKey: string } {
    const baseUrl = this.options.getBaseUrl();
    const apiKey = this.options.getApiKey();
    if (!baseUrl || !apiKey || !this.isConfigured()) {
      throw new SteamResponseError("Steam configuration is incomplete.");
    }
    return { baseUrl, apiKey };
  }

  createClient(): SteamClient {
    const { baseUrl } = this.requireRequestConfiguration();
    return new SteamClient(baseUrl, {
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
        message: "Steam configuration is incomplete.",
      };
    }
    try {
      const startedAt = performance.now();
      await this.createClient().fetchSnapshot(570, checkedAt);
      return {
        status: "healthy",
        checkedAt: checkedAt.toISOString(),
        latencyMs: Math.round(performance.now() - startedAt),
        message:
          "Official Valve player, review, and store endpoints responded successfully.",
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
          error instanceof SteamResponseError
            ? error.message
            : "Steam health check failed.",
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
    return Promise.reject(new SteamStructuredAdapterError());
  }
}
