import {
  buildEurostatDataUrl,
  buildEurostatStructureUrl,
  fetchEurostatJson,
  type EurostatRequestOptions,
} from "@/data-sources/macro/eurostat-api";
import { parseJsonStatDataset } from "@/data-sources/macro/eurostat-jsonstat";
import {
  EUROSTAT_DATASET,
  EUROSTAT_METRICS,
} from "@/data-sources/macro/eurostat-metrics";

const EU27_MEMBER_CODES = [
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "EL",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
] as const;

export type EurostatInspection = {
  datasetCode: string;
  datasetTitle: string;
  dimensions: { id: string; label: string; size: number }[];
  dimensionOrder: string[];
  geographyCodes: { code: string; label: string }[];
  euAggregateCodes: { code: string; label: string }[];
  memberStates: { code: string; label: string }[];
  purposeCodes: { code: string; label: string }[];
  unitCodes: { code: string; label: string }[];
  frequency: { code: string; label: string };
  firstAvailableYear: string;
  latestAvailableYear: string;
  metrics: {
    slug: string;
    coicopCode: string;
    coicopLabel: string;
    unitCode: string;
    unitLabel: string;
    firstYear: string;
    latestYear: string;
  }[];
};

export async function inspectEurostatDataset(
  baseUrl: string,
  options: EurostatRequestOptions = {},
): Promise<EurostatInspection> {
  const structureResult = await fetchEurostatJson(
    buildEurostatStructureUrl(baseUrl, {
      geo: EUROSTAT_DATASET.geographyCode,
      sinceTimePeriod: "2023",
      untilTimePeriod: "2024",
    }),
    options,
  );
  const structure = parseJsonStatDataset(structureResult.payload);
  const geographyResult = await fetchEurostatJson(
    buildEurostatStructureUrl(baseUrl, {
      freq: "A",
      unit: "CP_MEUR",
      coicop18: "TOTAL",
      time: "2024",
    }),
    options,
  );
  const geographyDataset = parseJsonStatDataset(geographyResult.payload);
  const geographyCodes = geographyDataset.dimensions.geo.categories.map(
    ({ code, label }) => ({ code, label }),
  );
  const metrics = [];
  for (const metric of EUROSTAT_METRICS) {
    const result = await fetchEurostatJson(
      buildEurostatDataUrl(baseUrl, metric),
      options,
    );
    const dataset = parseJsonStatDataset(result.payload);
    const years = dataset.dimensions.time.categories.flatMap((time) => {
      const timeIndex = time.index;
      const rawValue = Array.isArray(dataset.values)
        ? dataset.values[timeIndex]
        : dataset.values[String(timeIndex)];
      return typeof rawValue === "number" ? [time.code] : [];
    });
    metrics.push({
      slug: metric.slug,
      coicopCode: metric.coicopCode,
      coicopLabel: metric.coicopLabel,
      unitCode: metric.unitCode,
      unitLabel: metric.unitLabel,
      firstYear: years[0] ?? "Not available",
      latestYear: years.at(-1) ?? "Not available",
    });
  }

  const allYears = metrics
    .flatMap((metric) => [metric.firstYear, metric.latestYear])
    .filter((year) => /^\d{4}$/.test(year));

  return {
    datasetCode: EUROSTAT_DATASET.code,
    datasetTitle: structure.label,
    dimensions: structure.ids.map((id, index) => ({
      id,
      label: structure.dimensions[id].label,
      size: structure.sizes[index],
    })),
    dimensionOrder: structure.ids,
    geographyCodes,
    euAggregateCodes: geographyCodes.filter((item) =>
      /^(EU|EA)/.test(item.code),
    ),
    memberStates: geographyCodes.filter((item) =>
      (EU27_MEMBER_CODES as readonly string[]).includes(item.code),
    ),
    purposeCodes: structure.dimensions.coicop18.categories.map(
      ({ code, label }) => ({ code, label }),
    ),
    unitCodes: structure.dimensions.unit.categories.map(({ code, label }) => ({
      code,
      label,
    })),
    frequency: {
      code: structure.dimensions.freq.categories[0].code,
      label: structure.dimensions.freq.categories[0].label,
    },
    firstAvailableYear: allYears.sort()[0],
    latestAvailableYear: allYears.sort().at(-1)!,
    metrics,
  };
}
