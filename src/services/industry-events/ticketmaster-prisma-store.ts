import "server-only";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { TicketmasterEventRecord } from "@/data-sources/entertainment/ticketmaster-types";
import type { TicketmasterIngestionStore } from "@/services/industry-events/ticketmaster-ingestion-core";

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function eventData(
  event: TicketmasterEventRecord,
  sourceId: string,
  venueId: string | null,
  retrievedAt: Date,
) {
  return {
    sourceId,
    venueId,
    name: event.name,
    sourceUrl: event.sourceUrl,
    sourcePlatform: event.sourcePlatform,
    countryCode: event.countryCode,
    sectorSlug: event.sectorSlug,
    localDate: event.localDate,
    localTime: event.localTime,
    eventDateTime: event.eventDateTime,
    timezone: event.timezone,
    status: event.status,
    segmentId: event.segmentId,
    segmentName: event.segmentName,
    genreId: event.genreId,
    genreName: event.genreName,
    subGenreId: event.subGenreId,
    subGenreName: event.subGenreName,
    promoterId: event.promoterId,
    promoterName: event.promoterName,
    publicOnsaleStartAt: event.publicOnsaleStartAt,
    publicOnsaleEndAt: event.publicOnsaleEndAt,
    priceMin: event.priceMin,
    priceMax: event.priceMax,
    priceCurrency: event.priceCurrency,
    priceType: event.priceType,
    locale: event.locale,
    testEvent: event.testEvent,
    lastSeenAt: retrievedAt,
    retrievedAt,
    metadata: {
      attractions: event.attractions,
      priceRangePublished: event.priceMin !== null || event.priceMax !== null,
      venueCountryIsEventCountry: true,
      authenticatedRequestUrlPersisted: false,
    } as Prisma.InputJsonValue,
  };
}

export class PrismaTicketmasterIngestionStore implements TicketmasterIngestionStore {
  constructor(private readonly prisma: PrismaClient) {}

  findSource(slug: string) {
    return this.prisma.dataSource.findUnique({
      where: { slug },
      select: { id: true, slug: true, enabled: true },
    });
  }

  async createRun(input: {
    sourceId: string;
    startedAt: Date;
    metadata: Record<string, unknown>;
  }): Promise<string> {
    const run = await this.prisma.ingestionRun.create({
      data: {
        sourceId: input.sourceId,
        status: "running",
        startedAt: input.startedAt,
        metadata: input.metadata as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    return run.id;
  }

  async markSourceAttempted(
    sourceId: string,
    attemptedAt: Date,
  ): Promise<void> {
    await this.prisma.dataSource.update({
      where: { id: sourceId },
      data: { lastAttemptedSyncAt: attemptedAt },
    });
  }

  async persistEvents(input: {
    sourceId: string;
    events: readonly TicketmasterEventRecord[];
    retrievedAt: Date;
  }): Promise<{
    recordsCreated: number;
    recordsUpdated: number;
    statusChanges: number;
  }> {
    const venues = new Map(
      input.events
        .map((event) => event.venue)
        .filter((venue) => venue !== null)
        .map((venue) => [venue.ticketmasterId, venue]),
    );
    const venueIds = new Map<string, string>();
    for (const venue of venues.values()) {
      const persisted = await this.prisma.ticketmasterVenue.upsert({
        where: { ticketmasterId: venue.ticketmasterId },
        update: {
          name: venue.name,
          city: venue.city,
          region: venue.region,
          countryCode: venue.countryCode,
          timezone: venue.timezone,
          latitude: venue.latitude,
          longitude: venue.longitude,
          lastSeenAt: input.retrievedAt,
        },
        create: {
          ticketmasterId: venue.ticketmasterId,
          name: venue.name,
          city: venue.city,
          region: venue.region,
          countryCode: venue.countryCode,
          timezone: venue.timezone,
          latitude: venue.latitude,
          longitude: venue.longitude,
          firstSeenAt: input.retrievedAt,
          lastSeenAt: input.retrievedAt,
        },
        select: { id: true },
      });
      venueIds.set(venue.ticketmasterId, persisted.id);
    }

    const existing = new Map<
      string,
      {
        id: string;
        status: string;
        previousStatus: string | null;
        statusChangedAt: Date | null;
      }
    >();
    for (const batch of chunks(
      input.events.map((event) => event.ticketmasterId),
      500,
    )) {
      const records = await this.prisma.ticketmasterEvent.findMany({
        where: { ticketmasterId: { in: batch } },
        select: {
          id: true,
          ticketmasterId: true,
          status: true,
          previousStatus: true,
          statusChangedAt: true,
        },
      });
      for (const record of records) existing.set(record.ticketmasterId, record);
    }

    let statusChanges = 0;
    for (const event of input.events) {
      const current = existing.get(event.ticketmasterId);
      const venueId = event.venue
        ? (venueIds.get(event.venue.ticketmasterId) ?? null)
        : null;
      const data = eventData(event, input.sourceId, venueId, input.retrievedAt);
      if (current) {
        const statusChanged = current.status !== event.status;
        if (statusChanged) statusChanges += 1;
        await this.prisma.ticketmasterEvent.update({
          where: { id: current.id },
          data: {
            ...data,
            previousStatus: statusChanged
              ? current.status
              : current.previousStatus,
            statusChangedAt: statusChanged
              ? input.retrievedAt
              : current.statusChangedAt,
          },
        });
      } else {
        await this.prisma.ticketmasterEvent.create({
          data: {
            ticketmasterId: event.ticketmasterId,
            ...data,
            firstSeenAt: input.retrievedAt,
          },
        });
      }
    }
    return {
      recordsCreated: input.events.length - existing.size,
      recordsUpdated: existing.size,
      statusChanges,
    };
  }

  async completeRun(
    input: Parameters<TicketmasterIngestionStore["completeRun"]>[0],
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.ingestionRun.update({
        where: { id: input.runId },
        data: {
          status: "succeeded",
          completedAt: input.completedAt,
          recordsRead: input.recordsRead,
          recordsCreated: input.recordsCreated,
          recordsUpdated: input.recordsUpdated,
          errorMessage: null,
          metadata: input.metadata as Prisma.InputJsonValue,
        },
      }),
      this.prisma.dataSource.update({
        where: { id: input.sourceId },
        data: { lastSuccessfulSyncAt: input.completedAt },
      }),
    ]);
  }

  async failRun(
    input: Parameters<TicketmasterIngestionStore["failRun"]>[0],
  ): Promise<void> {
    await this.prisma.ingestionRun.update({
      where: { id: input.runId },
      data: {
        status: "failed",
        completedAt: input.completedAt,
        recordsRead: input.recordsRead,
        errorMessage: input.errorMessage,
      },
    });
  }
}
