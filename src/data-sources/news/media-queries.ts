import type {
  MediaEventType,
  MediaPolarity,
  MediaSectorSlug,
} from "@/data-sources/news/media-types";

export type MediaQueryFamily = {
  id: string;
  name: string;
  search: string;
  sort?: "published_at" | "relevance_score";
  sector: MediaSectorSlug;
  fallbackEventType: MediaEventType | null;
  fallbackPolarity: MediaPolarity;
  aiRelated: boolean;
};

export const MEDIA_QUERY_FAMILIES = [
  {
    id: "ai-frontier-capabilities",
    name: "AI frontier models and capabilities",
    search:
      '(AI | "artificial intelligence") + ("frontier model" | "foundation model" | "reasoning model" | "multimodal model" | "AI agent" | "inference model") + (launch* | release* | deploy* | benchmark* | capability | reasoning | inference) -guide -tutorial',
    sort: "relevance_score",
    sector: "ai-policy",
    fallbackEventType: null,
    fallbackPolarity: "neutral/ambiguous",
    aiRelated: true,
  },
  {
    id: "ai-compute-infrastructure",
    name: "AI compute, semiconductors, infrastructure, and energy",
    search:
      'AI + (GPU* | accelerator* | "AI chip" | semiconductor* | "data center" | "data centre" | "compute capacity" | "power agreement" | "nuclear power") + (launch* | build* | expand* | invest* | capacity | supply | export* | restriction*) -guide -review',
    sort: "relevance_score",
    sector: "ai-policy",
    fallbackEventType: null,
    fallbackPolarity: "neutral/ambiguous",
    aiRelated: true,
  },
  {
    id: "ai-policy-governance",
    name: "AI policy, governance, competition, and export controls",
    search:
      'AI + (regulat* | legislation | enforcement | "export controls" | procurement | antitrust | competition | safety | governance | standard*) + (adopt* | enact* | propos* | investigat* | ban* | requir* | rule | strategy) -guide',
    sort: "relevance_score",
    sector: "ai-policy",
    fallbackEventType: null,
    fallbackPolarity: "neutral/ambiguous",
    aiRelated: true,
  },
  {
    id: "ai-labour-economics",
    name: "AI labour, automation, economics, and major capital",
    search:
      'AI + (((workforce | jobs | labour | labor | automation | productivity) + (replace* | layoff* | hiring | study | survey | union | agreement | strategy)) | ((investment | funding | valuation | capex | revenue | market) + (billion | trillion | major | record | forecast* | raises | invests))) -startup -seed -"Series A"',
    sort: "relevance_score",
    sector: "ai-policy",
    fallbackEventType: null,
    fallbackPolarity: "neutral/ambiguous",
    aiRelated: true,
  },
  {
    id: "ai-rights-creative",
    name: "AI rights, creative industries, and material adoption",
    search:
      'AI + (music | film | television | games | publishing | artist* | author* | actor* | musician* | "creative industries") + (copyright | licensing | "training data" | royalty | compensation | provenance | eligibility | funding | investment | adopt* | deploy* | ban* | agreement | lawsuit | uses) -review -trailer',
    sort: "relevance_score",
    sector: "ai-policy",
    fallbackEventType: null,
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
