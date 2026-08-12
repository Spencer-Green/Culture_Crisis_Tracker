export const STRUCTURAL_BENCHMARK_SOURCE_SLUGS = ["eurostat"] as const;

export function isStructuralBenchmarkSource(slug: string): boolean {
  return (STRUCTURAL_BENCHMARK_SOURCE_SLUGS as readonly string[]).includes(
    slug,
  );
}

export function isCurrentSource(slug: string): boolean {
  return !isStructuralBenchmarkSource(slug);
}
