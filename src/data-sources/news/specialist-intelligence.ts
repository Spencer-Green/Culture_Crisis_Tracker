import type { MediaSourceArticle } from "@/data-sources/news/media-types";

const SPECIALIST_INTELLIGENCE_PATTERN =
  /\b(ai|artificial intelligence|generative|machine learning|frontier model|foundation model|large language model|copyright|creator rights?|authors? rights?|fair use|training data|text and data mining|licens\w*|royalt\w*|digital replica|likeness|automation|workplace|labour|labor|productivity|compute|semiconductor|chips?|accelerator|data cent(?:er|re)|export controls?|industrial policy|ai act|digital markets?|platform power|market power|competition|antitrust|technical standards?|ai governance|ai safety|surveillance)\b/i;

const GENERIC_IP_ONLY_PATTERN = /\b(trademark|patent)\b/i;

export function isSpecialistIntelligenceRelevant(
  article: MediaSourceArticle,
): boolean {
  const text = `${article.title}. ${article.description ?? ""}`
    .replace(/\s+/g, " ")
    .trim();
  if (
    /^protected:/i.test(article.title) ||
    /\bno excerpt because this is a protected post\b/i.test(text)
  )
    return false;
  if (!SPECIALIST_INTELLIGENCE_PATTERN.test(text)) return false;
  if (
    GENERIC_IP_ONLY_PATTERN.test(text) &&
    !/\b(ai|artificial intelligence|copyright|creator|training data|digital|competition|antitrust)\b/i.test(
      text,
    )
  )
    return false;
  return true;
}
