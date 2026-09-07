import type { PrismaClient } from "@/generated/prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { PrismaSchedulerStore } from "@/services/scheduler/scheduler-prisma-store";
import type {
  ScheduledSourceDefinition,
  SchedulerRuntimeSource,
} from "@/services/scheduler/types";

describe("Prisma scheduler state initialization", () => {
  it("persists a staggered first due time when an operational source is enabled", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const prisma = {
      schedulerSourceState: { upsert },
    } as unknown as PrismaClient;
    const store = new PrismaSchedulerStore(prisma);
    const nextScheduledAt = new Date("2026-09-07T00:30:00Z");
    const definition: ScheduledSourceDefinition = {
      sourceId: "research-agent",
      schedulingClass: "RELEASE_AWARE",
      cadenceMinutes: 720,
      automatic: true,
      networkKind: "networked",
      publicationFrequency: "daily",
      requestIntensity: "bounded",
      routineScope: "shadow staging",
      commands: () => [],
    };
    const source: SchedulerRuntimeSource = {
      id: "source-1",
      slug: "research-agent",
      enabled: true,
      configured: true,
      implemented: true,
      lastAttemptedSyncAt: null,
      lastSuccessfulSyncAt: null,
    };
    await store.ensureState({ definition, source, nextScheduledAt });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ nextScheduledAt }),
        create: expect.objectContaining({ nextScheduledAt }),
      }),
    );
  });
});
