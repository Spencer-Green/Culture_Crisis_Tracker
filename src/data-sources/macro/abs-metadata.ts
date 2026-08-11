import { z } from "zod";

import { ABS_DATAFLOW, ABS_METRICS } from "@/data-sources/macro/abs-metrics";
import { fetchText, type FetchImplementation } from "@/lib/http";

const codeSchema = z
  .object({
    id: z.string(),
    name: z.string(),
  })
  .passthrough();

const codelistSchema = z
  .object({
    id: z.string(),
    version: z.string(),
    name: z.string(),
    codes: z.array(codeSchema).default([]),
  })
  .passthrough();

const dimensionSchema = z
  .object({
    id: z.string(),
    position: z.number(),
    localRepresentation: z
      .object({
        enumeration: z.string().optional(),
      })
      .passthrough(),
  })
  .passthrough();

const structureResponseSchema = z
  .object({
    data: z.object({
      dataflows: z.array(
        z
          .object({
            id: z.string(),
            version: z.string(),
            agencyID: z.string(),
            name: z.string(),
            description: z.string().optional(),
            annotations: z
              .array(
                z
                  .object({
                    type: z.string().optional(),
                    title: z.string().optional(),
                    text: z.string().optional(),
                  })
                  .passthrough(),
              )
              .default([]),
          })
          .passthrough(),
      ),
      codelists: z.array(codelistSchema),
      dataStructures: z.array(
        z
          .object({
            id: z.string(),
            version: z.string(),
            agencyID: z.string(),
            dataStructureComponents: z.object({
              dimensionList: z.object({
                dimensions: z.array(dimensionSchema),
                timeDimensions: z
                  .array(
                    z
                      .object({
                        id: z.string(),
                        position: z.number(),
                      })
                      .passthrough(),
                  )
                  .default([]),
              }),
            }),
          })
          .passthrough(),
      ),
      contentConstraints: z
        .array(
          z
            .object({
              validFrom: z.string().optional(),
              validTo: z.string().optional(),
              cubeRegions: z
                .array(
                  z
                    .object({
                      keyValues: z.array(
                        z
                          .object({
                            id: z.string(),
                            timeRange: z
                              .object({
                                startPeriod: z
                                  .object({ period: z.string() })
                                  .optional(),
                                endPeriod: z
                                  .object({ period: z.string() })
                                  .optional(),
                              })
                              .optional(),
                          })
                          .passthrough(),
                      ),
                    })
                    .passthrough(),
                )
                .default([]),
            })
            .passthrough(),
        )
        .default([]),
    }),
  })
  .passthrough();

export type AbsMetadataCode = {
  code: string;
  label: string;
};

export type AbsStructureMetadata = {
  dataflow: {
    id: string;
    version: string;
    agency: string;
    label: string;
    description: string | null;
    annotations: {
      type: string | null;
      title: string | null;
      text: string | null;
    }[];
  };
  dimensions: {
    id: string;
    position: number;
    codelistId: string | null;
  }[];
  codelists: Record<string, AbsMetadataCode[]>;
  availability: {
    startPeriod: string | null;
    endPeriod: string | null;
  };
};

function getCodelistId(enumeration: string | undefined): string | null {
  const match = enumeration?.match(/Codelist=[^:]+:([^()]+)\(/);
  return match?.[1] ?? null;
}

function toMonth(period: string | undefined): string | null {
  return period?.match(/^\d{4}-\d{2}/)?.[0] ?? null;
}

export function parseAbsStructureMetadata(body: string): AbsStructureMetadata {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(body);
  } catch {
    throw new Error("ABS structural metadata was not valid JSON.");
  }

  const parsed = structureResponseSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new Error(
      "ABS structural metadata did not match the expected schema.",
    );
  }

  const dataflow = parsed.data.data.dataflows[0];
  const dataStructure = parsed.data.data.dataStructures[0];
  if (!dataflow || !dataStructure) {
    throw new Error("ABS structural metadata did not contain HSI_M.");
  }

  const codelists = Object.fromEntries(
    parsed.data.data.codelists.map((codelist) => [
      codelist.id,
      codelist.codes.map((code) => ({
        code: code.id,
        label: code.name,
      })),
    ]),
  );
  const ranges = parsed.data.data.contentConstraints.flatMap((constraint) =>
    constraint.cubeRegions.flatMap((region) =>
      region.keyValues
        .filter((value) => value.id === "TIME_PERIOD" && value.timeRange)
        .map((value) => ({
          startPeriod: toMonth(value.timeRange?.startPeriod?.period),
          endPeriod: toMonth(value.timeRange?.endPeriod?.period),
        })),
    ),
  );
  const startPeriods = ranges
    .map((range) => range.startPeriod)
    .filter((period): period is string => Boolean(period));
  const endPeriods = ranges
    .map((range) => range.endPeriod)
    .filter((period): period is string => Boolean(period));

  return {
    dataflow: {
      id: dataflow.id,
      version: dataflow.version,
      agency: dataflow.agencyID,
      label: dataflow.name,
      description: dataflow.description ?? null,
      annotations: dataflow.annotations.map((annotation) => ({
        type: annotation.type ?? null,
        title: annotation.title ?? null,
        text: annotation.text ?? null,
      })),
    },
    dimensions: [
      ...dataStructure.dataStructureComponents.dimensionList.dimensions.map(
        (dimension) => ({
          id: dimension.id,
          position: dimension.position,
          codelistId: getCodelistId(dimension.localRepresentation.enumeration),
        }),
      ),
      ...dataStructure.dataStructureComponents.dimensionList.timeDimensions.map(
        (dimension) => ({
          id: dimension.id,
          position: dimension.position,
          codelistId: null,
        }),
      ),
    ].sort((left, right) => left.position - right.position),
    codelists,
    availability: {
      startPeriod: startPeriods.sort()[0] ?? null,
      endPeriod: endPeriods.sort().at(-1) ?? null,
    },
  };
}

export function buildAbsStructureUrl(baseUrl: string): URL {
  return new URL(
    `dataflow/${ABS_DATAFLOW.agency}/${ABS_DATAFLOW.id}/latest?references=all`,
    `${baseUrl.replace(/\/+$/, "")}/`,
  );
}

export async function fetchAbsStructureMetadata(
  baseUrl: string,
  fetchImplementation?: FetchImplementation,
): Promise<AbsStructureMetadata> {
  const response = await fetchText(buildAbsStructureUrl(baseUrl), {
    accept: "application/vnd.sdmx.structure+json;version=1.0",
    acceptedContentTypes: [
      "application/vnd.sdmx.structure+json",
      "application/json",
    ],
    timeoutMs: 15_000,
    fetchImplementation,
  });

  return parseAbsStructureMetadata(response.body);
}

function hasCode(
  metadata: AbsStructureMetadata,
  codelistId: string,
  expected: AbsMetadataCode,
): boolean {
  return Boolean(
    metadata.codelists[codelistId]?.some(
      (item) => item.code === expected.code && item.label === expected.label,
    ),
  );
}

export function validateAbsMetricMappings(
  metadata: AbsStructureMetadata,
): string[] {
  const issues: string[] = [];
  const dimensionOrder = metadata.dimensions
    .filter((dimension) => dimension.id !== "TIME_PERIOD")
    .map((dimension) => dimension.id);

  if (metadata.dataflow.agency !== ABS_DATAFLOW.agency) {
    issues.push(`Expected agency ${ABS_DATAFLOW.agency}.`);
  }
  if (metadata.dataflow.id !== ABS_DATAFLOW.id) {
    issues.push(`Expected dataflow ${ABS_DATAFLOW.id}.`);
  }
  if (metadata.dataflow.version !== ABS_DATAFLOW.version) {
    issues.push(
      `Expected HSI_M version ${ABS_DATAFLOW.version}, received ${metadata.dataflow.version}.`,
    );
  }
  if (dimensionOrder.join(".") !== ABS_DATAFLOW.dimensionOrder.join(".")) {
    issues.push(`Unexpected dimension order: ${dimensionOrder.join(".")}.`);
  }

  const codelistByDimension = Object.fromEntries(
    metadata.dimensions.map((dimension) => [
      dimension.id,
      dimension.codelistId,
    ]),
  );

  for (const metric of ABS_METRICS) {
    const expectedDimensions = [
      ["MEASURE", metric.dimensions.measure],
      ["CATEGORY", metric.dimensions.category],
      ["PRICE_ADJUSTMENT", metric.dimensions.priceAdjustment],
      ["TSEST", metric.dimensions.adjustmentType],
      ["STATE", metric.dimensions.geography],
      ["FREQ", metric.dimensions.frequency],
    ] as const;

    for (const [dimension, expected] of expectedDimensions) {
      const codelistId = codelistByDimension[dimension];
      if (!codelistId || !hasCode(metadata, codelistId, expected)) {
        issues.push(
          `${metric.slug}: ${dimension} ${expected.code} (${expected.label}) was not found.`,
        );
      }
    }

    if (
      !hasCode(metadata, "CL_UNIT_MEASURE", {
        code: metric.unitMetadata.code,
        label: metric.unitMetadata.label,
      })
    ) {
      issues.push(`${metric.slug}: unit mapping was not found.`);
    }
    if (
      !hasCode(metadata, "CL_UNIT_MULT", {
        code: metric.unitMetadata.multiplierCode,
        label: metric.unitMetadata.multiplierLabel,
      })
    ) {
      issues.push(`${metric.slug}: multiplier mapping was not found.`);
    }
  }

  return issues;
}
