import type {
  MediaEventType,
  MediaPolarity,
  MediaSectorSlug,
} from "@/data-sources/news/media-types";

export type MediaQueryFamily = {
  id: string;
  name: string;
  search: string;
  sector: MediaSectorSlug;
  fallbackEventType: MediaEventType | null;
  fallbackPolarity: MediaPolarity;
  aiRelated: boolean;
};

export const MEDIA_QUERY_FAMILIES = [
  {
    id: "ai-music",
    name: "AI and music",
    search: '(AI | "generative AI") + (music | musician* | songwriter*)',
    sector: "music",
    fallbackEventType: "AI_ADOPTION",
    fallbackPolarity: "neutral/ambiguous",
    aiRelated: true,
  },
  {
    id: "ai-film-tv",
    name: "AI and film or television",
    search:
      '(AI | "generative AI") + (film | television | actor* | screenwriter* | VFX | Hollywood)',
    sector: "film",
    fallbackEventType: "AI_ADOPTION",
    fallbackPolarity: "neutral/ambiguous",
    aiRelated: true,
  },
  {
    id: "ai-theatre",
    name: "AI and performing arts",
    search: 'AI + (theatre | "performing arts" | playwright*)',
    sector: "theatre",
    fallbackEventType: "AI_ADOPTION",
    fallbackPolarity: "neutral/ambiguous",
    aiRelated: true,
  },
  {
    id: "ai-gaming",
    name: "AI and games",
    search:
      'AI + ("video games" | "game developer" | "game studio" | ("voice actor" + games))',
    sector: "gaming",
    fallbackEventType: "AI_ADOPTION",
    fallbackPolarity: "neutral/ambiguous",
    aiRelated: true,
  },
  {
    id: "ai-rights-policy",
    name: "AI creative rights and policy",
    search:
      'AI + ((copyright + artist*) | (licensing + creative*) | ("training data" + music) | (regulation + "creative industr*"))',
    sector: "ai-policy",
    fallbackEventType: "AI_POLICY_REGULATION",
    fallbackPolarity: "neutral/ambiguous",
    aiRelated: true,
  },
  {
    id: "venue-closures",
    name: "Cultural venue closures",
    search:
      '("music venue" | "concert venue" | cinema | theatre | "game studio") + (closure | closing | "shut down")',
    sector: "industry-events",
    fallbackEventType: "CLOSURE",
    fallbackPolarity: "negative",
    aiRelated: false,
  },
  {
    id: "layoffs",
    name: "Creative-industry layoffs",
    search:
      '("music industry" | "film industry" | "game studio" | theatre) + (layoffs | redundancies | "job cuts" | "staff cuts")',
    sector: "industry-events",
    fallbackEventType: "LAYOFFS",
    fallbackPolarity: "negative",
    aiRelated: false,
  },
  {
    id: "insolvency",
    name: "Creative-industry insolvency",
    search:
      '(music | film | cinema | theatre | festival | venue | "game studio") + (bankruptcy | insolvency | administration | liquidation | receivership)',
    sector: "industry-events",
    fallbackEventType: "BANKRUPTCY_INSOLVENCY",
    fallbackPolarity: "negative",
    aiRelated: false,
  },
  {
    id: "cancellations",
    name: "Festival, tour, and production cancellations",
    search:
      '(festival | tour | "theatre production") + (cancelled | canceled | cancellation | "called off")',
    sector: "industry-events",
    fallbackEventType: "CANCELLATION",
    fallbackPolarity: "negative",
    aiRelated: false,
  },
  {
    id: "demand-weakness",
    name: "Cultural demand weakness",
    search:
      '(("ticket sales" | attendance | "box office" | bookings) + (decline | falling | slump | "poor sales")) + (music | film | cinema | theatre | festival | gaming)',
    sector: "industry-events",
    fallbackEventType: "DEMAND_WEAKNESS",
    fallbackPolarity: "negative",
    aiRelated: false,
  },
  {
    id: "funding-cuts",
    name: "Arts and culture funding cuts",
    search:
      '("arts funding" | "culture funding" | (theatre + subsidy) | (festival + grant)) + (cut | cuts | withdrawn)',
    sector: "industry-events",
    fallbackEventType: "FUNDING_CUT",
    fallbackPolarity: "negative",
    aiRelated: false,
  },
  {
    id: "consolidation",
    name: "Cultural-industry consolidation",
    search:
      '(music | "film studio" | "game publisher" | theatre) + (acquisition | merger | consolidation)',
    sector: "industry-events",
    fallbackEventType: "CONSOLIDATION_ACQUISITION",
    fallbackPolarity: "neutral/ambiguous",
    aiRelated: false,
  },
  {
    id: "positive-openings",
    name: "Openings and launches",
    search:
      '("music venue" | cinema | theatre | festival) + (opening | launch | launches)',
    sector: "industry-events",
    fallbackEventType: "OPENING",
    fallbackPolarity: "positive",
    aiRelated: false,
  },
  {
    id: "positive-investment",
    name: "Cultural investment and funding",
    search:
      '(arts | music | theatre | "film studio" | "game studio") + (investment | "funding increase" | grant)',
    sector: "industry-events",
    fallbackEventType: "INVESTMENT",
    fallbackPolarity: "positive",
    aiRelated: false,
  },
  {
    id: "positive-growth",
    name: "Attendance and revenue growth",
    search:
      '(festival | music | theatre | cinema | gaming) + ("record attendance" | "box office record" | "revenue growth" | "attendance growth")',
    sector: "industry-events",
    fallbackEventType: "REVENUE_GROWTH",
    fallbackPolarity: "positive",
    aiRelated: false,
  },
  {
    id: "positive-expansion",
    name: "Hiring and expansion",
    search:
      '("game studio" | "film studio" | "music venue" | theatre | publisher) + (expansion | hiring | investment)',
    sector: "industry-events",
    fallbackEventType: "EXPANSION",
    fallbackPolarity: "positive",
    aiRelated: false,
  },
] as const satisfies readonly MediaQueryFamily[];

export function getMediaQueryFamily(id: string): MediaQueryFamily | undefined {
  return MEDIA_QUERY_FAMILIES.find((family) => family.id === id);
}
