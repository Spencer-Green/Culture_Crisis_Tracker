import { DashboardCard } from "@/components/dashboard-card";
import { MediaArticleList } from "@/components/media-article-list";
import {
  buildSectorMediaTiers,
  type MediaArticleView,
} from "@/services/media/media-service-core";

export function SectorMediaDevelopments({
  articles,
  sectorLabel,
}: {
  articles: readonly MediaArticleView[];
  sectorLabel: string;
}) {
  const tiers = buildSectorMediaTiers(articles);
  return (
    <section className="space-y-5">
      <DashboardCard
        title="Industry Signals"
        description={`Higher-signal ${sectorLabel} developments, including positive counter-signals`}
      >
        <MediaArticleList
          articles={tiers.industrySignals}
          feedbackEnabled
          emptyMessage={`No higher-signal ${sectorLabel.toLowerCase()} developments are available`}
        />
      </DashboardCard>
      {tiers.sectorFeed.length > 0 ? (
        <DashboardCard
          title={`More from ${sectorLabel}`}
          description="Broader sector coverage, newest first"
        >
          <MediaArticleList
            articles={tiers.sectorFeed}
            compact
            dense
            feedbackEnabled
          />
        </DashboardCard>
      ) : null}
    </section>
  );
}
