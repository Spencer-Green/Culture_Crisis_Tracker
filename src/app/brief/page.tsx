import type { Metadata } from "next";

import { DailyBriefFull } from "@/components/daily-culture-brief";
import { getDailyCultureBrief } from "@/services/media/daily-brief";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Daily Culture Brief" };

export default async function DailyBriefPage() {
  const brief = await getDailyCultureBrief({ includeStorySyntheses: true });
  return <DailyBriefFull brief={brief} />;
}
