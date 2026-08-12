import { getSourceDefinition } from "@/data-sources/catalog";
import { getSourceConfigurationStatus } from "@/data-sources/configuration";
import {
  buildTicketmasterClassificationsUrl,
  TicketmasterClient,
  type TicketmasterRequestOptions,
} from "@/data-sources/entertainment/ticketmaster-api";
import type {
  AvailableMetric,
  DataSourceAdapter,
  DataSourceHealth,
  NormalisedObservation,
  ObservationRequest,
} from "@/data-sources/types";
import { HttpRequestError } from "@/lib/http";

export class TicketmasterSupplyAdapterError extends Error {
  constructor() {
    super(
      "Ticketmaster supplies structured events rather than metric observations.",
    );
    this.name = "TicketmasterSupplyAdapterError";
  }
}

export type TicketmasterAdapterOptions = TicketmasterRequestOptions & {
  getBaseUrl: () => string | undefined;
  getApiKey: () => string | undefined;
  nowDate?: () => Date;
};

export class TicketmasterDataSourceAdapter implements DataSourceAdapter {
  readonly slug = "ticketmaster";
  readonly name = "Ticketmaster Discovery";
  readonly countries = ["AU", "US", "GB", "CA"] as const;
  readonly sectors = ["music", "theatre", "film", "industry-events"] as const;

  constructor(private readonly options: TicketmasterAdapterOptions) {}

  isConfigured(): boolean {
    const status = getSourceConfigurationStatus(
      getSourceDefinition("ticketmaster"),
      {
        TICKETMASTER_BASE_URL: this.options.getBaseUrl(),
        TICKETMASTER_API_KEY: this.options.getApiKey(),
      },
    );
    if (!status.configured) return false;
    try {
      const url = new URL(this.options.getBaseUrl()!);
      return (
        url.protocol === "https:" &&
        url.hostname === "app.ticketmaster.com" &&
        url.pathname.replace(/\/+$/, "") === "/discovery/v2"
      );
    } catch {
      return false;
    }
  }

  createClient(): TicketmasterClient {
    const { baseUrl, apiKey } = this.requireRequestConfiguration();
    return new TicketmasterClient(baseUrl, apiKey, this.options);
  }

  requireRequestConfiguration(): { baseUrl: string; apiKey: string } {
    const baseUrl = this.options.getBaseUrl();
    const apiKey = this.options.getApiKey();
    if (!baseUrl || !apiKey || !this.isConfigured()) {
      throw new Error(
        "Ticketmaster Discovery API configuration is incomplete.",
      );
    }
    return { baseUrl, apiKey };
  }

  async healthCheck(): Promise<DataSourceHealth> {
    const checkedAt = (this.options.nowDate ?? (() => new Date()))();
    if (!this.isConfigured()) {
      return {
        status: "unavailable",
        checkedAt: checkedAt.toISOString(),
        message: "Ticketmaster Discovery API configuration is incomplete.",
      };
    }
    try {
      const { baseUrl, apiKey } = this.requireRequestConfiguration();
      const startedAt = performance.now();
      await this.createClient().fetchJson(
        buildTicketmasterClassificationsUrl(baseUrl, apiKey),
      );
      return {
        status: "healthy",
        checkedAt: checkedAt.toISOString(),
        latencyMs: Math.round(performance.now() - startedAt),
        message:
          "Ticketmaster classifications endpoint responded successfully.",
      };
    } catch (error) {
      const degraded =
        error instanceof HttpRequestError &&
        (error.kind === "rate-limit" || error.kind === "http");
      return {
        status: degraded ? "degraded" : "unavailable",
        checkedAt: checkedAt.toISOString(),
        message:
          error instanceof HttpRequestError
            ? error.message
            : "Ticketmaster health check failed.",
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
    return Promise.reject(new TicketmasterSupplyAdapterError());
  }
}
