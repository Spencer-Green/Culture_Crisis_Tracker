import "server-only";
import { readMonitoringArticles } from "@/services/media/media";
import { getPersistedStorySyntheses } from "@/services/media/production-story-synthesis-read";
import { selectDevelopments } from "./developments-core";
import type { MonitorFilters } from "./core";

export async function readDevelopments(
  filters: MonitorFilters,
  now = new Date(),
) {
  const data = await readMonitoringArticles(
    new Date(now.getTime() - filters.days * 86400000),
    now,
  );
  const stories = selectDevelopments(data.articles, filters);
  return { ...data, stories };
}
export { getPersistedStorySyntheses };
