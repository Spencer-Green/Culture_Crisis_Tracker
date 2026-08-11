export const COUNTRIES = [
  { code: "AU", name: "Australia", region: "Oceania" },
  { code: "US", name: "United States", region: "North America" },
  { code: "GB", name: "United Kingdom", region: "Europe" },
  { code: "CA", name: "Canada", region: "North America" },
  { code: "NZ", name: "New Zealand", region: "Oceania" },
  { code: "EU", name: "European Union", region: "Europe" },
] as const;

export const SECTORS = [
  {
    slug: "consumer-spending",
    name: "Consumer Spending",
    description: "Household recreation, culture, and discretionary spending.",
  },
  {
    slug: "music",
    name: "Music",
    description:
      "Recorded music, personal consumption, festivals, and live music.",
  },
  {
    slug: "film",
    name: "Film",
    description: "Cinema attendance, box office, and film industry viability.",
  },
  {
    slug: "theatre",
    name: "Theatre",
    description: "Theatre and other live performance activity.",
  },
  {
    slug: "gaming",
    name: "Gaming",
    description:
      "Sales, employment, studios, and physical versus digital distribution.",
  },
  {
    slug: "ai-policy",
    name: "AI & Policy",
    description: "AI-generated content policy and impacts on creators.",
  },
  {
    slug: "industry-events",
    name: "Industry Events",
    description: "Closures, cancellations, bankruptcies, and consolidation.",
  },
] as const;

export type CountryCode = (typeof COUNTRIES)[number]["code"];
export type SectorSlug = (typeof SECTORS)[number]["slug"];
