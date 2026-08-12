import "server-only";

import { ABS_METRICS } from "@/data-sources/macro/abs-metrics";
import { BEA_METRICS } from "@/data-sources/macro/bea-metrics";
import { FRED_METRICS } from "@/data-sources/macro/fred-metrics";
import { ONS_METRICS } from "@/data-sources/macro/ons-metrics";
import { getPrisma } from "@/lib/prisma";
import {
  buildConsumerSpendingData,
  type ConsumerSpendingData,
} from "@/services/consumer-spending-core";

export type {
  ConsumerSpendingData,
  ConsumerSpendingObservation,
} from "@/services/consumer-spending-core";

export async function getConsumerSpendingData(): Promise<ConsumerSpendingData> {
  const metricSlugs = [
    ...ABS_METRICS.map((metric) => metric.slug),
    ...BEA_METRICS.map((metric) => metric.slug),
    ...FRED_METRICS.map((metric) => metric.slug),
    ...ONS_METRICS.map((metric) => metric.slug),
  ];

  return buildConsumerSpendingData(() =>
    getPrisma().metricDefinition.findMany({
      where: {
        slug: { in: metricSlugs },
        source: { slug: { in: ["abs", "bea", "fred", "ons"] } },
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
    }),
  );
}
