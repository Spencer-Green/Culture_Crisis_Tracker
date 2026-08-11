import "server-only";

import { cache } from "react";

import { getPrisma } from "@/lib/prisma";
import { buildOverviewState } from "@/services/overview-core";

export const getOverviewState = cache(() =>
  buildOverviewState(() =>
    getPrisma().dataSource.findMany({
      where: {
        ingestionRuns: {
          some: {
            status: "succeeded",
          },
        },
      },
      select: {
        slug: true,
        name: true,
        lastSuccessfulSyncAt: true,
        ingestionRuns: {
          where: {
            status: "succeeded",
          },
          orderBy: {
            startedAt: "desc",
          },
          take: 1,
          select: {
            completedAt: true,
          },
        },
        metricDefinitions: {
          select: {
            observations: {
              orderBy: {
                periodEnd: "desc",
              },
              take: 1,
              select: {
                periodStart: true,
                periodEnd: true,
              },
            },
          },
        },
      },
    }),
  ),
);
