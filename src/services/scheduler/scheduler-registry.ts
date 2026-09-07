import "server-only";

import { getStaticSourceRegistry } from "@/data-sources/registry";
import { env } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { evaluateScheduledSource } from "@/services/scheduler/scheduler-core";
import { PrismaSchedulerStore } from "@/services/scheduler/scheduler-prisma-store";
import { buildScheduledSourceDefinitions } from "@/services/scheduler/source-policies";
import type { SchedulerRuntimeSource } from "@/services/scheduler/types";

export function schedulerDefinitions() {
  return buildScheduledSourceDefinitions({
    mediaRefreshHours: env.MEDIA_REFRESH_HOURS,
    ticketmasterRefreshHours: env.TICKETMASTER_REFRESH_HOURS,
    gamingRefreshHours: env.GAMING_REFRESH_HOURS,
    lunaSynthesisEnabled: env.LUNA_SYNTHESIS_ENABLED,
    lunaSynthesisRefreshHours: env.LUNA_SYNTHESIS_REFRESH_HOURS,
    lunaSynthesisMaxPerCycle: env.LUNA_SYNTHESIS_MAX_PER_CYCLE,
    lunaSynthesisDailyCallLimit: env.LUNA_SYNTHESIS_DAILY_CALL_LIMIT,
    lunaSynthesisLookbackHours: env.LUNA_SYNTHESIS_LOOKBACK_HOURS,
    researcherEnabled: env.LLM_RESEARCHER_ENABLED,
  });
}

export async function loadScheduleEvaluations(now = new Date()) {
  const prisma = getPrisma();
  const store = new PrismaSchedulerStore(prisma);
  const [databaseSources, states] = await Promise.all([
    prisma.dataSource.findMany({
      select: {
        id: true,
        slug: true,
        enabled: true,
        lastAttemptedSyncAt: true,
        lastSuccessfulSyncAt: true,
      },
    }),
    store.listStates(),
  ]);
  const staticSources = getStaticSourceRegistry();
  const staticBySlug = new Map<string, (typeof staticSources)[number]>(
    staticSources.map((source) => [source.slug, source]),
  );
  const runtimeBySlug = new Map<string, SchedulerRuntimeSource>();
  for (const source of databaseSources) {
    const staticSource = staticBySlug.get(source.slug);
    runtimeBySlug.set(source.slug, {
      ...source,
      configured: staticSource?.configured ?? false,
      implemented: staticSource?.implementationStatus === "implemented",
    });
  }
  const stateBySource = new Map(states.map((state) => [state.sourceId, state]));
  return schedulerDefinitions().map((definition) => {
    const source = runtimeBySlug.get(definition.sourceId) ?? null;
    return evaluateScheduledSource({
      definition,
      source,
      state: source ? (stateBySource.get(source.id) ?? null) : null,
      now,
    });
  });
}

export function schedulerInventory() {
  return schedulerDefinitions().map((definition) => ({
    sourceId: definition.sourceId,
    class: definition.schedulingClass,
    cadenceMinutes: definition.cadenceMinutes,
    automatic: definition.automatic,
    networkKind: definition.networkKind,
    publicationFrequency: definition.publicationFrequency,
    requestIntensity: definition.requestIntensity,
    routineScope: definition.routineScope,
    entryPoints: definition.commands(new Date()).map((item) => ({
      script: item.script,
      args: item.args,
    })),
    notes: definition.notes ?? definition.blockedReason ?? null,
  }));
}
