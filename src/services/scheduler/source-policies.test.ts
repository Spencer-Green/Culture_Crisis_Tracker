import { describe, expect, it } from "vitest";

import { SOURCE_DEFINITIONS } from "@/data-sources/catalog";
import { buildScheduledSourceDefinitions } from "@/services/scheduler/source-policies";

const definitions = buildScheduledSourceDefinitions({
  mediaRefreshHours: 3,
  ticketmasterRefreshHours: 24,
  gamingRefreshHours: 24,
  lunaSynthesisEnabled: true,
  lunaSynthesisRefreshHours: 3,
  lunaSynthesisMaxPerCycle: 4,
  lunaSynthesisDailyCallLimit: 16,
  lunaSynthesisLookbackHours: 48,
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

  it("schedules institutional feeds independently from the three-hour media cycle", () => {
    expect(source("copyright-newsnet")).toMatchObject({
      schedulingClass: "DAILY",
      cadenceMinutes: 1_440,
    });
    expect(source("nist-information-technology").cadenceMinutes).toBe(1_440);
    for (const sourceId of [
      "cfpb-newsroom",
      "ftc-competition",
      "ftc-consumer-protection",
      "uk-dsit",
      "uk-ipo",
      "uk-cma",
      "eu-dg-connect",
    ]) {
      const definition = source(sourceId);
      expect(definition).toMatchObject({
        schedulingClass: "RELEASE_AWARE",
        cadenceMinutes: 720,
      });
      expect(definition.commands(new Date())[0].args).toEqual([
        "--hours=72",
        `--source=${sourceId}`,
      ]);
    }
    expect(source("rss").commands(new Date())[0].args).toEqual(["--hours=24"]);
  });

  it("schedules specialist feeds separately with their approved cadence", () => {
    for (const sourceId of [
      "tech-policy-press",
      "lawfare-cybersecurity-tech",
      "kluwer-copyright-blog",
      "blood-in-the-machine",
    ]) {
      expect(source(sourceId)).toMatchObject({
        schedulingClass: "RELEASE_AWARE",
        cadenceMinutes: 720,
      });
    }
    for (const sourceId of [
      "cset",
      "ai-now-institute",
      "normal-technology",
      "chinai",
      "authors-alliance",
      "creative-commons",
    ]) {
      expect(source(sourceId)).toMatchObject({
        schedulingClass: "DAILY",
        cadenceMinutes: 1_440,
      });
    }
    expect(source("tech-policy-press").commands(new Date())[0].args).toEqual([
      "--hours=72",
      "--source=tech-policy-press",
    ]);
    expect(source("chinai").commands(new Date())[0].args).toEqual([
      "--hours=168",
      "--source=chinai",
    ]);
    expect(source("rss").commands(new Date())[0].args).toEqual(["--hours=24"]);
  });

  it("runs Luna as a bounded asynchronous scheduler source", () => {
    expect(source("luna-story-synthesis")).toMatchObject({
      schedulingClass: "RELEASE_AWARE",
      cadenceMinutes: 180,
      automatic: true,
    });
    expect(source("luna-story-synthesis").commands(new Date())[0]).toEqual({
      label: "Luna story synthesis",
      script: "scripts/generate-luna-story-syntheses.ts",
      args: ["--scheduled", "--limit=4", "--daily-limit=16", "--hours=48"],
    });
  });

  it("keeps automatic Luna calls disabled until explicitly enabled", () => {
    const disabled = buildScheduledSourceDefinitions({
      mediaRefreshHours: 3,
      ticketmasterRefreshHours: 24,
      gamingRefreshHours: 24,
      lunaSynthesisEnabled: false,
      lunaSynthesisRefreshHours: 3,
      lunaSynthesisMaxPerCycle: 4,
      lunaSynthesisDailyCallLimit: 16,
      lunaSynthesisLookbackHours: 48,
    }).find((definition) => definition.sourceId === "luna-story-synthesis");
    expect(disabled).toMatchObject({
      schedulingClass: "MANUAL_ONLY",
      cadenceMinutes: null,
      automatic: false,
    });
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

  it("checks Screen Australia weekly with one current-snapshot command", () => {
    expect(source("screen-australia")).toMatchObject({
      schedulingClass: "WEEKLY",
      cadenceMinutes: 10_080,
      automatic: true,
      routineScope: "Current widget snapshot only; no archive or backfill",
    });
    expect(source("screen-australia").commands(new Date())).toEqual([
      {
        label: "Screen Australia current box office",
        script: "scripts/ingest-screen-australia.ts",
        args: [],
      },
    ]);
  });

  it("bounds the daily StatCan refresh to eight validated quarters", () => {
    expect(source("statcan").commands(new Date())[0].args).toEqual([
      "--start=2024-Q2",
      "--end=2026-Q1",
    ]);
  });
});
