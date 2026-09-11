import type { ResearchTaskV1 } from "@/services/research/research-types";

export const AU_LIVE_MUSIC_VENUE_VIABILITY_TASK: ResearchTaskV1 = {
  id: "au-live-music-venue-viability",
  version: "au-live-music-venue-viability-v1",
  sector: "Music",
  geography: "Australia",
  objective:
    "Discover fresh, defensible evidence about Australian live-music venue viability.",
  preferredSources: ["APRA AMCOS", "Australian government, parliamentary or regulator sources", "State live-music bodies such as Music Victoria", "Primary industry reports"],
  researchFocus: ["venue counts, closures and openings", "live-music attendance and live-event volume", "venue profitability, viability and employment"],
  existingEvidenceContext: [
    "Culture Tracker already has Australian Ticketmaster Music forward listings and active-venue snapshots. Ticketmaster coverage is not a census and does not establish total demand, closures, or operating viability.",
    "Culture Tracker has ABS recreation-and-culture household-spending series. Those broad consumer measures do not isolate live-music venues.",
    "Culture Tracker has Live Performance Australia annual attendance and revenue evidence for Theatre and Musical Theatre through 2024. It is not an Australian live-music venue census.",
    "Culture Tracker uses Music Venue Trust annual reports as a UK grassroots-venue structural benchmark. Those figures do not describe Australia.",
  ],
};

const RESEARCH_TASKS = new Map<string, ResearchTaskV1>([
  [AU_LIVE_MUSIC_VENUE_VIABILITY_TASK.id, AU_LIVE_MUSIC_VENUE_VIABILITY_TASK],
]);

export const SCHEDULED_RESEARCH_TASKS = [
  {
    task: AU_LIVE_MUSIC_VENUE_VIABILITY_TASK,
    enabled: true,
    cadenceMinutes: 24 * 60,
    priority: 100,
  },
] as const;

export function getResearchTask(taskId: string): ResearchTaskV1 {
  const task = RESEARCH_TASKS.get(taskId);
  if (!task) {
    throw new Error(
      `Unknown research task: ${taskId}. Available task: ${AU_LIVE_MUSIC_VENUE_VIABILITY_TASK.id}.`,
    );
  }
  return task;
}
