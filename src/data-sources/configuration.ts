import type { SourceDefinition } from "@/data-sources/catalog";
import type { ServerEnv, SourceEnvironmentKey } from "@/lib/env-schema";

export type SourceConfigurationStatus = {
  configured: boolean;
  missingConfiguration: SourceEnvironmentKey[];
};

function hasValue(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function hasValidHttpUrl(value: string | undefined): boolean {
  if (!value?.trim()) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function getSourceConfigurationStatus(
  source: SourceDefinition,
  environment: Readonly<Partial<ServerEnv>>,
): SourceConfigurationStatus {
  const missingConfiguration: SourceEnvironmentKey[] = [];

  if (!hasValidHttpUrl(environment[source.baseUrlEnvironmentKey])) {
    missingConfiguration.push(source.baseUrlEnvironmentKey);
  }

  for (const key of source.requiredCredentialEnvironmentKeys) {
    if (!hasValue(environment[key])) {
      missingConfiguration.push(key);
    }
  }

  return {
    configured: missingConfiguration.length === 0,
    missingConfiguration,
  };
}
