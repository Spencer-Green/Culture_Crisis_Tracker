import type { GdeltArticle } from "@/data-sources/news/gdelt-api";
import { getGdeltQueryFamily } from "@/data-sources/news/gdelt-queries";
import {
  GDELT_CONFIDENCE_SCORES,
  type GdeltConfidenceLevel,
  type GdeltCountryCode,
  type GdeltEventType,
  type GdeltPolarity,
  type GdeltSectorSlug,
} from "@/data-sources/news/gdelt-taxonomy";

export type ClassifiedGdeltCandidate = GdeltArticle & {
  eventType: GdeltEventType;
  matchedEventTypes: GdeltEventType[];
  sectorSlug: GdeltSectorSlug;
  countryCode: GdeltCountryCode | null;
  polarity: GdeltPolarity;
  confidenceLevel: GdeltConfidenceLevel;
  confidenceScore: number;
  classificationRationale: string;
};

type ClassificationMatch = {
  eventType: GdeltEventType;
  polarity: GdeltPolarity;
  confidenceLevel: GdeltConfidenceLevel;
  rationale: string;
};

const COUNTRY_PATTERNS: readonly [GdeltCountryCode, RegExp][] = [
  [
    "AU",
    /\b(australia|australian|sydney|melbourne|brisbane|perth|adelaide|hobart|canberra|darwin)\b/i,
  ],
  [
    "US",
    /\b(united states|u\.s\.|american|new york|los angeles|chicago|san francisco|washington dc)\b/i,
  ],
  [
    "GB",
    /\b(united kingdom|britain|british|england|english|scotland|scottish|wales|welsh|northern ireland|london|manchester|edinburgh|glasgow)\b/i,
  ],
  [
    "CA",
    /\b(canada|canadian|toronto|vancouver|montreal|ottawa|calgary|edmonton)\b/i,
  ],
];

export function inferGdeltCountry(title: string): GdeltCountryCode | null {
  const matches = COUNTRY_PATTERNS.filter(([, pattern]) => pattern.test(title));
  return matches.length === 1 ? matches[0][0] : null;
}

export function classifyGdeltSector(title: string): GdeltSectorSlug {
  const sectors: GdeltSectorSlug[] = [];
  if (/\b(music|concert|band|album|recorded music|nightclub)\b/i.test(title)) {
    sectors.push("music");
  }
  if (/\b(film|cinema|movie|box office)\b/i.test(title)) sectors.push("film");
  if (/\b(theatre|theater|stage|performing arts)\b/i.test(title)) {
    sectors.push("theatre");
  }
  if (/\b(video game|gaming|games studio|game studio)\b/i.test(title)) {
    sectors.push("gaming");
  }
  return sectors.length === 1 ? sectors[0] : "industry-events";
}

function matchTitle(title: string): ClassificationMatch | null {
  const venue = /\b(venue|theatre|theater|cinema|nightclub|concert hall)\b/i;
  const atRisk =
    /\b(at risk|under threat|could close|may close|might close|closure likely|facing closure|save (?:the|our))\b/i;
  if (venue.test(title) && atRisk.test(title)) {
    return {
      eventType: "VENUE_AT_RISK",
      polarity: "negative",
      confidenceLevel: "medium",
      rationale:
        "The title describes a cultural venue as threatened, not closed.",
    };
  }
  if (
    venue.test(title) &&
    /\b(to close|closing(?: permanently)?|closes|closed permanently|shut(?:ting)? down|cease(?:d|s)? trading)\b/i.test(
      title,
    )
  ) {
    return {
      eventType: "VENUE_CLOSURE",
      polarity: "negative",
      confidenceLevel: "high",
      rationale: "The title explicitly reports a cultural venue closure.",
    };
  }
  if (
    /\bfestival\b/i.test(title) &&
    /\b(cancelled|canceled|cancellation|called off)\b/i.test(title)
  ) {
    return {
      eventType: "FESTIVAL_CANCELLATION",
      polarity: "negative",
      confidenceLevel: "high",
      rationale: "The title explicitly reports a festival cancellation.",
    };
  }
  if (
    /\btour\b/i.test(title) &&
    /\b(cancelled|canceled|cancellation)\b/i.test(title)
  ) {
    return {
      eventType: "TOUR_CANCELLATION",
      polarity: "negative",
      confidenceLevel: "high",
      rationale: "The title explicitly reports a tour cancellation.",
    };
  }
  if (
    /\b(bankrupt|bankruptcy|insolvent|insolvency|administration|liquidation|receivership)\b/i.test(
      title,
    )
  ) {
    return {
      eventType: "BANKRUPTCY_INSOLVENCY",
      polarity: "negative",
      confidenceLevel: "high",
      rationale: "The title contains explicit insolvency terminology.",
    };
  }
  if (
    /\b(layoffs?|job cuts?|redundancies|staff cuts?|workforce reduction)\b/i.test(
      title,
    )
  ) {
    return {
      eventType: "LAYOFFS",
      polarity: "negative",
      confidenceLevel: "high",
      rationale: "The title explicitly reports workforce reductions.",
    };
  }
  if (
    /\b(funding cut|budget cut|grant cut|subsidy cut|funding withdrawn)\b/i.test(
      title,
    )
  ) {
    return {
      eventType: "FUNDING_CUT",
      polarity: "negative",
      confidenceLevel: "high",
      rationale: "The title explicitly reports a funding reduction.",
    };
  }
  if (/\b(record attendance|attendance record|record crowd)\b/i.test(title)) {
    return {
      eventType: "ATTENDANCE_RECORD",
      polarity: "positive",
      confidenceLevel: "high",
      rationale: "The title explicitly reports record attendance.",
    };
  }
  if (
    venue.test(title) &&
    /\b(opens?|opening|reopens?|reopening)\b/i.test(title)
  ) {
    return {
      eventType: "VENUE_OPENING",
      polarity: "positive",
      confidenceLevel: "high",
      rationale: "The title explicitly reports a cultural venue opening.",
    };
  }
  if (
    /\bfestival\b/i.test(title) &&
    /\b(launch|launches|new festival)\b/i.test(title)
  ) {
    return {
      eventType: "FESTIVAL_LAUNCH",
      polarity: "positive",
      confidenceLevel: "high",
      rationale: "The title explicitly reports a festival launch.",
    };
  }
  if (/\b(revenue growth|revenue rises?|revenue increases?)\b/i.test(title)) {
    return {
      eventType: "REVENUE_GROWTH",
      polarity: "positive",
      confidenceLevel: "medium",
      rationale: "The title reports revenue growth.",
    };
  }
  if (/\b(invests?|investment|expands?|expansion)\b/i.test(title)) {
    return {
      eventType: "INVESTMENT",
      polarity: "positive",
      confidenceLevel: "medium",
      rationale: "The title reports investment or expansion.",
    };
  }
  if (
    /\b(ticket sales|bookings)\b/i.test(title) &&
    /\b(weak|decline|fall|falling|slump|poor|down)\b/i.test(title)
  ) {
    return {
      eventType: "TICKET_SALES_WEAKNESS",
      polarity: "negative",
      confidenceLevel: "medium",
      rationale: "The title reports weakness in ticket demand.",
    };
  }
  if (
    /\b(attendance)\b/i.test(title) &&
    /\b(decline|fall|falling|slump|down)\b/i.test(title)
  ) {
    return {
      eventType: "ATTENDANCE_DECLINE",
      polarity: "negative",
      confidenceLevel: "medium",
      rationale: "The title reports declining attendance.",
    };
  }
  return null;
}

export function classifyGdeltArticle(
  article: GdeltArticle,
): ClassifiedGdeltCandidate {
  const directMatch = matchTitle(article.title);
  const queryMatches = article.queryFamilies
    .map((id) => getGdeltQueryFamily(id))
    .filter((family) => family !== undefined);
  const fallback = queryMatches[0];
  if (!fallback) {
    throw new Error("GDELT article has no recognised query family.");
  }
  const eventType = directMatch?.eventType ?? fallback.fallbackEventType;
  const confidenceLevel = directMatch?.confidenceLevel ?? "low";
  return {
    ...article,
    eventType,
    matchedEventTypes: [
      ...new Set([
        eventType,
        ...queryMatches.map((family) => family.fallbackEventType),
      ]),
    ],
    sectorSlug: classifyGdeltSector(article.title),
    countryCode: inferGdeltCountry(article.title),
    polarity: directMatch?.polarity ?? "neutral/ambiguous",
    confidenceLevel,
    confidenceScore: GDELT_CONFIDENCE_SCORES[confidenceLevel],
    classificationRationale:
      directMatch?.rationale ??
      `The article matched the ${fallback.name.toLowerCase()} query, but its title does not confirm the event.`,
  };
}
