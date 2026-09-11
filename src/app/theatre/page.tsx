import { Situation } from "@/components/monitoring/situation";
import { monitorFilters, type Query } from "@/services/monitoring/core";
export const metadata = { title: "Theatre" };
export default async function SectorPage({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  return (
    <Situation sector="theatre" filters={monitorFilters(await searchParams)} />
  );
}
