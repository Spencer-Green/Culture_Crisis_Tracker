import {
  MEDIA_EVIDENCE_ROLES,
  MEDIA_SOURCE_PERSPECTIVES,
  MEDIA_SOURCE_SPECIALISMS,
  type MediaEvidenceRole,
  type MediaSourcePerspective,
  type MediaSourceSpecialism,
} from "@/data-sources/news/rss-registry";

export type MediaSourceEvidenceMetadata = {
  evidenceRole: MediaEvidenceRole;
  sourcePerspective: MediaSourcePerspective;
  jurisdiction: string | null;
  sourceSpecialisms: MediaSourceSpecialism[];
  institution: string | null;
};

function allowed<T extends string>(
  value: unknown,
  values: readonly T[],
): value is T {
  return typeof value === "string" && values.includes(value as T);
}

export function readMediaSourceEvidenceMetadata(
  value: unknown,
): MediaSourceEvidenceMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    !allowed(record.evidenceRole, MEDIA_EVIDENCE_ROLES) ||
    !allowed(record.sourcePerspective, MEDIA_SOURCE_PERSPECTIVES)
  )
    return null;
  const sourceSpecialisms = Array.isArray(record.sourceSpecialisms)
    ? record.sourceSpecialisms.filter((item): item is MediaSourceSpecialism =>
        allowed(item, MEDIA_SOURCE_SPECIALISMS),
      )
    : [];
  return {
    evidenceRole: record.evidenceRole,
    sourcePerspective: record.sourcePerspective,
    jurisdiction:
      typeof record.jurisdiction === "string" ? record.jurisdiction : null,
    sourceSpecialisms,
    institution:
      typeof record.institution === "string" ? record.institution : null,
  };
}
