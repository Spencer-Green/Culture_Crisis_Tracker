export const IGDB_INCLUDED_GAME_TYPES = [0, 4, 8, 9] as const;
export const IGDB_STEAM_EXTERNAL_SOURCE_ID = 1;

export type IgdbCompanyRole = {
  igdbId: number;
  name: string;
  developer: boolean;
  publisher: boolean;
};

export type IgdbNamedReference = {
  igdbId: number;
  name: string;
};

export type IgdbRelease = {
  igdbId: number;
  releaseDate: Date | null;
  dateCategory: number | null;
  regionId: number | null;
  platform: IgdbNamedReference | null;
  statusId: number | null;
};

export type IgdbExternalId = {
  category: number;
  sourceName: string;
  uid: string;
  name: string | null;
  sourceUrl: string | null;
};

export type IgdbGameRecord = {
  igdbId: number;
  name: string;
  slug: string;
  firstReleaseDate: Date | null;
  gameType: IgdbNamedReference;
  gameStatus: IgdbNamedReference | null;
  parentIgdbId: number | null;
  versionParentIgdbId: number | null;
  igdbCreatedAt: Date | null;
  igdbUpdatedAt: Date | null;
  companies: IgdbCompanyRole[];
  genres: IgdbNamedReference[];
  themes: IgdbNamedReference[];
  platforms: IgdbNamedReference[];
  releases: IgdbRelease[];
  externalIds: IgdbExternalId[];
  steamAppId: number | null;
};
