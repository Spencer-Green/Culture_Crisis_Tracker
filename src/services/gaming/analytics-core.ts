export type GamingCompanyInput = {
  id: string;
  name: string;
  developer: boolean;
  publisher: boolean;
};

export type GamingGameInput = {
  id: string;
  name: string;
  firstReleaseDate: Date | null;
  gameTypeName: string;
  steamAppId: number | null;
  genres: string[];
  platforms: string[];
  companies: GamingCompanyInput[];
};

export type GamingSteamSnapshotInput = {
  gameId: string;
  capturedAt: Date;
  storeAvailable: boolean;
  currentPlayers: number | null;
  totalReviews: number | null;
  positivePercent: number | null;
  currentPrice: number | null;
  discountPercent: number | null;
  freeToPlay: boolean | null;
  currency: string | null;
};

export type CountedLabel = { label: string; count: number };

export function median(values: readonly number[]): number | null {
  const finite = values
    .filter(Number.isFinite)
    .slice()
    .sort((a, b) => a - b);
  if (finite.length === 0) return null;
  const middle = Math.floor(finite.length / 2);
  return finite.length % 2 === 0
    ? (finite[middle - 1] + finite[middle]) / 2
    : finite[middle];
}

function countLabels(values: readonly string[]): CountedLabel[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort(
      (left, right) =>
        right.count - left.count || left.label.localeCompare(right.label),
    );
}

export function countReleasesByPeriod(
  games: readonly GamingGameInput[],
  granularity: "month" | "quarter" | "year",
): { period: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const game of games) {
    const date = game.firstReleaseDate;
    if (!date) continue;
    const year = date.getUTCFullYear();
    const period =
      granularity === "year"
        ? String(year)
        : granularity === "quarter"
          ? `${year}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`
          : `${year}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    counts.set(period, (counts.get(period) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([period, count]) => ({ period, count }))
    .sort((left, right) => left.period.localeCompare(right.period));
}

export function calculateCompanyConcentration(
  games: readonly GamingGameInput[],
  role: "developer" | "publisher",
): {
  uniqueCompanies: number;
  topTenShare: number | null;
  topCompanies: CountedLabel[];
  releasesPerCompany: {
    min: number | null;
    median: number | null;
    max: number | null;
  };
} {
  const gameIdsByCompany = new Map<
    string,
    { name: string; games: Set<string> }
  >();
  for (const game of games) {
    for (const company of game.companies) {
      if (!company[role]) continue;
      const entry = gameIdsByCompany.get(company.id) ?? {
        name: company.name,
        games: new Set<string>(),
      };
      entry.games.add(game.id);
      gameIdsByCompany.set(company.id, entry);
    }
  }
  const ranked = [...gameIdsByCompany.values()]
    .map((entry) => ({ label: entry.name, count: entry.games.size }))
    .sort(
      (left, right) =>
        right.count - left.count || left.label.localeCompare(right.label),
    );
  const totalAttributedReleases = ranked.reduce(
    (sum, item) => sum + item.count,
    0,
  );
  const topTen = ranked.slice(0, 10).reduce((sum, item) => sum + item.count, 0);
  const distribution = ranked.map((item) => item.count);
  return {
    uniqueCompanies: ranked.length,
    topTenShare:
      totalAttributedReleases > 0
        ? (topTen / totalAttributedReleases) * 100
        : null,
    topCompanies: ranked.slice(0, 10),
    releasesPerCompany: {
      min: distribution.length > 0 ? Math.min(...distribution) : null,
      median: median(distribution),
      max: distribution.length > 0 ? Math.max(...distribution) : null,
    },
  };
}

export function latestSteamSnapshots(
  snapshots: readonly GamingSteamSnapshotInput[],
): Map<string, GamingSteamSnapshotInput> {
  const latest = new Map<string, GamingSteamSnapshotInput>();
  for (const snapshot of snapshots) {
    const current = latest.get(snapshot.gameId);
    if (!current || snapshot.capturedAt > current.capturedAt) {
      latest.set(snapshot.gameId, snapshot);
    }
  }
  return latest;
}

function percent(numerator: number, denominator: number): number | null {
  return denominator > 0 ? (numerator / denominator) * 100 : null;
}

export function buildGamingAnalytics(input: {
  games: readonly GamingGameInput[];
  snapshots: readonly GamingSteamSnapshotInput[];
  now: Date;
}) {
  const games = input.games.slice();
  const latestSnapshots = latestSteamSnapshots(input.snapshots);
  const mappedGames = games.filter((game) => game.steamAppId !== null);
  const mappedWithSnapshot = mappedGames
    .map((game) => ({ game, snapshot: latestSnapshots.get(game.id) }))
    .filter(
      (
        item,
      ): item is {
        game: GamingGameInput;
        snapshot: GamingSteamSnapshotInput;
      } => item.snapshot !== undefined,
    );
  const releasedCutoff = new Date(input.now);
  releasedCutoff.setUTCFullYear(releasedCutoff.getUTCFullYear() - 1);
  const upcoming = (days: number) => {
    const end = new Date(input.now);
    end.setUTCDate(end.getUTCDate() + days);
    return games.filter(
      (game) =>
        game.firstReleaseDate !== null &&
        game.firstReleaseDate >= input.now &&
        game.firstReleaseDate < end,
    ).length;
  };
  const playerItems = mappedWithSnapshot.filter(
    (item) => item.snapshot.currentPlayers !== null,
  );
  const reviewItems = mappedWithSnapshot.filter(
    (item) => item.snapshot.totalReviews !== null,
  );
  const pricedItems = mappedWithSnapshot.filter(
    (item) => item.snapshot.currentPrice !== null,
  );
  const discountedItems = mappedWithSnapshot.filter(
    (item) => (item.snapshot.discountPercent ?? 0) > 0,
  );
  const freeItems = mappedWithSnapshot.filter(
    (item) => item.snapshot.freeToPlay === true,
  );
  const publishers = calculateCompanyConcentration(games, "publisher");
  const developers = calculateCompanyConcentration(games, "developer");

  return {
    totalGames: games.length,
    releaseSeries: {
      monthly: countReleasesByPeriod(games, "month"),
      quarterly: countReleasesByPeriod(games, "quarter"),
      yearly: countReleasesByPeriod(games, "year"),
    },
    latestTwelveMonthReleases: games.filter(
      (game) =>
        game.firstReleaseDate !== null &&
        game.firstReleaseDate >= releasedCutoff &&
        game.firstReleaseDate <= input.now,
    ).length,
    upcoming: {
      days30: upcoming(30),
      days90: upcoming(90),
      days180: upcoming(180),
    },
    topGenres: countLabels(games.flatMap((game) => game.genres)).slice(0, 12),
    topPlatforms: countLabels(games.flatMap((game) => game.platforms)).slice(
      0,
      12,
    ),
    gameTypes: countLabels(games.map((game) => game.gameTypeName)),
    publishers,
    developers,
    steam: {
      mappedGames: mappedGames.length,
      mappedPercent: percent(mappedGames.length, games.length),
      snapshotGames: mappedWithSnapshot.length,
      playerCoveragePercent: percent(playerItems.length, mappedGames.length),
      totalCurrentPlayers: playerItems.reduce(
        (sum, item) => sum + (item.snapshot.currentPlayers ?? 0),
        0,
      ),
      medianCurrentPlayers: median(
        playerItems.map((item) => item.snapshot.currentPlayers ?? 0),
      ),
      topCurrentPlayers: playerItems
        .map((item) => ({
          name: item.game.name,
          value: item.snapshot.currentPlayers ?? 0,
        }))
        .sort((left, right) => right.value - left.value)
        .slice(0, 10),
      reviewCoveragePercent: percent(reviewItems.length, mappedGames.length),
      medianReviews: median(
        reviewItems.map((item) => item.snapshot.totalReviews ?? 0),
      ),
      medianPositivePercent: median(
        reviewItems
          .map((item) => item.snapshot.positivePercent)
          .filter((value): value is number => value !== null),
      ),
      priceCoveragePercent: percent(pricedItems.length, mappedGames.length),
      discountSharePercent: percent(
        discountedItems.length,
        mappedWithSnapshot.length,
      ),
      medianDiscountPercent: median(
        discountedItems.map((item) => item.snapshot.discountPercent ?? 0),
      ),
      freeToPlaySharePercent: percent(
        freeItems.length,
        mappedWithSnapshot.length,
      ),
      latestCapture:
        mappedWithSnapshot
          .reduce<Date | null>(
            (latest, item) =>
              !latest || item.snapshot.capturedAt > latest
                ? item.snapshot.capturedAt
                : latest,
            null,
          )
          ?.toISOString() ?? null,
    },
  };
}

export type GamingAnalytics = ReturnType<typeof buildGamingAnalytics>;
