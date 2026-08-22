import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  DashboardCard,
  EmptyChart,
  EmptyList,
} from "@/components/dashboard-card";
import { MediaArticleList } from "@/components/media-article-list";
import type { MediaSectorSlug } from "@/data-sources/news/media-types";
import { getRecentMediaDevelopments } from "@/services/media/media";

const SECTIONS = {
  "consumer-spending": {
    title: "Consumer Spending",
    description:
      "Household recreation, culture, credit, and discretionary-spending stress.",
  },
  music: {
    title: "Music",
    description:
      "Recorded music, personal consumption, festivals, and live performance.",
  },
  film: {
    title: "Film",
    description: "Cinema attendance, box office, and film industry conditions.",
  },
  theatre: {
    title: "Theatre",
    description: "Theatre and live performance demand and operating viability.",
  },
  gaming: {
    title: "Gaming",
    description:
      "Sales, layoffs, closures, and physical-versus-digital distribution.",
  },
  "ai-policy": {
    title: "AI & Policy",
    description:
      "AI-generated content policy and its economic impact on creators.",
  },
  "industry-events": {
    title: "Industry Events",
    description:
      "Closures, cancellations, bankruptcies, layoffs, and consolidation.",
  },
  settings: {
    title: "Settings",
    description:
      "Application and source configuration controls will be added later.",
  },
} as const;

type SectionSlug = keyof typeof SECTIONS;

function isSectionSlug(value: string): value is SectionSlug {
  return value in SECTIONS;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>;
}): Promise<Metadata> {
  const { section } = await params;
  return isSectionSlug(section) ? { title: SECTIONS[section].title } : {};
}

export default async function SectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  if (!isSectionSlug(section)) {
    notFound();
  }

  const content = SECTIONS[section];
  const mediaSector = ["music", "film", "theatre", "ai-policy"].includes(
    section,
  )
    ? (section as MediaSectorSlug)
    : null;
  const developments = mediaSector
    ? await getRecentMediaDevelopments(mediaSector)
    : [];

  return (
    <div className="space-y-6">
      <div>
        <p className="font-data text-xs tracking-[0.2em] text-blue-400 uppercase">
          Sector view
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">
          {content.title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
          {content.description}
        </p>
      </div>

      {mediaSector ? (
        <div className="rounded-2xl border border-blue-900/50 bg-blue-950/20 p-5 text-sm text-blue-200/80">
          Current media developments are active. Structured sector trend series
          remain separate and are not scored.
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-900/50 bg-amber-950/20 p-5 text-sm text-amber-200/80">
          This section is ready for a future adapter. No source data has been
          ingested.
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <DashboardCard
          title="Trend"
          description="Validated observations will appear here"
        >
          <EmptyChart label={`${content.title} trend`} />
        </DashboardCard>
        <DashboardCard
          title="Recent Developments"
          description="Latest media article candidates"
        >
          {mediaSector ? (
            <MediaArticleList
              articles={developments}
              feedbackEnabled
              emptyMessage={`No recent ${content.title.toLowerCase()} developments are available`}
            />
          ) : (
            <EmptyList
              message={`No ${content.title.toLowerCase()} records are available`}
            />
          )}
        </DashboardCard>
      </div>
    </div>
  );
}
