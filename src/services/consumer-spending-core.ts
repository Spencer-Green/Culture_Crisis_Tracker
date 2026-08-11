import { Prisma } from "@/generated/prisma/client";

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

export type ConsumerSpendingDefinitionRecord = {
  slug: string;
  name: string;
  unit: string;
  frequency: string;
  countryCode: string | null;
  source: {
    slug: string;
  };
  observations: {
    periodStart: Date;
    periodEnd: Date;
    value: { toString(): string };
    retrievedAt: Date;
  }[];
};

const DATABASE_UNAVAILABLE_CODES = new Set([
  "P1000",
  "P1001",
  "P1002",
  "P1003",
  "P1008",
  "P1010",
  "P1011",
  "P1017",
]);

export class ConsumerSpendingLoadError extends Error {
  constructor(cause: unknown) {
    super("Consumer spending data could not be loaded.", { cause });
    this.name = "ConsumerSpendingLoadError";
  }
}

function isDatabaseUnavailableError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }

  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    DATABASE_UNAVAILABLE_CODES.has(error.code)
  );
}

type ConsumerSpendingDefinitionLoader = () => Promise<
  ConsumerSpendingDefinitionRecord[]
>;

export async function buildConsumerSpendingData(
  loadDefinitions: ConsumerSpendingDefinitionLoader,
): Promise<ConsumerSpendingData> {
  try {
    const definitions = await loadDefinitions();

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
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return {
        databaseStatus: "unavailable",
        observations: [],
      };
    }

    throw new ConsumerSpendingLoadError(error);
  }
}
