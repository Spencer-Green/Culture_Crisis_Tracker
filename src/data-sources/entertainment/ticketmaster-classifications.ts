import type { SectorSlug } from "@/lib/constants";

export const TICKETMASTER_SEGMENTS = [
  {
    slug: "music",
    id: "KZFzniwnSyZfZ7v7nJ",
    name: "Music",
    sectorSlug: "music",
  },
  {
    slug: "arts-theatre",
    id: "KZFzniwnSyZfZ7v7na",
    name: "Arts & Theatre",
    sectorSlug: "theatre",
  },
  {
    slug: "film",
    id: "KZFzniwnSyZfZ7v7nn",
    name: "Film",
    sectorSlug: "film",
  },
] as const satisfies readonly {
  slug: string;
  id: string;
  name: string;
  sectorSlug: SectorSlug;
}[];

export type TicketmasterSegment = (typeof TICKETMASTER_SEGMENTS)[number];
export type TicketmasterSegmentSlug = TicketmasterSegment["slug"];

export function getTicketmasterSegment(
  slug: string,
): TicketmasterSegment | undefined {
  return TICKETMASTER_SEGMENTS.find((segment) => segment.slug === slug);
}

export function getTicketmasterSegmentById(
  id: string,
): TicketmasterSegment | undefined {
  return TICKETMASTER_SEGMENTS.find((segment) => segment.id === id);
}
