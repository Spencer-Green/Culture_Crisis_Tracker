import type {
  GdeltCountryCode,
  GdeltEventType,
  GdeltPolarity,
} from "@/data-sources/news/gdelt-taxonomy";
import { GDELT_SOURCE_COUNTRY_FILTERS } from "@/data-sources/news/gdelt-taxonomy";

export const GDELT_QUERY_FAMILY_IDS = [
  "venue-closure",
  "festival-cancellation",
  "insolvency-bankruptcy",
  "layoffs",
  "funding-cuts",
  "demand-weakness",
  "positive-signals",
] as const;

export type GdeltQueryFamilyId = (typeof GDELT_QUERY_FAMILY_IDS)[number];

export type GdeltQueryFamily = {
  id: GdeltQueryFamilyId;
  name: string;
  purpose: string;
  query: string;
  fallbackEventType: GdeltEventType;
  expectedPolarity: GdeltPolarity;
};

export const GDELT_QUERY_FAMILIES: readonly GdeltQueryFamily[] = [
  {
    id: "venue-closure",
    name: "Venue closure",
    purpose: "Closures and threatened closures of cultural venues.",
    query:
      '("music venue" OR "concert venue" OR "arts venue" OR nightclub OR theatre OR cinema) (closing OR closure OR "shut down" OR "cease trading")',
    fallbackEventType: "VENUE_CLOSURE",
    expectedPolarity: "negative",
  },
  {
    id: "festival-cancellation",
    name: "Festival stress",
    purpose: "Festival cancellations, collapses, and closures.",
    query:
      '("music festival" OR "film festival" OR "arts festival" OR "theatre festival") (cancelled OR canceled OR cancellation OR collapse OR closure OR "called off")',
    fallbackEventType: "FESTIVAL_CANCELLATION",
    expectedPolarity: "negative",
  },
  {
    id: "insolvency-bankruptcy",
    name: "Insolvency and bankruptcy",
    purpose: "Financial failure involving cultural organisations.",
    query:
      '(music OR film OR cinema OR theatre OR festival OR venue OR studio OR publisher OR "game studio") (bankrupt OR bankruptcy OR insolvent OR insolvency OR administration OR liquidation OR receivership)',
    fallbackEventType: "BANKRUPTCY_INSOLVENCY",
    expectedPolarity: "negative",
  },
  {
    id: "layoffs",
    name: "Cultural-sector layoffs",
    purpose: "Workforce reductions in cultural organisations.",
    query:
      '(music OR film OR cinema OR theatre OR festival OR publisher OR "game studio") (layoffs OR "job cuts" OR redundancies OR "staff cuts" OR "workforce reduction")',
    fallbackEventType: "LAYOFFS",
    expectedPolarity: "negative",
  },
  {
    id: "funding-cuts",
    name: "Arts funding cuts",
    purpose: "Reductions or withdrawals of cultural funding.",
    query:
      '(arts OR cultural OR theatre OR music OR film OR festival) ("funding cut" OR "budget cut" OR "grant cut" OR "subsidy cut" OR "funding withdrawn")',
    fallbackEventType: "FUNDING_CUT",
    expectedPolarity: "negative",
  },
  {
    id: "demand-weakness",
    name: "Demand weakness",
    purpose: "Weak ticket sales, attendance, box office, or bookings.",
    query:
      '(festival OR venue OR cinema OR theatre OR "live music") ("ticket sales" OR attendance OR "box office" OR bookings) (weak OR decline OR falling OR slump OR "poor sales")',
    fallbackEventType: "TICKET_SALES_WEAKNESS",
    expectedPolarity: "negative",
  },
  {
    id: "positive-signals",
    name: "Positive counter-signals",
    purpose: "Openings, launches, investment, hiring, and expansion.",
    query:
      '(venue OR festival OR theatre OR cinema OR "game studio" OR publisher) (opening OR launch OR investment OR hiring OR expansion OR "record attendance" OR "revenue growth")',
    fallbackEventType: "BUSINESS_EXPANSION",
    expectedPolarity: "positive",
  },
] as const;

export function getGdeltQueryFamily(id: string): GdeltQueryFamily | undefined {
  return GDELT_QUERY_FAMILIES.find((family) => family.id === id);
}

export function buildGdeltQuery(
  family: GdeltQueryFamily,
  countryCode?: GdeltCountryCode,
): string {
  if (countryCode) {
    return `${family.query} sourcecountry:${GDELT_SOURCE_COUNTRY_FILTERS[countryCode]}`;
  }

  const scope = Object.values(GDELT_SOURCE_COUNTRY_FILTERS)
    .map((country) => `sourcecountry:${country}`)
    .join(" OR ");
  return `${family.query} (${scope})`;
}
