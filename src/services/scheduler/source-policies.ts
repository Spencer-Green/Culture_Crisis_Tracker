import type { SourceSlug } from "@/data-sources/catalog";
import { STATCAN_TABLE } from "@/data-sources/macro/statcan-metrics";
import type {
  ScheduledCommand,
  ScheduledSourceDefinition,
} from "@/services/scheduler/types";

const DAY_MINUTES = 24 * 60;
const WEEK_MINUTES = 7 * DAY_MINUTES;
const MONTH_MINUTES = 30 * DAY_MINUTES;

export type SchedulerPolicyConfig = {
  mediaRefreshHours: number;
  ticketmasterRefreshHours: number;
  gamingRefreshHours: number;
  lunaSynthesisEnabled: boolean;
  lunaSynthesisRefreshHours: number;
  lunaSynthesisMaxPerCycle: number;
  lunaSynthesisDailyCallLimit: number;
  lunaSynthesisLookbackHours: number;
  researcherEnabled: boolean;
};

function command(
  label: string,
  script: string,
  args: string[] = [],
): ScheduledCommand {
  return { label, script, args };
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function shiftedDate(now: Date, days: number) {
  return new Date(now.getTime() + days * 86_400_000);
}

function quarterPeriod(date: Date) {
  return `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
}

function recentCompletedQuarterRange(now: Date) {
  const currentQuarterStart = new Date(
    Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1),
  );
  const end = new Date(currentQuarterStart);
  end.setUTCMonth(end.getUTCMonth() - 3);
  const start = new Date(end);
  start.setUTCMonth(start.getUTCMonth() - 21);
  return { start: quarterPeriod(start), end: quarterPeriod(end) };
}

function trailingQuarterRange(endPeriod: string, count: number) {
  const match = /^(\d{4})-Q([1-4])$/.exec(endPeriod);
  if (!match) throw new Error(`Invalid quarterly period ${endPeriod}.`);
  const endIndex = Number(match[1]) * 4 + Number(match[2]) - 1;
  const startIndex = endIndex - count + 1;
  const year = Math.floor(startIndex / 4);
  const quarter = (startIndex % 4) + 1;
  return { start: `${year}-Q${quarter}`, end: endPeriod };
}

export function buildScheduledSourceDefinitions(
  config: SchedulerPolicyConfig,
): ScheduledSourceDefinition[] {
  const definitions: ScheduledSourceDefinition[] = [
    {
      sourceId: "abs",
      schedulingClass: "DAILY",
      cadenceMinutes: DAY_MINUTES,
      automatic: true,
      networkKind: "networked",
      publicationFrequency: "Monthly nominal; quarterly chain volume",
      requestIntensity:
        "Low; six metric-series requests across two bounded commands",
      routineScope: "Recent monthly window plus eight completed real quarters",
      commands: (now) => {
        const quarters = recentCompletedQuarterRange(now);
        return [
          command("ABS monthly", "scripts/ingest-abs.ts"),
          command("ABS quarterly real", "scripts/ingest-abs-real.ts", [
            `--start=${quarters.start}`,
            `--end=${quarters.end}`,
          ]),
        ];
      },
    },
    {
      sourceId: "bea",
      schedulingClass: "DAILY",
      cadenceMinutes: DAY_MINUTES,
      automatic: true,
      networkKind: "networked",
      publicationFrequency:
        "Monthly; ACPSA historical subresource is discontinued",
      requestIntensity:
        "Low-to-moderate; metadata plus bounded monthly series requests",
      routineScope:
        "Recent macro and detailed music PCE only; excludes ACPSA archive",
      commands: () => [
        command("BEA macro", "scripts/ingest-bea.ts"),
        command("BEA music PCE", "scripts/ingest-bea-music.ts", ["--routine"]),
      ],
      notes:
        "ACPSA remains structural/static and is never invoked by the scheduler.",
    },
    {
      sourceId: "fred",
      schedulingClass: "DAILY",
      cadenceMinutes: DAY_MINUTES,
      automatic: true,
      networkKind: "networked",
      publicationFrequency: "Monthly source series",
      requestIntensity: "Low; four bounded series requests",
      routineScope: "Latest twelve months",
      commands: () => [command("FRED", "scripts/ingest-fred.ts")],
    },
    {
      sourceId: "ons",
      schedulingClass: "DAILY",
      cadenceMinutes: DAY_MINUTES,
      automatic: true,
      networkKind: "networked",
      publicationFrequency: "Quarterly",
      requestIntensity: "Low; bounded recent-quarter requests",
      routineScope: "Latest eight quarters",
      commands: () => [command("ONS", "scripts/ingest-ons.ts")],
    },
    {
      sourceId: "eurostat",
      schedulingClass: "STRUCTURAL_STATIC",
      cadenceMinutes: null,
      automatic: false,
      networkKind: "networked",
      publicationFrequency: "Annual structural benchmark",
      requestIntensity: "Low; one compact dataset response",
      routineScope: "Manual structural refresh only",
      commands: () => [],
    },
    {
      sourceId: "statcan",
      schedulingClass: "DAILY",
      cadenceMinutes: DAY_MINUTES,
      automatic: true,
      networkKind: "networked",
      publicationFrequency: "Quarterly",
      requestIntensity: "Low; six vector requests",
      routineScope: "Latest eight validated quarters",
      commands: () => {
        const quarters = trailingQuarterRange(
          STATCAN_TABLE.latestValidatedQuarter,
          8,
        );
        return [
          command("Statistics Canada", "scripts/ingest-statcan.ts", [
            `--start=${quarters.start}`,
            `--end=${quarters.end}`,
          ]),
        ];
      },
    },
    {
      sourceId: "gdelt",
      schedulingClass: "DISABLED_OR_BLOCKED",
      cadenceMinutes: null,
      automatic: false,
      networkKind: "networked",
      publicationFrequency: "Continuous",
      requestIntensity: "Potentially high across query families",
      routineScope: "Manual retry only",
      commands: () => [],
      blockedReason: "Upstream GDELT DOC API continues to return HTTP 429.",
    },
    {
      sourceId: "ticketmaster",
      schedulingClass: "DAILY",
      cadenceMinutes: config.ticketmasterRefreshHours * 60,
      automatic: true,
      networkKind: "networked",
      publicationFrequency: "Continuous forward listings",
      requestIntensity:
        "Moderate; 12 base partitions plus density-driven pagination",
      routineScope:
        "Seven-day forward window only; never a scheduled 90-day population",
      commands: () => [
        command(
          "Ticketmaster bounded snapshot",
          "scripts/ingest-ticketmaster.ts",
          ["--days=7"],
        ),
      ],
    },
    {
      sourceId: "steam",
      schedulingClass: "DAILY",
      cadenceMinutes: config.gamingRefreshHours * 60,
      automatic: true,
      networkKind: "networked",
      publicationFrequency: "Point-in-time",
      requestIntensity:
        "Moderate; up to three Valve requests for each of 100 mapped titles",
      routineScope: "Stable first 100-title sample; no catalog enumeration",
      commands: () => [
        command("Steam sample", "scripts/ingest-steam.ts", [
          "--limit=100",
          "--offset=0",
        ]),
      ],
    },
    {
      sourceId: "igdb",
      schedulingClass: "DAILY",
      cadenceMinutes: config.gamingRefreshHours * 60,
      automatic: true,
      networkKind: "networked",
      publicationFrequency: "Continuous metadata",
      requestIntensity:
        "Moderate; roughly nine monthly partitions plus pagination",
      routineScope: "Trailing 90 days through upcoming 180 days",
      commands: (now) => [
        command("IGDB recent and upcoming", "scripts/ingest-igdb.ts", [
          `--start=${isoDate(shiftedDate(now, -90))}`,
          `--end=${isoDate(shiftedDate(now, 180))}`,
        ]),
      ],
    },
    {
      sourceId: "thenewsapi",
      schedulingClass: "HIGH_FREQUENCY",
      cadenceMinutes: config.mediaRefreshHours * 60,
      automatic: true,
      networkKind: "networked",
      publicationFrequency: "Continuous",
      requestIntensity:
        "Ten requests per run; at three hours, at most 80 requests/day",
      routineScope:
        "Five structural AI and five cultural-industry event families, 24-hour article window",
      commands: () => [
        command("TheNewsAPI", "scripts/ingest-media-newsapi.ts", [
          "--hours=24",
          "--max-requests=10",
        ]),
      ],
    },
    {
      sourceId: "rss",
      schedulingClass: "HIGH_FREQUENCY",
      cadenceMinutes: config.mediaRefreshHours * 60,
      automatic: true,
      networkKind: "networked",
      publicationFrequency: "Continuous",
      requestIntensity: "Low; enabled feeds fetched sequentially",
      routineScope: "Enabled curated feeds, 24-hour entry window",
      commands: () => [
        command("Curated RSS", "scripts/ingest-media-rss.ts", ["--hours=24"]),
      ],
    },
    ...[
      {
        sourceId: "copyright-newsnet" as const,
        cadenceMinutes: DAY_MINUTES,
        publicationFrequency: "Irregular official announcements",
      },
      {
        sourceId: "cfpb-newsroom" as const,
        cadenceMinutes: 12 * 60,
        publicationFrequency: "Irregular official newsroom releases",
      },
      {
        sourceId: "ftc-competition" as const,
        cadenceMinutes: 12 * 60,
        publicationFrequency: "Irregular official competition releases",
      },
      {
        sourceId: "ftc-consumer-protection" as const,
        cadenceMinutes: 12 * 60,
        publicationFrequency: "Irregular official consumer-protection releases",
      },
      {
        sourceId: "nist-information-technology" as const,
        cadenceMinutes: DAY_MINUTES,
        publicationFrequency: "Irregular official publications and news",
      },
      {
        sourceId: "uk-dsit" as const,
        cadenceMinutes: 12 * 60,
        publicationFrequency: "Irregular official GOV.UK publications",
      },
      {
        sourceId: "uk-ipo" as const,
        cadenceMinutes: 12 * 60,
        publicationFrequency: "Irregular official GOV.UK publications",
      },
      {
        sourceId: "uk-cma" as const,
        cadenceMinutes: 12 * 60,
        publicationFrequency: "Irregular official GOV.UK publications",
      },
      {
        sourceId: "eu-dg-connect" as const,
        cadenceMinutes: 12 * 60,
        publicationFrequency: "Irregular European Commission releases",
      },
    ].map(
      ({ sourceId, cadenceMinutes, publicationFrequency }) =>
        ({
          sourceId,
          schedulingClass:
            cadenceMinutes === DAY_MINUTES ? "DAILY" : "RELEASE_AWARE",
          cadenceMinutes,
          automatic: true,
          networkKind: "networked",
          publicationFrequency,
          requestIntensity: "Minimal; one bounded RSS or Atom request",
          routineScope: "Single feed, trailing 72-hour window; no pagination",
          commands: () => [
            command(sourceId, "scripts/ingest-media-rss.ts", [
              "--hours=72",
              `--source=${sourceId}`,
            ]),
          ],
          notes:
            "Primary institutional evidence; scheduled separately from the three-hour media cycle.",
        }) satisfies ScheduledSourceDefinition,
    ),
    ...[
      {
        sourceId: "tech-policy-press" as const,
        cadenceMinutes: 12 * 60,
        windowHours: 72,
      },
      {
        sourceId: "lawfare-cybersecurity-tech" as const,
        cadenceMinutes: 12 * 60,
        windowHours: 168,
      },
      {
        sourceId: "cset" as const,
        cadenceMinutes: DAY_MINUTES,
        windowHours: 168,
      },
      {
        sourceId: "ai-now-institute" as const,
        cadenceMinutes: DAY_MINUTES,
        windowHours: 168,
      },
      {
        sourceId: "kluwer-copyright-blog" as const,
        cadenceMinutes: 12 * 60,
        windowHours: 168,
      },
      {
        sourceId: "normal-technology" as const,
        cadenceMinutes: DAY_MINUTES,
        windowHours: 168,
      },
      {
        sourceId: "blood-in-the-machine" as const,
        cadenceMinutes: 12 * 60,
        windowHours: 168,
      },
      {
        sourceId: "chinai" as const,
        cadenceMinutes: DAY_MINUTES,
        windowHours: 168,
      },
      {
        sourceId: "authors-alliance" as const,
        cadenceMinutes: DAY_MINUTES,
        windowHours: 168,
      },
      {
        sourceId: "creative-commons" as const,
        cadenceMinutes: DAY_MINUTES,
        windowHours: 168,
      },
    ].map(
      ({ sourceId, cadenceMinutes, windowHours }) =>
        ({
          sourceId,
          schedulingClass:
            cadenceMinutes === DAY_MINUTES ? "DAILY" : "RELEASE_AWARE",
          cadenceMinutes,
          automatic: true,
          networkKind: "networked",
          publicationFrequency: "Irregular specialist analysis",
          requestIntensity: "Minimal; one bounded RSS request",
          routineScope: `Single specialist feed, trailing ${windowHours}-hour window; no pagination or full-text fetch`,
          commands: () => [
            command(sourceId, "scripts/ingest-media-rss.ts", [
              `--hours=${windowHours}`,
              `--source=${sourceId}`,
            ]),
          ],
          notes:
            "Specialist analysis scheduled separately from the three-hour journalism cycle.",
        }) satisfies ScheduledSourceDefinition,
    ),
    {
      sourceId: "research-agent",
      schedulingClass: config.researcherEnabled
        ? "RELEASE_AWARE"
        : "MANUAL_ONLY",
      cadenceMinutes: config.researcherEnabled ? 12 * 60 : null,
      automatic: config.researcherEnabled,
      networkKind: "networked",
      publicationFrequency: "Daily bounded shadow research task",
      requestIntensity:
        "At most one task per scheduler cycle and two completed executions per rolling 24 hours",
      routineScope:
        "One versioned Australian live-music venue viability task; staged evidence only",
      commands: () => [],
      notes:
        "Operational research subsystem source; discovered publishers remain separate staged evidence and no candidate is automatically ingested or approved.",
    },
    {
      sourceId: "luna-story-synthesis",
      schedulingClass: config.lunaSynthesisEnabled
        ? "RELEASE_AWARE"
        : "MANUAL_ONLY",
      cadenceMinutes: config.lunaSynthesisEnabled
        ? config.lunaSynthesisRefreshHours * 60
        : null,
      automatic: config.lunaSynthesisEnabled,
      networkKind: "networked",
      publicationFrequency: "Precomputed after recent evidence is available",
      requestIntensity: `At most ${config.lunaSynthesisMaxPerCycle} model calls per cycle and ${config.lunaSynthesisDailyCallLimit} per rolling day`,
      routineScope: `Eligible clusters from the trailing ${config.lunaSynthesisLookbackHours} hours; unchanged evidence is reused`,
      commands: () => [
        command(
          "Luna story synthesis",
          "scripts/generate-luna-story-syntheses.ts",
          [
            "--scheduled",
            `--limit=${config.lunaSynthesisMaxPerCycle}`,
            `--daily-limit=${config.lunaSynthesisDailyCallLimit}`,
            `--hours=${config.lunaSynthesisLookbackHours}`,
          ],
        ),
      ],
      notes:
        "Asynchronous validated interpretation only; never runs from a page request and never changes deterministic classification or ranking.",
    },
    {
      sourceId: "us-box-office",
      schedulingClass: "DAILY",
      cadenceMinutes: DAY_MINUTES,
      automatic: true,
      networkKind: "networked",
      publicationFrequency: "Weekly",
      requestIntensity: "Low; one small community dataset download",
      routineScope: "Current calendar year only",
      commands: (now) => [
        command("US box office", "scripts/ingest-us-box-office.ts", [
          `--start=${now.getUTCFullYear()}`,
        ]),
      ],
    },
    {
      sourceId: "broadway-business",
      schedulingClass: "DAILY",
      cadenceMinutes: DAY_MINUTES,
      automatic: true,
      networkKind: "networked",
      publicationFrequency: "Weekly",
      requestIntensity: "Low; recent 91-day structured query",
      routineScope: "Recent weeks only",
      commands: () => [
        command("Broadway Business", "scripts/ingest-broadway-business.ts"),
      ],
    },
    {
      sourceId: "bfi",
      schedulingClass: "DAILY",
      cadenceMinutes: DAY_MINUTES,
      automatic: true,
      networkKind: "networked",
      publicationFrequency: "Weekly reports; annual structural tables",
      requestIntensity: "Low-to-moderate; current-year index and reports",
      routineScope: "Current calendar year only",
      commands: (now) => [
        command("BFI", "scripts/ingest-bfi.ts", [
          `--since=${now.getUTCFullYear()}`,
        ]),
      ],
    },
    {
      sourceId: "screen-australia",
      schedulingClass: "WEEKLY",
      cadenceMinutes: WEEK_MINUTES,
      automatic: true,
      networkKind: "networked",
      publicationFrequency: "Weekly public widget, generally updated Monday",
      requestIntensity: "Minimal; exactly one public HTML request",
      routineScope: "Current widget snapshot only; no archive or backfill",
      commands: () => [
        command(
          "Screen Australia current box office",
          "scripts/ingest-screen-australia.ts",
        ),
      ],
      notes:
        "Provisional private/research ingestion; public deployment rights require reassessment.",
    },
    {
      sourceId: "mvt",
      schedulingClass: "MONTHLY_CHECK",
      cadenceMinutes: MONTH_MINUTES,
      automatic: true,
      networkKind: "local-static",
      publicationFrequency: "Annual",
      requestIntensity: "None; versioned official-report statistical mapping",
      routineScope: "Known reviewed report mappings only",
      commands: () => [command("MVT", "scripts/ingest-mvt.ts")],
      notes: "A scheduler run cannot discover an unregistered future report.",
    },
    {
      sourceId: "census",
      schedulingClass: "MONTHLY_CHECK",
      cadenceMinutes: MONTH_MINUTES,
      automatic: true,
      networkKind: "networked",
      publicationFrequency: "Annual",
      requestIntensity: "Low; two official current-vintage ZIP files",
      routineScope: "Configured AIES vintage only",
      commands: () => [
        command("Census AIES", "scripts/ingest-census-music.ts"),
      ],
    },
    {
      sourceId: "lpa",
      schedulingClass: "MONTHLY_CHECK",
      cadenceMinutes: MONTH_MINUTES,
      automatic: true,
      networkKind: "networked",
      publicationFrequency: "Annual",
      requestIntensity: "Low; one official report bundle",
      routineScope: "Latest two report years only",
      commands: (now) => [
        command("Live Performance Australia", "scripts/ingest-lpa.ts", [
          `--since=${now.getUTCFullYear() - 1}`,
        ]),
      ],
    },
  ];

  const represented = new Set<SourceSlug>(
    definitions.map((definition) => definition.sourceId),
  );
  const disabled: SourceSlug[] = ["stats-nz", "eventbrite", "mediastack"];
  for (const sourceId of disabled) {
    if (represented.has(sourceId)) continue;
    definitions.push({
      sourceId,
      schedulingClass: "DISABLED_OR_BLOCKED",
      cadenceMinutes: null,
      automatic: false,
      networkKind: "none",
      publicationFrequency: "Not implemented",
      requestIntensity: "None",
      routineScope: "No scheduled action",
      commands: () => [],
      blockedReason: "Provider is not implemented and is disabled.",
    });
  }
  return definitions;
}

export function getScheduledSourceDefinition(
  definitions: readonly ScheduledSourceDefinition[],
  sourceId: string,
) {
  return definitions.find((definition) => definition.sourceId === sourceId);
}
