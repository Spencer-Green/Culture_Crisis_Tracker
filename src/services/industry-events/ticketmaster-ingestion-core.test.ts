import { describe, expect, it, vi } from "vitest";

import { getSourceDefinition } from "@/data-sources/catalog";
import { TicketmasterDataSourceAdapter } from "@/data-sources/entertainment/ticketmaster-adapter";
import type { TicketmasterEventRecord } from "@/data-sources/entertainment/ticketmaster-types";
import {
  runTicketmasterIngestion,
  type TicketmasterIngestionStore,
} from "@/services/industry-events/ticketmaster-ingestion-core";
import type { TicketmasterSupplySnapshotData } from "@/services/industry-events/ticketmaster-longitudinal-core";

class MemoryStore implements TicketmasterIngestionStore {
  enabled = true;
  events = new Map<string, TicketmasterEventRecord>();
  transitions: { runId: string; from: string; to: string }[] = [];
  snapshots: TicketmasterSupplySnapshotData[] = [];
  completed: Record<string, unknown>[] = [];
  failed: string[] = [];

  async findSource() {
    return { id: "source-id", slug: "ticketmaster", enabled: this.enabled };
  }
  async createRun() {
    return `run-${this.completed.length + 1}`;
  }
  async markSourceAttempted() {}
  async persistEvents(input: {
    runId: string;
    events: readonly TicketmasterEventRecord[];
  }) {
    let created = 0;
    let updated = 0;
    let statusChanges = 0;
    for (const event of input.events) {
      const current = this.events.get(event.ticketmasterId);
      if (current) {
        updated += 1;
        if (current.status !== event.status) {
          statusChanges += 1;
          this.transitions.push({
            runId: input.runId,
            from: current.status,
            to: event.status,
          });
        }
      } else created += 1;
      this.events.set(event.ticketmasterId, event);
    }
    return { recordsCreated: created, recordsUpdated: updated, statusChanges };
  }
  async completeRun(
    input: Parameters<TicketmasterIngestionStore["completeRun"]>[0],
  ) {
    this.completed.push(input.metadata);
    this.snapshots.push(...input.snapshots);
  }
  async failRun(input: Parameters<TicketmasterIngestionStore["failRun"]>[0]) {
    this.failed.push(input.errorMessage);
  }
}

function payload(status = "onsale") {
  return JSON.stringify({
    _embedded: {
      events: [
        {
          id: "event-1",
          name: "Structured Music Event",
          url: "https://www.ticketmaster.com/structured-event/event/event-1",
          dates: {
            timezone: "Australia/Melbourne",
            status: { code: status },
            start: {
              localDate: "2026-08-15",
              dateTime: "2026-08-15T10:00:00Z",
            },
          },
          classifications: [
            {
              segment: { id: "KZFzniwnSyZfZ7v7nJ", name: "Music" },
            },
          ],
          _embedded: {
            venues: [
              {
                id: "venue-1",
                name: "Structured Venue",
                city: { name: "Melbourne" },
                country: { name: "Australia", countryCode: "AU" },
              },
            ],
          },
        },
      ],
    },
    page: { size: 200, totalElements: 1, totalPages: 1, number: 0 },
  });
}

function adapter(fetchImplementation: typeof fetch) {
  return new TicketmasterDataSourceAdapter({
    getBaseUrl: () => "https://app.ticketmaster.com/discovery/v2",
    getApiKey: () => "test-ticketmaster-key",
    fetchImplementation,
    sleep: async () => undefined,
  });
}

const range = {
  days: 7 as const,
  startDate: new Date("2026-08-12T00:00:00Z"),
  endDateExclusive: new Date("2026-08-19T00:00:00Z"),
};

describe("Ticketmaster structured-event ingestion", () => {
  it("uses source IDs idempotently and records later status changes", async () => {
    let status = "onsale";
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(payload(status), {
          headers: {
            "content-type": "application/json",
            "rate-limit-available": "4900",
          },
        }),
    );
    const store = new MemoryStore();
    const input = {
      sourceDefinition: getSourceDefinition("ticketmaster"),
      adapter: adapter(fetchImplementation),
      store,
      ...range,
      countryCode: "AU" as const,
      segmentSlug: "music",
      now: () => new Date("2026-08-12T00:00:01Z"),
    };

    const first = await runTicketmasterIngestion(input);
    const repeat = await runTicketmasterIngestion(input);
    status = "canceled";
    const changed = await runTicketmasterIngestion(input);
    const unchangedRepeat = await runTicketmasterIngestion(input);
    status = "onsale";
    const recovered = await runTicketmasterIngestion(input);
    status = "canceled";
    const changedAgain = await runTicketmasterIngestion(input);

    expect(first).toMatchObject({
      recordsReturned: 1,
      uniqueEvents: 1,
      recordsCreated: 1,
      recordsUpdated: 0,
      statusChanges: 0,
      snapshotsCreated: 0,
      uniqueVenues: 1,
      statusDistribution: { onsale: 1 },
    });
    expect(repeat).toMatchObject({ recordsCreated: 0, recordsUpdated: 1 });
    expect(changed).toMatchObject({
      recordsCreated: 0,
      recordsUpdated: 1,
      statusChanges: 1,
      statusDistribution: { canceled: 1 },
    });
    expect(unchangedRepeat.statusChanges).toBe(0);
    expect(recovered.statusChanges).toBe(1);
    expect(changedAgain.statusChanges).toBe(1);
    expect(store.events).toHaveLength(1);
    expect(store.transitions).toEqual([
      { runId: "run-3", from: "onsale", to: "canceled" },
      { runId: "run-5", from: "canceled", to: "onsale" },
      { runId: "run-6", from: "onsale", to: "canceled" },
    ]);
    expect(store.snapshots).toEqual([]);
  });

  it("creates snapshots only after a complete all-market all-segment run", async () => {
    const store = new MemoryStore();
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(payload(), {
          headers: { "content-type": "application/json" },
        }),
    );
    let observedAt = new Date("2026-08-12T00:00:01Z");
    const input = {
      sourceDefinition: getSourceDefinition("ticketmaster"),
      adapter: adapter(fetchImplementation),
      store,
      ...range,
      now: () => observedAt,
    };
    const result = await runTicketmasterIngestion(input);
    observedAt = new Date("2026-08-19T00:00:01Z");
    const later = await runTicketmasterIngestion(input);

    expect(result.snapshotsCreated).toBe(16);
    expect(later.snapshotsCreated).toBe(16);
    expect(store.snapshots).toHaveLength(32);
    expect(
      new Set(store.snapshots.map((snapshot) => snapshot.ingestionRunId)),
    ).toEqual(new Set(["run-1", "run-2"]));
    expect(
      store.snapshots.find(
        (snapshot) =>
          snapshot.countryCode === "AU" &&
          snapshot.segmentName === "ALL CULTURAL",
      ),
    ).toMatchObject({
      windowDays: 7,
      uniqueEventCount: 1,
      activeVenueCount: 1,
      onsaleCount: 1,
    });
  });

  it("keeps implemented, configured, and enabled state independent", async () => {
    const store = new MemoryStore();
    store.enabled = false;
    await expect(
      runTicketmasterIngestion({
        sourceDefinition: getSourceDefinition("ticketmaster"),
        adapter: adapter(vi.fn<typeof fetch>()),
        store,
        ...range,
        countryCode: "AU",
        segmentSlug: "music",
      }),
    ).rejects.toThrow("disabled");
  });

  it("stores only sanitized failures", async () => {
    const secret = "test-ticketmaster-key";
    const store = new MemoryStore();
    await expect(
      runTicketmasterIngestion({
        sourceDefinition: getSourceDefinition("ticketmaster"),
        adapter: adapter(
          vi
            .fn<typeof fetch>()
            .mockRejectedValue(new Error(`failed ${secret}`)),
        ),
        store,
        ...range,
        countryCode: "AU",
        segmentSlug: "music",
      }),
    ).rejects.not.toThrow(secret);
    expect(store.failed.join(" ")).not.toContain(secret);
    expect(store.snapshots).toEqual([]);
  });
});
