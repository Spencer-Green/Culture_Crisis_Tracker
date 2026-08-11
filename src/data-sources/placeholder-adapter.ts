import type { CountryCode, SectorSlug } from "@/lib/constants";
import type {
  AvailableMetric,
  DataSourceAdapter,
  DataSourceHealth,
  NormalisedObservation,
} from "@/data-sources/types";
import { NotImplementedError } from "@/data-sources/types";

type PlaceholderAdapterOptions = {
  slug: string;
  name: string;
  countries: readonly CountryCode[];
  sectors: readonly SectorSlug[];
  configured: () => boolean;
};

export class PlaceholderDataSourceAdapter implements DataSourceAdapter {
  readonly slug: string;
  readonly name: string;
  readonly countries: readonly CountryCode[];
  readonly sectors: readonly SectorSlug[];
  private readonly configured: () => boolean;

  constructor(options: PlaceholderAdapterOptions) {
    this.slug = options.slug;
    this.name = options.name;
    this.countries = options.countries;
    this.sectors = options.sectors;
    this.configured = options.configured;
  }

  isConfigured(): boolean {
    return this.configured();
  }

  async healthCheck(): Promise<DataSourceHealth> {
    return Promise.resolve({
      status: "not-checked",
      checkedAt: null,
      message: "External source health has not been checked.",
    });
  }

  async fetchAvailableMetrics(): Promise<AvailableMetric[]> {
    throw new NotImplementedError(this.name, "Metric discovery");
  }

  async fetchObservations(): Promise<NormalisedObservation[]> {
    throw new NotImplementedError(this.name, "Observation ingestion");
  }
}
