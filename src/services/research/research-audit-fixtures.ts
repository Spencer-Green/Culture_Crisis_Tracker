import {
  AuditResultSchema,
  type AuditPacket,
} from "@/services/research/research-audit-core";

/** Synthetic acceptance cases. No source document or candidate is created by this fixture. */
export const AUDIT_ACCEPTANCE_PACKET: AuditPacket = {
  task: {
    id: "audit-acceptance",
    version: "v1",
    sector: "Music",
    geography: "Victoria",
  },
  candidates: [
    {
      key: "supported",
      sourceUrl: "https://example.test/audit",
      title: "Venue audit",
      geography: "Victoria",
      claim: "The 2025 audit counted 2,441 venues in Victoria.",
      observations: [
        { metric: "venues", value: "2,441", unit: "venues", qualifier: "NONE" },
      ],
      reportingPeriod: "2025",
      publicationDate: "UNKNOWN",
      limitations: [],
      evidence: {
        origin: "SYNTHETIC_TEST_TEXT",
        mediation: "TEST_FIXTURE",
        passage: "The 2025 audit counted 2,441 venues in Victoria.",
        observationQuotes: ["2,441 venues in Victoria"],
      },
    },
    {
      key: "truncated-and-wrong-geography",
      sourceUrl: "https://example.test/audit",
      title: "Venue audit",
      geography: "Australia",
      claim: "The 2025 audit counted 441 venues across Australia.",
      observations: [
        { metric: "venues", value: "441", unit: "venues", qualifier: "NONE" },
      ],
      reportingPeriod: "2025",
      publicationDate: "UNKNOWN",
      limitations: [],
      evidence: {
        origin: "SYNTHETIC_TEST_TEXT",
        mediation: "TEST_FIXTURE",
        passage: "The 2025 audit counted 2,441 venues in Victoria.",
        observationQuotes: ["2,441 venues in Victoria"],
      },
    },
    {
      key: "missing-source",
      sourceUrl: "https://example.test/unavailable",
      title: "Employment release",
      geography: "Australia",
      claim: "100 jobs were lost in 2025.",
      observations: [{ metric: "jobs lost", value: "100", unit: "jobs" }],
      reportingPeriod: "2025",
      publicationDate: "2025-01-01",
      limitations: [
        "The original document could not be retrieved. Publication date was inferred from a title.",
      ],
      evidence: {
        origin: "PROVIDER_EXTRACTED",
        mediation: "MODEL_REPORTED",
        passage: "",
        observationQuotes: [],
      },
    },
  ],
};
export const AUDIT_ACCEPTANCE_VERDICTS = [
  "TEXT_MATCH_ONLY",
  "INSUFFICIENT_EVIDENCE",
  "INSUFFICIENT_EVIDENCE",
] as const;

/** Fixed short protocol acceptance, distinct from the frozen historical batch. */
export const AUDIT_PROTOCOL_ACCEPTANCE_PACKET: AuditPacket = {
  task: {
    id: "protocol-acceptance",
    version: "v2",
    sector: "Music",
    geography: "UNKNOWN",
  },
  candidates: [
    AUDIT_ACCEPTANCE_PACKET.candidates[0]!,
    {
      key: "annual-regression",
      sourceUrl: "https://example.test/industry",
      title: "Industry evidence",
      geography: "UNKNOWN",
      claim: "Live music is a $16 billion industry supporting 41,000 jobs.",
      observations: [
        {
          metric: "Live music industry annual economic contribution",
          value: "$16 billion",
          unit: "billion",
          qualifier: "NONE",
        },
      ],
      publicationDate: "UNKNOWN",
      reportingPeriod: "UNKNOWN",
      limitations: [],
      evidence: {
        origin: "SYNTHETIC_TEST_TEXT",
        mediation: "TEST_FIXTURE",
        passage: "Live music is a $16 billion industry supporting 41,000 jobs.",
        observationQuotes: [],
      },
    },
    {
      key: "decline-regression",
      sourceUrl: "https://example.test/decline",
      title: "Venue change",
      geography: "UNKNOWN",
      claim: "The number of venues has fallen 19.4% since 2019.",
      observations: [
        {
          metric: "number of venues",
          value: "19.4%",
          unit: "percent",
          qualifier: "DECLINE",
        },
      ],
      publicationDate: "UNKNOWN",
      reportingPeriod: "UNKNOWN",
      limitations: [],
      evidence: {
        origin: "SYNTHETIC_TEST_TEXT",
        mediation: "TEST_FIXTURE",
        passage: "The number of venues has fallen 19.4% since 2019.",
        observationQuotes: [],
      },
    },
  ],
};

export function passesProtocolQualification(result: unknown): boolean {
  const parsed = AuditResultSchema.safeParse(result);
  if (!parsed.success) return false;
  const audited = parsed.data;
  const field = (index: number, name: string) =>
    audited.candidates
      .find((c) => c.index === index)
      ?.findings.find((f) => f.field === name)?.check;
  return (
    audited.alignmentMethod === "GLM_PASSAGE_SELECTION" &&
    audited.verificationScope === "PROVIDED_TEXT_ONLY" &&
    audited.candidates.find((c) => c.index === 0)?.verdict ===
      "TEXT_MATCH_ONLY" &&
    field(1, "observations.0.metric") === "NOT_ESTABLISHED" &&
    field(1, "observations.0.value") === "MATCHED" &&
    field(2, "observations.0.qualifier") === "MATCHED" &&
    field(2, "observations.0.value") === "MATCHED"
  );
}
