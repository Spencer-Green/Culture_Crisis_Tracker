import Link from "next/link";
import { Surface } from "@/components/monitoring/evidence";
import { COVERAGE_NOTES, MONITOR_SECTORS } from "@/services/monitoring/core";
export const metadata = { title: "Sectors" };
export default function SectorsPage() {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Sectors</h1>
      <div className="grid gap-4 md:grid-cols-2">
        {MONITOR_SECTORS.map((sector) => (
          <Surface
            key={sector}
            title={sector[0].toUpperCase() + sector.slice(1)}
          >
            <p className="text-sm text-zinc-400">{COVERAGE_NOTES[sector]}</p>
            <Link className="text-blue-300" href={`/${sector}`}>
              Open sector situation →
            </Link>
          </Surface>
        ))}
      </div>
      <Link className="text-blue-300" href="/consumer-spending">
        Cross-sector demand context
      </Link>
    </div>
  );
}
