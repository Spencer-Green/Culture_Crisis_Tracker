import type { CountryCode, SectorSlug } from "@/lib/constants";

export type TicketmasterCountryCode = Extract<
  CountryCode,
  "AU" | "US" | "GB" | "CA"
>;

export const TICKETMASTER_COUNTRIES = ["AU", "US", "GB", "CA"] as const;

export type TicketmasterVenueRecord = {
  ticketmasterId: string;
  name: string;
  city: string | null;
  region: string | null;
  countryCode: TicketmasterCountryCode;
  timezone: string | null;
  latitude: string | null;
  longitude: string | null;
};

export type TicketmasterEventRecord = {
  ticketmasterId: string;
  name: string;
  sourceUrl: string;
  sourcePlatform: string;
  countryCode: TicketmasterCountryCode;
  sectorSlug: SectorSlug;
  localDate: string;
  localTime: string | null;
  eventDateTime: Date | null;
  timezone: string | null;
  status: string;
  segmentId: string;
  segmentName: string;
  genreId: string | null;
  genreName: string | null;
  subGenreId: string | null;
  subGenreName: string | null;
  promoterId: string | null;
  promoterName: string | null;
  publicOnsaleStartAt: Date | null;
  publicOnsaleEndAt: Date | null;
  priceMin: string | null;
  priceMax: string | null;
  priceCurrency: string | null;
  priceType: string | null;
  locale: string | null;
  testEvent: boolean;
  venue: TicketmasterVenueRecord | null;
  attractions: { id: string; name: string }[];
};

export type TicketmasterPage = {
  events: TicketmasterEventRecord[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
};

export type TicketmasterRateLimit = {
  dailyRemaining: number | null;
  perSecondRemaining: number | null;
};
