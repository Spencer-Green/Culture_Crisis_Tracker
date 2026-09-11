import { COUNTRIES } from "@/lib/constants";
import {
  MONITOR_SECTORS,
  type MonitorFilters,
} from "@/services/monitoring/core";

export function MonitorControls({
  filters,
  research = false,
  fixedSector,
  action,
}: {
  filters: MonitorFilters;
  research?: boolean;
  fixedSector?: string;
  action?: string;
}) {
  const control = "rounded border border-zinc-700 bg-zinc-950 p-2 text-sm";
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      {fixedSector ? (
        <input type="hidden" name="sector" value={fixedSector} />
      ) : (
        <label className="grid gap-1 text-xs text-zinc-400">
          Sector
          <select
            className={control}
            name="sector"
            defaultValue={filters.sector ?? ""}
          >
            <option value="">All sectors</option>
            {MONITOR_SECTORS.map((sector) => (
              <option key={sector} value={sector}>
                {sector[0].toUpperCase() + sector.slice(1)}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="grid gap-1 text-xs text-zinc-400">
        Geographic coverage
        <select
          className={control}
          name="country"
          defaultValue={filters.country ?? ""}
        >
          <option value="">All recorded coverage</option>
          {COUNTRIES.map((country) => (
            <option key={country.code} value={country.code}>
              {country.name}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs text-zinc-400">
        Recent window
        <select className={control} name="days" defaultValue={filters.days}>
          <option value="1">24 hours</option>
          <option value="7">7 days</option>
        </select>
      </label>
      {research ? (
        <>
          <label className="grid gap-1 text-xs text-zinc-400">
            Research state
            <select
              className={control}
              name="state"
              defaultValue={filters.quarantine ? "quarantined" : "provisional"}
            >
              <option value="provisional">Provisional</option>
              <option value="quarantined">Quarantined</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs text-zinc-400">
            Discovery window
            <select
              className={control}
              name="view"
              defaultValue={filters.recent ? "new" : "all"}
            >
              <option value="all">All discoveries</option>
              <option value="new">First discovered in recent window</option>
            </select>
          </label>
        </>
      ) : (
        <label className="grid gap-1 text-xs text-zinc-400">
          Theme
          <select
            className={control}
            name="theme"
            defaultValue={filters.aiOnly ? "ai" : ""}
          >
            <option value="">All themes</option>
            <option value="ai">AI &amp; Policy</option>
          </select>
        </label>
      )}
      <button
        className="rounded border border-zinc-500 px-4 py-2 text-sm"
        type="submit"
      >
        Apply filters
      </button>
    </form>
  );
}
