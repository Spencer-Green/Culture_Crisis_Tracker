"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  MEDIA_CORRECTABLE_AI_TAGS,
  MEDIA_CORRECTABLE_EVENT_TYPES,
  MEDIA_CORRECTABLE_IMPORTANCE_VALUES,
  MEDIA_CORRECTABLE_SECTORS,
  MEDIA_CORRECTABLE_SECTOR_LABELS,
  MEDIA_CLASSIFICATION_FEEDBACK_LABELS,
  MEDIA_CLASSIFICATION_FEEDBACK_REASONS,
  type MediaClassificationCorrections,
  type MediaClassificationFeedbackReason,
  type MediaClassificationFeedbackState,
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

  const persist = async (reasons: MediaClassificationFeedbackReason[]) => {
    setSaving(true);
    setError(null);
    const wasNotRelevant = feedback?.reasons.includes(NOT_RELEVANT) === true;
    try {
      const response = await fetch(
        `/api/media/articles/${encodeURIComponent(articleId)}/classification-feedback`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reasons, ...corrections }),
        },
      );
      const payload = (await response.json()) as FeedbackResponse;
      if (!response.ok) throw new Error(payload.error ?? "Feedback failed.");

      const next = payload.data
        ? {
            reasons: payload.data.reasons,
            correctedSector: payload.data.correctedSector,
            correctedEventType: payload.data.correctedEventType,
            correctedAiTag: payload.data.correctedAiTag,
            correctedImportance: payload.data.correctedImportance,
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
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className={`mt-3 text-[10px] tracking-wide uppercase transition-colors ${
          feedback
            ? "text-amber-500 hover:text-amber-300"
            : "text-zinc-700 hover:text-zinc-400"
        }`}
        aria-expanded="false"
      >
        {feedback ? "⚑ Classification flagged" : "Wrong classification"}
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/80 p-3">
      <p className="text-[10px] tracking-wide text-zinc-500 uppercase">
        Wrong classification
      </p>
      <div className="mt-2 space-y-1.5">
        {MEDIA_CLASSIFICATION_FEEDBACK_REASONS.map((reason) => {
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
              {isSelected && reason === "WRONG_AI_TAG" ? (
                <CorrectionSelect
                  label="Correct AI tag (optional)"
                  value={corrections.correctedAiTag}
                  disabled={busy}
                  options={MEDIA_CORRECTABLE_AI_TAGS.map((value) => ({
                    value,
                    label: taxonomyLabel(value),
                  }))}
                  onChange={(value) =>
                    setCorrections((current) => ({
                      ...current,
                      correctedAiTag:
                        value as MediaClassificationCorrections["correctedAiTag"],
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
          onClick={() => void persist(selected)}
          disabled={busy || selected.length === 0}
          className="rounded-md border border-amber-900/70 px-2 py-1 text-[10px] text-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save feedback"}
        </button>
        {feedback ? (
          <button
            type="button"
            onClick={() => void persist([])}
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
