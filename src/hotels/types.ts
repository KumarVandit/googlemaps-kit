import type { GoogleTravelConfig, GoogleTravelRequestOptions } from '../travel-google/common.js';
export type HotelsConfig = GoogleTravelConfig;
export interface HotelSearchOptions extends GoogleTravelRequestOptions {
  query: string;
  checkIn: string;
  checkOut: string;
  pageToken?: string;
}
export interface HotelPrice {
  /** Precise amount in currency units; formatted text may round it. */
  amount: number;
  currency: string;
  formatted?: string;
  /** The captured protocol does not establish nightly versus full-stay semantics. */
  basis: 'displayed';
  checkIn: string;
  checkOut: string;
  /** Unmapped occupancy fields returned with the stay dates. */
  occupancyRaw: unknown;
  raw: unknown;
}
export interface HotelResult {
  id: string;
  name: string;
  mapsFeatureId?: string;
  location?: { lat: number; lng: number };
  address?: string;
  phone?: string;
  hotelClass?: number;
  classLabel?: string;
  rating?: number;
  reviewCount?: number;
  description?: string;
  price?: HotelPrice;
  /** Google's returned website link, which can point to a third-party listing. */
  website?: string;
  mapsUrl?: string;
  imageUrl?: string;
  raw: unknown;
}
export interface HotelSearchResult {
  query: string;
  checkIn: string;
  checkOut: string;
  currency: string;
  hotels: HotelResult[];
  totalResults?: number;
  nextPageToken?: string;
  occupancyRaw: unknown;
  raw: unknown;
}
