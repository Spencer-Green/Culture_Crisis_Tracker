import { describe, expect, it } from "vitest";

import { SOURCE_DEFINITIONS } from "@/data-sources/catalog";
import { buildScheduledSourceDefinitions } from "@/services/scheduler/source-policies";

const definitions = buildScheduledSourceDefinitions({
  mediaRefreshHours: 3,
  ticketmasterRefreshHours: 24,
  gamingRefreshHours: 24,
});

function source(sourceId: string) {
  return definitions.find((definition) => definition.sourceId === sourceId)!;
}

describe("scheduler source inventory", () => {
  it("classifies every provider without adding or omitting a source", () => {
    expect(definitions.map((item) => item.sourceId).sort()).toEqual(
      SOURCE_DEFINITIONS.map((item) => item.slug).sort(),
    );
  });

  it("keeps Ticketmaster bounded to a seven-day routine snapshot", () => {
    const commands = source("ticketmaster").commands(
      new Date("2026-08-16T00:00:00Z"),
    );
    expect(commands).toHaveLength(1);
    expect(commands[0].args).toEqual(["--days=7"]);
    expect(commands[0].args.join(" ")).not.toMatch(/90|since|backfill/i);
  });

  it("keeps scheduled BEA work recent and excludes the ACPSA archive", () => {
    const commands = source("bea").commands(new Date());
    expect(commands.map((item) => item.script)).toEqual([
      "scripts/ingest-bea.ts",
      "scripts/ingest-bea-music.ts",
    ]);
    expect(commands[1].args).toEqual(["--routine"]);
    expect(JSON.stringify(commands)).not.toContain("acpsa");
  });

  it("caps scheduled TheNewsAPI usage below the free daily quota", () => {
    expect(source("thenewsapi").cadenceMinutes).toBe(180);
    expect(source("thenewsapi").commands(new Date())[0].args).toEqual([
      "--hours=24",
      "--max-requests=10",
    ]);
  });

  it("marks GDELT blocked and ACPSA's provider note structural", () => {
    expect(source("gdelt")).toMatchObject({
      automatic: false,
      schedulingClass: "DISABLED_OR_BLOCKED",
    });
    expect(source("bea").notes).toContain("ACPSA");
    expect(source("eurostat").schedulingClass).toBe("STRUCTURAL_STATIC");
  });

  it("uses only bounded recent or current-year routine arguments", () => {
    const now = new Date("2026-08-16T00:00:00Z");
    expect(source("igdb").commands(now)[0].args).toEqual([
      "--start=2026-05-18",
      "--end=2027-02-12",
    ]);
    expect(source("us-box-office").commands(now)[0].args).toEqual([
      "--start=2026",
    ]);
    expect(source("bfi").commands(now)[0].args).toEqual(["--since=2026"]);
    expect(source("lpa").commands(now)[0].args).toEqual(["--since=2025"]);
  });

  it("bounds the daily StatCan refresh to eight validated quarters", () => {
    expect(source("statcan").commands(new Date())[0].args).toEqual([
      "--start=2024-Q2",
      "--end=2026-Q1",
    ]);
  });
});
