import { Situation } from "@/components/monitoring/situation";
import { monitorFilters, type Query } from "@/services/monitoring/core";
export const metadata = { title: "Situation" };
export default async function SituationPage({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  return <Situation filters={monitorFilters(await searchParams)} />;
}
