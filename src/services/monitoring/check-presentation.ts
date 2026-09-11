import { z } from "zod";

const packetSchema = z.object({
  candidates: z.array(
    z.object({
      key: z.string(),
      sourceUrl: z.string(),
      claim: z.string(),
      publicationDate: z.string(),
      reportingPeriod: z.string(),
      evidence: z.object({
        origin: z.string(),
        mediation: z.string(),
        passage: z.string(),
      }),
    }),
  ),
});
const resultSchema = z.object({
  verificationScope: z.string().optional(),
  alignmentMethod: z.string().optional(),
  candidates: z.array(
    z.object({
      index: z.number().int(),
      verdict: z.string(),
      reason: z.string(),
      findings: z.array(
        z.object({
          field: z.string(),
          check: z.string().optional(),
          evidenceQuote: z.string(),
          explanation: z.string(),
        }),
      ),
    }),
  ),
});

/** Candidate ids in immutable input snapshots bind result indexes; current candidate order cannot. */
export function presentCheck(
  inputSnapshot: unknown,
  result: unknown,
  candidateId: string,
) {
  const packet = packetSchema.safeParse(inputSnapshot);
  if (!packet.success) return null;
  const index = packet.data.candidates.findIndex(
    (candidate) => candidate.key === candidateId,
  );
  if (
    index < 0 ||
    packet.data.candidates.filter((c) => c.key === candidateId).length !== 1
  )
    return null;
  const candidate = packet.data.candidates[index];
  if (candidate.evidence.origin !== "PROVIDER_EXTRACTED") return null;
  const parsed = resultSchema.safeParse(result);
  const matching = parsed.success
    ? parsed.data.candidates.filter((c) => c.index === index)
    : [];
  const checked = matching.length === 1 ? matching[0] : undefined;
  const literal =
    parsed.success &&
    parsed.data.verificationScope === "PROVIDED_TEXT_ONLY" &&
    ["GLM_PASSAGE_SELECTION", "LOCAL_LITERAL_SCAN"].includes(
      parsed.data.alignmentMethod ?? "",
    );
  return {
    candidate,
    method: literal ? parsed.data.alignmentMethod : null,
    label: !checked
      ? "Checks pending or unavailable"
      : !literal
        ? "Historical advisory result — not verification"
        : checked.verdict === "TEXT_MATCH_ONLY"
          ? "Supporting text matched — not independently verified"
          : "Evidence checks unresolved",
    reason: checked?.reason ?? null,
    findings: checked?.findings ?? [],
  };
}
