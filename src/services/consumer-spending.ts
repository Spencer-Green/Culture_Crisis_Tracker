import "server-only";

import { ABS_METRICS } from "@/data-sources/macro/abs-metrics";
import { ONS_METRICS } from "@/data-sources/macro/ons-metrics";
import { getPrisma } from "@/lib/prisma";

export type ConsumerSpendingObservation = {
  sourceSlug: string;
  countryCode: string | null;
  metricSlug: string;
  metricName: string;
  unit: string;
  frequency: string;
  periodStart: string;
  periodEnd: string;
  value: string;
  retrievedAt: string;
};

export type ConsumerSpendingData = {
  databaseStatus: "available" | "unavailable";
  observations: ConsumerSpendingObservation[];
};

export async function getConsumerSpendingData(): Promise<ConsumerSpendingData> {
  try {
    const metricSlugs = [
      ...ABS_METRICS.map((metric) => metric.slug),
      ...ONS_METRICS.map((metric) => metric.slug),
    ];
    const definitions = await getPrisma().metricDefinition.findMany({
      where: {
        slug: { in: metricSlugs },
        source: { slug: { in: ["abs", "ons"] } },
      },
      select: {
        slug: true,
        name: true,
        unit: true,
        frequency: true,
        countryCode: true,
        source: {
          select: {
            slug: true,
          },
        },
        observations: {
          orderBy: { periodStart: "desc" },
          take: 12,
          select: {
            periodStart: true,
            periodEnd: true,
            value: true,
            retrievedAt: true,
          },
        },
      },
    });

    return {
      databaseStatus: "available",
      observations: definitions
        .flatMap((definition) =>
          definition.observations.map((observation) => ({
            sourceSlug: definition.source.slug,
            countryCode: definition.countryCode,
            metricSlug: definition.slug,
            metricName: definition.name,
            unit: definition.unit,
            frequency: definition.frequency,
            periodStart: observation.periodStart.toISOString(),
            periodEnd: observation.periodEnd.toISOString(),
            value: observation.value.toString(),
            retrievedAt: observation.retrievedAt.toISOString(),
          })),
        )
        .sort(
          (left, right) =>
            new Date(right.periodStart).getTime() -
            new Date(left.periodStart).getTime(),
        ),
    };
  } catch {
    return {
      databaseStatus: "unavailable",
      observations: [],
    };
  }
}
