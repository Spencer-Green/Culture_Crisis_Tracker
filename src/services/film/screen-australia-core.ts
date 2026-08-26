export function screenAustraliaReportAge(
  reportDate: Date,
  now = new Date(),
): { ageDays: number; stale: boolean } {
  const ageDays = Math.max(
    0,
    Math.floor((now.getTime() - reportDate.getTime()) / 86_400_000),
  );
  return { ageDays, stale: ageDays > 10 };
}

export function screenAustraliaNextScheduledAt(
  lastSuccessfulAt: Date | null,
  schedulerNextAt: Date | null,
): Date | null {
  if (schedulerNextAt) return schedulerNextAt;
  return lastSuccessfulAt
    ? new Date(lastSuccessfulAt.getTime() + 7 * 86_400_000)
    : null;
}
