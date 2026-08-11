import type { SafeSourceMetadata } from "@/data-sources/registry-core";
import type { DatabaseStatus, RuntimeStateStatus } from "@/data-sources/status";

export type SourceRuntimeRecord = {
  slug: string;
  enabled: boolean;
  lastAttemptedSyncAt: Date | null;
  lastSuccessfulSyncAt: Date | null;
};

export type RuntimeSourceMetadata = SafeSourceMetadata & {
  enabled: boolean | null;
  runtimeStateStatus: RuntimeStateStatus;
  lastAttemptedSyncAt: string | null;
  lastSuccessfulSyncAt: string | null;
};

export type RuntimeSourceRegistry = {
  sources: RuntimeSourceMetadata[];
  databaseStatus: DatabaseStatus;
};

type RuntimeStateLoader = () => Promise<SourceRuntimeRecord[]>;

function toIsoString(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

export async function buildRuntimeSourceRegistry(
  staticSources: readonly SafeSourceMetadata[],
  loadRuntimeState: RuntimeStateLoader,
): Promise<RuntimeSourceRegistry> {
  try {
    const records = await loadRuntimeState();
    const recordsBySlug = new Map(
      records.map((record) => [record.slug, record]),
    );

    return {
      databaseStatus: "available",
      sources: staticSources.map((source) => {
        const record = recordsBySlug.get(source.slug);

        if (!record) {
          return {
            ...source,
            enabled: null,
            runtimeStateStatus: "missing",
            lastAttemptedSyncAt: null,
            lastSuccessfulSyncAt: null,
          };
        }

        return {
          ...source,
          enabled: record.enabled,
          runtimeStateStatus: "available",
          lastAttemptedSyncAt: toIsoString(record.lastAttemptedSyncAt),
          lastSuccessfulSyncAt: toIsoString(record.lastSuccessfulSyncAt),
        };
      }),
    };
  } catch {
    return {
      databaseStatus: "unavailable",
      sources: staticSources.map((source) => ({
        ...source,
        enabled: null,
        runtimeStateStatus: "unavailable",
        lastAttemptedSyncAt: null,
        lastSuccessfulSyncAt: null,
      })),
    };
  }
}
