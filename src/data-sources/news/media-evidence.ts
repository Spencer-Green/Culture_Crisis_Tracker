import type { MediaSectorSlug } from "@/data-sources/news/media-types";

export const CULTURAL_MEDIA_SECTORS = [
  "music",
  "film",
  "theatre",
  "gaming",
] as const;

export type CulturalMediaSector = (typeof CULTURAL_MEDIA_SECTORS)[number];

const SECTOR_PATTERNS: Record<CulturalMediaSector, readonly RegExp[]> = {
  music: [
    /\b(music|musicians?|songwriters?|singers?|record labels?|recording artists?|albums?|concerts?|music festivals?|music publishing)\b/i,
    /\b(spotify|warner music|universal music|sony music|live nation)\b/i,
  ],
  film: [
    /\b(films?|filmmakers?|movies?|cinema|box office|theatrical release|screenwriters?|film directors?|vfx|motion picture)\b/i,
    /\b(directors guild|actors guild|screen actors guild|dga|sag-aftra|paramount|warner bros|universal pictures|sony pictures|lionsgate|a24|mgm|hollywood)\b/i,
    /\b(actors?|actresses?)\b.{0,40}\b(film|movie|cinema|studio|production|role)\b/i,
    /\b(television|tv)\s+(series|production|studio|industry|show|network)\b/i,
  ],
  theatre: [
    /\b(theatre|theater|broadway|west end|playwrights?|stage productions?|musical theatre|performing arts)\b/i,
  ],
  gaming: [
    /\b(video games?|gaming|games industry|game studios?|game developers?|game publishers?)\b/i,
    /\b(steam|xbox|playstation|nintendo|ubisoft|electronic arts|activision blizzard|epic games|take-two)\b/i,
  ],
};

const BROAD_CREATIVE_INDUSTRY_PATTERNS = [
  /\b(cultural|creative)\s+(economy|industr(?:y|ies)|sector|work|workers?|production)\b/i,
  /\b(arts funding|arts council|cultural organisations?|entertainment industry)\b/i,
  /\b(creators?|performers?|authors?)\s+(compensation|copyright|licensing|likeness|rights?|royalt(?:y|ies))\b/i,
  /\b(creative works?|training data)\s+(copyright|licensing|rights?|consent)\b/i,
] as const;

export function culturalSectorEvidence(text: string): CulturalMediaSector[] {
  return CULTURAL_MEDIA_SECTORS.filter((sector) =>
    SECTOR_PATTERNS[sector].some((pattern) => pattern.test(text)),
  );
}

export function hasSectorEvidence(
  text: string,
  sector: MediaSectorSlug,
): boolean {
  return (
    CULTURAL_MEDIA_SECTORS.includes(sector as CulturalMediaSector) &&
    SECTOR_PATTERNS[sector as CulturalMediaSector].some((pattern) =>
      pattern.test(text),
    )
  );
}

export function hasCreativeIndustryEvidence(text: string): boolean {
  return (
    culturalSectorEvidence(text).length > 0 ||
    BROAD_CREATIVE_INDUSTRY_PATTERNS.some((pattern) => pattern.test(text))
  );
}

export function hasAiRelevance(text: string): boolean {
  return /\b(ai|artificial intelligence|generative ai|machine learning)\b/i.test(
    text,
  );
}

export function hasCreativeAiConnection(text: string): boolean {
  if (!hasAiRelevance(text) || !hasCreativeIndustryEvidence(text)) return false;

  return /\b(copyright|licens\w*|royalt\w*|training data|fair use|consent|compensation|likeness|voice rights?|union|guild|collective bargaining|creative workers?|job loss|displac\w*|layoffs?|automation|ai-generated|synthetic content|production tools?|creative tools?|production workflow|creative workflow|regulat\w*|legislation|policy|contract)\b/i.test(
    text,
  );
}
