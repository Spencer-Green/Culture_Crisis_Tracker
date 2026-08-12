import { describe, expect, it } from "vitest";

import {
  parseTicketmasterCliArguments,
  resolveTicketmasterWindow,
} from "@/data-sources/entertainment/ticketmaster-cli";

describe("Ticketmaster CLI", () => {
  it("accepts bounded windows and supported filters", () => {
    expect(
      parseTicketmasterCliArguments([
        "--days=30",
        "--country=gb",
        "--segment=arts-theatre",
      ]),
    ).toEqual({ days: 30, countryCode: "GB", segmentSlug: "arts-theatre" });
  });

  it("rejects unbounded windows and unsupported geography or segments", () => {
    expect(() => parseTicketmasterCliArguments(["--days=365"])).toThrow(
      "7, 30, or 90",
    );
    expect(() => parseTicketmasterCliArguments(["--country=NZ"])).toThrow(
      "AU, US, GB, or CA",
    );
    expect(() => parseTicketmasterCliArguments(["--segment=sports"])).toThrow(
      "music, arts-theatre, film",
    );
  });

  it("uses deterministic UTC half-open day boundaries", () => {
    expect(
      resolveTicketmasterWindow(7, new Date("2026-08-12T22:30:00+10:00")),
    ).toEqual({
      startDate: new Date("2026-08-12T00:00:00Z"),
      endDateExclusive: new Date("2026-08-19T00:00:00Z"),
    });
  });
});
