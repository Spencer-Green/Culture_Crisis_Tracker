import { Situation } from "@/components/monitoring/situation";
import { monitorFilters, type Query } from "@/services/monitoring/core";
export const metadata = { title: "Film" };
export default async function SectorPage({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  return (
    <Situation sector="film" filters={monitorFilters(await searchParams)} />
  );
}
