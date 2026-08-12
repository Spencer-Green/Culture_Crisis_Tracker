export type JsonStatCategory = {
  code: string;
  index: number;
  label: string;
};

export type JsonStatDataset = {
  label: string;
  ids: string[];
  sizes: number[];
  dimensions: Record<
    string,
    {
      label: string;
      categories: JsonStatCategory[];
    }
  >;
  values: unknown[] | Record<string, unknown>;
  statuses: unknown[] | Record<string, unknown> | null;
};

export class EurostatResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EurostatResponseError";
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseCategories(
  dimensionId: string,
  dimension: Record<string, unknown>,
): JsonStatCategory[] {
  const category = asRecord(dimension.category);
  const index = category?.index;
  const labels = asRecord(category?.label) ?? {};
  let entries: [string, number][];

  if (Array.isArray(index) && index.every((code) => typeof code === "string")) {
    entries = index.map((code, position) => [code, position]);
  } else {
    const indexRecord = asRecord(index);
    if (
      !indexRecord ||
      !Object.values(indexRecord).every(
        (position) => Number.isInteger(position) && Number(position) >= 0,
      )
    ) {
      throw new EurostatResponseError(
        `Eurostat returned an invalid category index for ${dimensionId}.`,
      );
    }
    entries = Object.entries(indexRecord).map(([code, position]) => [
      code,
      Number(position),
    ]);
  }

  return entries
    .sort((left, right) => left[1] - right[1])
    .map(([code, position]) => ({
      code,
      index: position,
      label: typeof labels[code] === "string" ? String(labels[code]) : code,
    }));
}

export function parseJsonStatDataset(payload: unknown): JsonStatDataset {
  const record = asRecord(payload);
  if (!record || record.class !== "dataset") {
    throw new EurostatResponseError(
      "Eurostat returned an invalid JSON-stat dataset.",
    );
  }
  if (
    !Array.isArray(record.id) ||
    !record.id.every((id) => typeof id === "string") ||
    !Array.isArray(record.size) ||
    !record.size.every((size) => Number.isInteger(size) && Number(size) >= 0) ||
    record.id.length !== record.size.length
  ) {
    throw new EurostatResponseError(
      "Eurostat returned invalid dimension metadata.",
    );
  }
  const dimensionRecord = asRecord(record.dimension);
  if (!dimensionRecord) {
    throw new EurostatResponseError("Eurostat returned no dimensions.");
  }

  const ids = record.id as string[];
  const sizes = (record.size as number[]).map(Number);
  const dimensions = Object.fromEntries(
    ids.map((id, position) => {
      const dimension = asRecord(dimensionRecord[id]);
      if (!dimension) {
        throw new EurostatResponseError(`Eurostat omitted dimension ${id}.`);
      }
      const categories = parseCategories(id, dimension);
      if (categories.length !== sizes[position]) {
        throw new EurostatResponseError(
          `Eurostat dimension ${id} size does not match its categories.`,
        );
      }
      return [
        id,
        {
          label: typeof dimension.label === "string" ? dimension.label : id,
          categories,
        },
      ];
    }),
  );
  const values = record.value;
  if (!Array.isArray(values) && !asRecord(values)) {
    throw new EurostatResponseError("Eurostat returned invalid values.");
  }
  const statuses =
    Array.isArray(record.status) || asRecord(record.status)
      ? (record.status as unknown[] | Record<string, unknown>)
      : null;

  return {
    label: typeof record.label === "string" ? record.label : "",
    ids,
    sizes,
    dimensions,
    values: values as unknown[] | Record<string, unknown>,
    statuses,
  };
}

function flattenedIndex(
  dataset: JsonStatDataset,
  coordinates: Record<string, string>,
) {
  let index = 0;
  for (
    let dimensionPosition = 0;
    dimensionPosition < dataset.ids.length;
    dimensionPosition += 1
  ) {
    const id = dataset.ids[dimensionPosition];
    const code = coordinates[id];
    const category = dataset.dimensions[id].categories.find(
      (item) => item.code === code,
    );
    if (!category) {
      throw new EurostatResponseError(
        `Eurostat response does not contain ${id}=${code ?? "undefined"}.`,
      );
    }
    const stride = dataset.sizes
      .slice(dimensionPosition + 1)
      .reduce((product, size) => product * size, 1);
    index += category.index * stride;
  }
  return index;
}

function indexedValue(
  values: unknown[] | Record<string, unknown>,
  index: number,
): unknown {
  return Array.isArray(values) ? values[index] : values[String(index)];
}

export function getJsonStatCell(
  dataset: JsonStatDataset,
  coordinates: Record<string, string>,
): { value: number | null; status: string | null } {
  const index = flattenedIndex(dataset, coordinates);
  const rawValue = indexedValue(dataset.values, index);
  if (
    rawValue !== null &&
    rawValue !== undefined &&
    typeof rawValue !== "number"
  ) {
    throw new EurostatResponseError(
      "Eurostat returned a non-numeric observation.",
    );
  }
  if (typeof rawValue === "number" && !Number.isFinite(rawValue)) {
    throw new EurostatResponseError(
      "Eurostat returned an invalid numeric observation.",
    );
  }
  const rawStatus = dataset.statuses
    ? indexedValue(dataset.statuses, index)
    : null;
  return {
    value: rawValue === null || rawValue === undefined ? null : rawValue,
    status: typeof rawStatus === "string" ? rawStatus : null,
  };
}

export function getJsonStatCategory(
  dataset: JsonStatDataset,
  dimensionId: string,
  code: string,
): JsonStatCategory {
  const category = dataset.dimensions[dimensionId]?.categories.find(
    (item) => item.code === code,
  );
  if (!category) {
    throw new EurostatResponseError(
      `Eurostat response does not contain ${dimensionId}=${code}.`,
    );
  }
  return category;
}
