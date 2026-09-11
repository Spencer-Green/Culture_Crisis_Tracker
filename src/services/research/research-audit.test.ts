import { evidenceSelectionInput } from "./research-evidence-checks";
import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AUDIT_ACCEPTANCE_PACKET } from "@/services/research/research-audit-fixtures";
import {
  auditBudgetDecision,
  auditInputHash,
  parseAuditResult,
  validateAuditPacket,
  RESEARCH_AUDIT_MODEL,
  RESEARCH_AUDIT_MAX_OUTPUT_TOKENS,
} from "@/services/research/research-audit-core";
import {
  auditRequest,
  executeGlmAudit,
  type AuditProviderResponse,
} from "@/services/research/glm-research-auditor";
import {
  runEvidenceAudit,
  auditResearchRunSafely,
  type AuditStore,
} from "@/services/research/research-audit-service";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  buildResearchTaskInput,
  RESEARCH_STAGE1_INSTRUCTIONS,
} from "@/services/research/research-runner";
import { RESEARCH_EXTRACTION_INSTRUCTIONS } from "@/services/research/research-extraction";
import {
  AU_LIVE_MUSIC_VENUE_VIABILITY_TASK,
  SCHEDULED_RESEARCH_TASKS,
} from "@/services/research/research-tasks";

const packet = {
  ...AUDIT_ACCEPTANCE_PACKET,
  candidates: [AUDIT_ACCEPTANCE_PACKET.candidates[0]!],
};
const valid = () => ({
  selections: evidenceSelectionInput(packet).candidates.flatMap((c) =>
    c.requirements.map((r) => ({
      id: r.id,
      passageId: "0:p0" as string | null,
    })),
  ),
});
const response = () => ({
  id: "provider-id",
  model: RESEARCH_AUDIT_MODEL,
  choices: [
    { finish_reason: "stop", message: { content: JSON.stringify(valid()) } },
  ],
  usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
});
function store(): AuditStore {
  return {
    reserve: vi.fn(async () => ({
      status: "RESERVED" as const,
      id: "audit-id",
    })),
    complete: vi.fn(async () => {}),
    fail: vi.fn(async () => {}),
  };
}
const providerResponse: AuditProviderResponse = {
  result: parseAuditResult(JSON.stringify(valid()), packet),
  model: RESEARCH_AUDIT_MODEL,
  responseId: "provider-id",
  usage: {
    inputTokens: 100,
    outputTokens: 50,
    totalTokens: 150,
    reasoningTokens: null,
  },
  latencyMs: 20,
};

describe("bounded GLM auditing", () => {
  it("pins one model and disables reasoning without supplying search tools", () => {
    const request = auditRequest(packet, "audit-id");
    expect(request).toMatchObject({
      model: "glm-4.7",
      thinking: { type: "disabled" },
      max_tokens: RESEARCH_AUDIT_MAX_OUTPUT_TOKENS,
      response_format: { type: "json_object" },
      request_id: "audit-id",
    });
    expect(request.tools).toBeUndefined();
    expect(request.tool_choice).toBeUndefined();
  });
  it("accepts an advisory result without inventing absent reasoning telemetry", async () => {
    const send = vi.fn().mockResolvedValue(response());
    const result = await executeGlmAudit(packet, "audit-id", send);
    expect(result.usage.reasoningTokens).toBeNull();
    expect(result.result.candidates[0]?.verdict).toBe("TEXT_MATCH_ONLY");
    expect(send).toHaveBeenCalledTimes(1);
  });
  it.each(["length", "tool_calls"])(
    "rejects unfinished or tool completion %s",
    async (finish) => {
      const raw = response();
      raw.choices[0]!.finish_reason = finish;
      const send = vi.fn().mockResolvedValue(raw);
      await expect(executeGlmAudit(packet, "audit-id", send)).rejects.toThrow();
      expect(send).toHaveBeenCalledTimes(1);
    },
  );
  it("rejects unexpected reasoning, tool calls and model fallback", async () => {
    for (const raw of [
      { ...response(), model: "glm-5" },
      {
        ...response(),
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify(valid()),
              reasoning_content: "thinking",
            },
          },
        ],
      },
      {
        ...response(),
        choices: [
          {
            finish_reason: "stop",
            message: { content: JSON.stringify(valid()), tool_calls: [{}] },
          },
        ],
      },
    ])
      await expect(
        executeGlmAudit(packet, "audit-id", async () => raw),
      ).rejects.toThrow();
  });
  it("rejects invented ids, missing fields and invented passage indexes", () => {
    const fabricated = valid();
    fabricated.selections[0]!.id = "invented";
    expect(() => parseAuditResult(JSON.stringify(fabricated), packet)).toThrow(
      "every requirement",
    );
    expect(() =>
      parseAuditResult(JSON.stringify(valid()), AUDIT_ACCEPTANCE_PACKET),
    ).toThrow("every requirement");
    const wrong = valid();
    wrong.selections[0]!.passageId = "0:p100";
    expect(() => parseAuditResult(JSON.stringify(wrong), packet)).toThrow(
      "unknown passage",
    );
  });
  it("does not use limitations as source support when the passage is missing", () => {
    const missing = structuredClone(packet);
    missing.candidates[0]!.evidence.passage = "";
    missing.candidates[0]!.limitations = [
      packet.candidates[0]!.evidence.passage,
    ];
    const selections = valid();
    selections.selections.forEach((s) => {
      s.passageId = null;
    });
    expect(
      parseAuditResult(JSON.stringify(selections), missing).candidates[0]
        ?.verdict,
    ).toBe("INSUFFICIENT_EVIDENCE");
  });
  it("bounds input and caches by complete evidence and model contract", () => {
    expect(auditInputHash(packet)).toBe(
      auditInputHash(structuredClone(packet)),
    );
    const changed = structuredClone(packet);
    changed.candidates[0]!.evidence.passage += " revised";
    expect(auditInputHash(changed)).not.toBe(auditInputHash(packet));
    changed.candidates[0]!.claim = "x".repeat(21_000);
    expect(() => validateAuditPacket(changed)).toThrow("input size");
  });
  it("enforces active, daily and lifetime limits independently", () => {
    expect(auditBudgetDecision({ active: true, daily: 0, lifetime: 0 })).toBe(
      "AUDIT_IN_PROGRESS",
    );
    expect(auditBudgetDecision({ active: false, daily: 4, lifetime: 4 })).toBe(
      "AUDIT_DAILY_LIMIT",
    );
    expect(
      auditBudgetDecision({ active: false, daily: 0, lifetime: 100 }),
    ).toBe("AUDIT_EXPERIMENT_LIMIT");
    expect(
      auditBudgetDecision({ active: false, daily: 3, lifetime: 99 }),
    ).toBeNull();
  });
});

describe("audit persistence and isolation", () => {
  it("reserves before dispatch and persists separately without candidate/review writes", async () => {
    const auditStore = store();
    const provider = vi.fn(async () => {
      expect(auditStore.reserve).toHaveBeenCalledTimes(1);
      return providerResponse;
    });
    const result = await runEvidenceAudit({
      packet,
      store: auditStore,
      provider,
      enabled: true,
      apiKeyConfigured: true,
    });
    expect(result.status).toBe("SUCCEEDED");
    expect(auditStore.complete).toHaveBeenCalledWith(
      "audit-id",
      providerResponse,
    );
    expect(auditStore.fail).not.toHaveBeenCalled();
  });
  it("makes no call when disabled, unconfigured, cached or budget-blocked", async () => {
    const provider = vi.fn();
    for (const flags of [
      { enabled: false, apiKeyConfigured: true },
      { enabled: true, apiKeyConfigured: false },
    ]) {
      const auditStore = store();
      await runEvidenceAudit({ packet, store: auditStore, provider, ...flags });
      expect(auditStore.reserve).not.toHaveBeenCalled();
    }
    for (const reservation of [
      { status: "CACHED" as const, id: "cached" },
      { status: "EXISTING" as const, id: "old" },
      { status: "SKIPPED" as const, reason: "AUDIT_DAILY_LIMIT" },
    ]) {
      const auditStore = store();
      auditStore.reserve = vi.fn(async () => reservation);
      await runEvidenceAudit({
        packet,
        store: auditStore,
        provider,
        enabled: true,
        apiKeyConfigured: true,
      });
    }
    expect(provider).not.toHaveBeenCalled();
  });
  it("does not dispatch after a failed reservation", async () => {
    const auditStore = store();
    auditStore.reserve = vi.fn().mockRejectedValue(new Error("DB unavailable"));
    const provider = vi.fn();
    await expect(
      runEvidenceAudit({
        packet,
        store: auditStore,
        provider,
        enabled: true,
        apiKeyConfigured: true,
      }),
    ).rejects.toThrow();
    expect(provider).not.toHaveBeenCalled();
  });
  it("records a sanitized failure once without retrying", async () => {
    const auditStore = store();
    const provider = vi
      .fn()
      .mockRejectedValue(new Error("failed sensitive-key"));
    const result = await runEvidenceAudit({
      packet,
      store: auditStore,
      provider,
      enabled: true,
      apiKeyConfigured: true,
      secrets: ["sensitive-key"],
    });
    expect(result.status).toBe("FAILED");
    expect(result.reason).not.toContain("sensitive-key");
    expect(provider).toHaveBeenCalledTimes(1);
    expect(auditStore.fail).toHaveBeenCalledTimes(1);
  });
  it("never overwrites an uncertain completed audit or repeats its provider call", async () => {
    const auditStore = store();
    auditStore.complete = vi
      .fn()
      .mockRejectedValue(new Error("ambiguous commit"));
    const provider = vi.fn(async () => providerResponse);
    await expect(
      runEvidenceAudit({
        packet,
        store: auditStore,
        provider,
        enabled: true,
        apiKeyConfigured: true,
      }),
    ).rejects.toThrow("ambiguous commit");
    expect(provider).toHaveBeenCalledTimes(1);
    expect(auditStore.fail).not.toHaveBeenCalled();
  });
  it("isolates audit failures from the completed research run", async () => {
    const result = await auditResearchRunSafely(
      "research-id",
      {} as PrismaClient,
      vi.fn().mockRejectedValue(new Error("failure")),
    );
    expect(result).toEqual({
      status: "FAILED",
      reason: "AUDIT_PERSISTENCE_OR_INPUT_FAILURE",
    });
  });
});

describe("task-driven research instructions", () => {
  it("uses task focus and sources without Australian music leakage", () => {
    const task = {
      ...AU_LIVE_MUSIC_VENUE_VIABILITY_TASK,
      id: "test-games",
      sector: "Gaming",
      geography: "US",
      objective: "Discover studio employment evidence",
      preferredSources: ["Studio statements"],
      researchFocus: ["Employment announcements"],
      existingEvidenceContext: ["Test baseline"],
    };
    const input = buildResearchTaskInput(
      task,
      new Date("2026-09-10T00:00:00Z"),
    );
    expect(input).toContain("Studio statements");
    expect(input).toContain("Employment announcements");
    for (const text of [
      input,
      RESEARCH_STAGE1_INSTRUCTIONS,
      RESEARCH_EXTRACTION_INSTRUCTIONS,
    ])
      expect(text).not.toMatch(
        /Australian|APRA|Music Victoria|live-music venue viability/,
      );
    expect(SCHEDULED_RESEARCH_TASKS).toHaveLength(1);
    expect(SCHEDULED_RESEARCH_TASKS[0]?.task.id).toBe(
      "au-live-music-venue-viability",
    );
  });
});

describe("latest-run audit catch-up", () => {
  it("does not scan historical backlog or dispatch research", async () => {
    const { auditLatestResearchRunSafely } =
      await import("./research-audit-service");
    const findFirst = vi
      .fn()
      .mockResolvedValue({ id: "latest", audits: [], evidenceChecks: [] });
    const audit = vi
      .fn()
      .mockResolvedValue({ status: "SKIPPED", reason: "AUDIT_DAILY_LIMIT" });
    const prisma = { researchRun: { findFirst } } as unknown as PrismaClient;
    await auditLatestResearchRunSafely(prisma, {
      enabled: true,
      now: new Date("2026-09-11"),
      audit,
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ completedAt: "desc" }, { id: "desc" }],
        where: {
          status: "SUCCEEDED",
          completedAt: { gte: new Date("2026-09-09") },
        },
      }),
    );
    expect(audit).toHaveBeenCalledExactlyOnceWith("latest", prisma);
  });
  it("leaves attempted audits alone and isolates database failures", async () => {
    const { auditLatestResearchRunSafely } =
      await import("./research-audit-service");
    const findFirst = vi.fn().mockResolvedValue({
      id: "latest",
      audits: [{ id: "existing" }],
      evidenceChecks: [{ id: "check" }],
    });
    const audit = vi.fn();
    const prisma = { researchRun: { findFirst } } as unknown as PrismaClient;
    expect(
      (await auditLatestResearchRunSafely(prisma, { enabled: true, audit }))
        .status,
    ).toBe("SKIPPED");
    expect(audit).not.toHaveBeenCalled();
    findFirst.mockRejectedValue(new Error("database offline"));
    expect(
      (await auditLatestResearchRunSafely(prisma, { enabled: true, audit }))
        .status,
    ).toBe("FAILED");
    findFirst.mockClear();
    await auditLatestResearchRunSafely(prisma, { enabled: false, audit });
    expect(findFirst).not.toHaveBeenCalled();
  });
});

describe("failed response diagnostics", () => {
  it("retains bounded final content and usage after bad passage references, without reasoning", async () => {
    const { AuditResponseValidationError } =
      await import("./glm-research-auditor");
    const raw = response();
    const wire = valid();
    wire.selections[0]!.passageId = "0:p99";
    raw.choices[0]!.message.content = JSON.stringify(wire);
    try {
      await executeGlmAudit(packet, "audit-id", async () => raw);
      throw new Error("Expected validation failure");
    } catch (error) {
      expect(error).toBeInstanceOf(AuditResponseValidationError);
      const failure = error as InstanceType<
        typeof AuditResponseValidationError
      >;
      expect(failure.diagnostic.usage.totalTokens).toBe(150);
      expect(failure.diagnostic.finalContent).toBe(
        raw.choices[0]!.message.content,
      );
      expect(failure.diagnostic).not.toHaveProperty("reasoning_content");
    }
  });
});
