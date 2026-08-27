"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  MEDIA_CORRECTABLE_EVENT_TYPES,
  MEDIA_CORRECTABLE_IMPORTANCE_VALUES,
  MEDIA_CORRECTABLE_SIGNAL_DIRECTIONS,
  MEDIA_CORRECTABLE_SECTORS,
  MEDIA_CORRECTABLE_SECTOR_LABELS,
  MEDIA_CLASSIFICATION_FEEDBACK_LABELS,
  MEDIA_CLASSIFICATION_FEEDBACK_REASONS,
  MEDIA_CLASSIFICATION_FEEDBACK_UI_REASONS,
  type MediaClassificationCorrections,
  type MediaClassificationFeedbackReason,
  type MediaClassificationFeedbackState,
  type MediaClassificationReviewState,
} from "@/services/media/media-feedback-types";

const NOT_RELEVANT = "NOT_RELEVANT_TO_CULTURAL_INTELLIGENCE";
const FEEDBACK_EVENT = "media-classification-feedback-updated";

type FeedbackResponse = {
  data: ({ articleId: string } & MediaClassificationFeedbackState) | null;
  error?: string;
};

const EMPTY_CORRECTIONS: MediaClassificationCorrections = {
  correctedSector: null,
  correctedEventType: null,
  correctedAiTag: null,
  correctedSignalDirection: null,
  correctedImportance: null,
};

const CORRECTION_KEY_BY_REASON: Partial<
  Record<
    MediaClassificationFeedbackReason,
    keyof MediaClassificationCorrections
  >
> = {
  WRONG_SECTOR: "correctedSector",
  WRONG_EVENT_TYPE: "correctedEventType",
  WRONG_AI_TAG: "correctedAiTag",
  WRONG_SIGNAL_DIRECTION: "correctedSignalDirection",
  WRONG_IMPORTANCE: "correctedImportance",
};

function feedbackCorrections(
  feedback: MediaClassificationFeedbackState | null,
): MediaClassificationCorrections {
  if (!feedback) return { ...EMPTY_CORRECTIONS };
  return {
    correctedSector: feedback.correctedSector,
    correctedEventType: feedback.correctedEventType,
    correctedAiTag: feedback.correctedAiTag,
    correctedSignalDirection: feedback.correctedSignalDirection,
    correctedImportance: feedback.correctedImportance,
  };
}

function taxonomyLabel(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/(^|\s)\S/g, (character) => character.toUpperCase());
}

export function MediaClassificationFeedback({
  articleId,
  initialFeedback,
}: {
  articleId: string;
  initialFeedback: MediaClassificationFeedbackState | null;
}) {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const [feedback, setFeedback] = useState(initialFeedback);
  const [selected, setSelected] = useState<MediaClassificationFeedbackReason[]>(
    initialFeedback?.reasons ?? [],
  );
  const [corrections, setCorrections] =
    useState<MediaClassificationCorrections>(
      feedbackCorrections(initialFeedback),
    );
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          articleId: string;
          feedback: MediaClassificationFeedbackState | null;
        }>
      ).detail;
      if (detail.articleId !== articleId) return;
      setFeedback(detail.feedback);
      setSelected(detail.feedback?.reasons ?? []);
      setCorrections(feedbackCorrections(detail.feedback));
    };
    window.addEventListener(FEEDBACK_EVENT, listener);
    return () => window.removeEventListener(FEEDBACK_EVENT, listener);
  }, [articleId]);

  const toggle = (reason: MediaClassificationFeedbackReason) => {
    setSelected((current) => {
      if (current.includes(reason)) {
        const correctionKey = CORRECTION_KEY_BY_REASON[reason];
        if (correctionKey) {
          setCorrections((values) => ({
            ...values,
            [correctionKey]: null,
          }));
        }
        return current.filter((value) => value !== reason);
      }
      return MEDIA_CLASSIFICATION_FEEDBACK_REASONS.filter(
        (value) => value === reason || current.includes(value),
      );
    });
  };

  const persist = async (
    reviewState: MediaClassificationReviewState,
    reasons: MediaClassificationFeedbackReason[],
  ) => {
    setSaving(true);
    setError(null);
    const wasNotRelevant = feedback?.reasons.includes(NOT_RELEVANT) === true;
    try {
      const response = await fetch(
        `/api/media/articles/${encodeURIComponent(articleId)}/classification-feedback`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reviewState, reasons, ...corrections }),
        },
      );
      const payload = (await response.json()) as FeedbackResponse;
      if (!response.ok) throw new Error(payload.error ?? "Feedback failed.");

      const next = payload.data
        ? {
            reviewState: payload.data.reviewState,
            reasons: payload.data.reasons,
            correctedSector: payload.data.correctedSector,
            correctedEventType: payload.data.correctedEventType,
            correctedAiTag: payload.data.correctedAiTag,
            correctedSignalDirection: payload.data.correctedSignalDirection,
            correctedImportance: payload.data.correctedImportance,
            approvedMachineClassification:
              payload.data.approvedMachineClassification,
            evaluationState: payload.data.evaluationState,
            reviewedAt: payload.data.reviewedAt,
          }
        : null;
      setFeedback(next);
      setSelected(next?.reasons ?? []);
      setCorrections(feedbackCorrections(next));
      setExpanded(false);
      window.dispatchEvent(
        new CustomEvent(FEEDBACK_EVENT, {
          detail: { articleId, feedback: next },
        }),
      );

      const isNotRelevant = next?.reasons.includes(NOT_RELEVANT) === true;
      if (wasNotRelevant !== isNotRelevant) {
        startRefresh(() => router.refresh());
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save feedback.",
      );
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || isRefreshing;

  if (!expanded) {
    if (feedback?.reviewState === "CORRECT") {
      return (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] tracking-wide uppercase">
          <span
            className={
              feedback.evaluationState === "REVIEW_OUTDATED"
                ? "text-amber-500"
                : "text-emerald-500"
            }
          >
            {feedback.evaluationState === "REVIEW_OUTDATED"
              ? "Review outdated"
              : "✓ Classification verified"}
          </span>
          {feedback.evaluationState === "REVIEW_OUTDATED" ? (
            <button
              type="button"
              onClick={() => void persist("CORRECT", [])}
              disabled={busy}
              className="text-zinc-600 transition-colors hover:text-emerald-500 disabled:opacity-40"
            >
              ✓ Verify current
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-zinc-600 transition-colors hover:text-zinc-400"
          >
            Change review
          </button>
          <button
            type="button"
            onClick={() => void persist("UNREVIEWED", [])}
            disabled={busy}
            className="text-zinc-700 transition-colors hover:text-zinc-400 disabled:opacity-40"
          >
            Clear
          </button>
          {error ? <span className="text-red-400">{error}</span> : null}
        </div>
      );
    }

    if (feedback?.reviewState === "WRONG_CLASSIFICATION") {
      return (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] tracking-wide uppercase">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-amber-500 transition-colors hover:text-amber-300"
            aria-expanded="false"
          >
            ⚑ Classification flagged
          </button>
          <button
            type="button"
            onClick={() => void persist("CORRECT", [])}
            disabled={busy}
            className="text-zinc-700 transition-colors hover:text-emerald-500 disabled:opacity-40"
          >
            ✓ Mark correct
          </button>
          <button
            type="button"
            onClick={() => void persist("UNREVIEWED", [])}
            disabled={busy}
            className="text-zinc-700 transition-colors hover:text-zinc-400 disabled:opacity-40"
          >
            Clear
          </button>
          {error ? <span className="text-red-400">{error}</span> : null}
        </div>
      );
    }

    return (
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] tracking-wide uppercase">
        <button
          type="button"
          onClick={() => void persist("CORRECT", [])}
          disabled={busy}
          className="text-zinc-700 transition-colors hover:text-emerald-500 disabled:opacity-40"
        >
          ✓ Correct
        </button>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-zinc-700 transition-colors hover:text-amber-500"
          aria-expanded="false"
        >
          Wrong classification
        </button>
        {error ? <span className="text-red-400">{error}</span> : null}
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/80 p-3">
      <p className="text-[10px] tracking-wide text-zinc-500 uppercase">
        Wrong classification
      </p>
      <div className="mt-2 space-y-1.5">
        {MEDIA_CLASSIFICATION_FEEDBACK_UI_REASONS.map((reason) => {
          const isSelected = selected.includes(reason);
          return (
            <div key={reason}>
              <label className="flex cursor-pointer items-start gap-2 text-xs leading-4 text-zinc-400">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggle(reason)}
                  disabled={busy}
                  className="mt-0.5 accent-amber-500"
                />
                {MEDIA_CLASSIFICATION_FEEDBACK_LABELS[reason]}
              </label>
              {isSelected && reason === "WRONG_SECTOR" ? (
                <CorrectionSelect
                  label="Correct sector (optional)"
                  value={corrections.correctedSector}
                  disabled={busy}
                  options={MEDIA_CORRECTABLE_SECTORS.map((value) => ({
                    value,
                    label: MEDIA_CORRECTABLE_SECTOR_LABELS[value],
                  }))}
                  onChange={(value) =>
                    setCorrections((current) => ({
                      ...current,
                      correctedSector:
                        value as MediaClassificationCorrections["correctedSector"],
                    }))
                  }
                />
              ) : null}
              {isSelected && reason === "WRONG_EVENT_TYPE" ? (
                <CorrectionSelect
                  label="Correct event type (optional)"
                  value={corrections.correctedEventType}
                  disabled={busy}
                  options={MEDIA_CORRECTABLE_EVENT_TYPES.map((value) => ({
                    value,
                    label: taxonomyLabel(value),
                  }))}
                  onChange={(value) =>
                    setCorrections((current) => ({
                      ...current,
                      correctedEventType:
                        value as MediaClassificationCorrections["correctedEventType"],
                    }))
                  }
                />
              ) : null}
              {isSelected && reason === "WRONG_SIGNAL_DIRECTION" ? (
                <CorrectionSelect
                  label="Correct signal direction (optional)"
                  value={corrections.correctedSignalDirection}
                  disabled={busy}
                  options={MEDIA_CORRECTABLE_SIGNAL_DIRECTIONS.map((value) => ({
                    value,
                    label: taxonomyLabel(value),
                  }))}
                  onChange={(value) =>
                    setCorrections((current) => ({
                      ...current,
                      correctedSignalDirection:
                        value as MediaClassificationCorrections["correctedSignalDirection"],
                    }))
                  }
                />
              ) : null}
              {isSelected && reason === "WRONG_IMPORTANCE" ? (
                <CorrectionSelect
                  label="Correct importance (optional)"
                  value={
                    corrections.correctedImportance === null
                      ? null
                      : String(corrections.correctedImportance)
                  }
                  disabled={busy}
                  options={MEDIA_CORRECTABLE_IMPORTANCE_VALUES.map((value) => ({
                    value: String(value),
                    label: String(value),
                  }))}
                  onChange={(value) =>
                    setCorrections((current) => ({
                      ...current,
                      correctedImportance: value
                        ? (Number(
                            value,
                          ) as MediaClassificationCorrections["correctedImportance"])
                        : null,
                    }))
                  }
                />
              ) : null}
            </div>
          );
        })}
      </div>
      {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void persist("WRONG_CLASSIFICATION", selected)}
          disabled={busy || selected.length === 0}
          className="rounded-md border border-amber-900/70 px-2 py-1 text-[10px] text-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save feedback"}
        </button>
        {feedback ? (
          <button
            type="button"
            onClick={() => void persist("UNREVIEWED", [])}
            disabled={busy}
            className="rounded-md border border-zinc-800 px-2 py-1 text-[10px] text-zinc-500 disabled:opacity-40"
          >
            Clear
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            setSelected(feedback?.reasons ?? []);
            setCorrections(feedbackCorrections(feedback));
            setExpanded(false);
            setError(null);
          }}
          disabled={busy}
          className="px-2 py-1 text-[10px] text-zinc-600 disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function CorrectionSelect({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string | null;
  options: { value: string; label: string }[];
  disabled: boolean;
  onChange(value: string | null): void;
}) {
  return (
    <label className="mt-1.5 ml-6 block text-[11px] text-zinc-600">
      {label}
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
        disabled={disabled}
        className="mt-1 block w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 disabled:opacity-40"
      >
        <option value="">No correction selected</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
