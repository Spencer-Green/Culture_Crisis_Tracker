import "server-only";

import { getSourceDefinition, type SourceSlug } from "@/data-sources/catalog";
import { PlaceholderDataSourceAdapter } from "@/data-sources/placeholder-adapter";
import { isSourceConfigured } from "@/lib/env";

export function createPlaceholderAdapter(
  slug: SourceSlug,
): PlaceholderDataSourceAdapter {
  const definition = getSourceDefinition(slug);

  return new PlaceholderDataSourceAdapter({
    slug: definition.slug,
    name: definition.name,
    countries: definition.countries,
    sectors: definition.sectors,
    configured: () => isSourceConfigured(slug),
  });
}
