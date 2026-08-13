export type SteamStoreDetails = {
  storeAvailable: boolean;
  name: string | null;
  type: string | null;
  developers: string[];
  publishers: string[];
  freeToPlay: boolean | null;
  currentPrice: number | null;
  originalPrice: number | null;
  discountPercent: number | null;
  currency: string | null;
  releaseDate: string | null;
  comingSoon: boolean | null;
  genres: string[];
};

export type SteamReviewSummary = {
  totalReviews: number | null;
  positiveReviews: number | null;
  positivePercent: number | null;
  reviewScore: number | null;
  reviewScoreLabel: string | null;
};

export type SteamGameObservation = SteamStoreDetails &
  SteamReviewSummary & {
    steamAppId: number;
    currentPlayers: number | null;
    retrievedAt: Date;
  };
