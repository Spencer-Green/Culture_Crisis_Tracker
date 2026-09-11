import { notFound, redirect } from "next/navigation";
export default async function LegacySection({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (section === "ai-policy") redirect("/developments?theme=ai");
  if (section === "settings") redirect("/monitor");
  notFound();
}
