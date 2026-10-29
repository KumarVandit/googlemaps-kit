import type { GoogleTravelConfig, GoogleTravelRequestOptions } from '../travel-google/common.js';
export type FlightsConfig = GoogleTravelConfig;
export interface FlightSearchOptions extends GoogleTravelRequestOptions {
  origin: string;
  destination: string;
  departureDate: string;
}
export interface FlightEndpoint {
  airport: string;
  airportName?: string;
  /** Airport-local calendar date; no UTC offset is supplied by this response. */
  date: string;
  /** Airport-local HH:mm, including zero components omitted on the wire. */
  time: string;
}
export interface FlightSegment {
  departure: FlightEndpoint;
  arrival: FlightEndpoint;
  durationMinutes?: number;
  airlineCode?: string;
  airline?: string;
  flightNumber?: string;
  aircraft?: string;
  raw: unknown;
}
export interface FlightOffer {
  group: 'best' | 'other';
  segments: FlightSegment[];
  durationMinutes?: number;
  stops: number;
  /** Amount in displayed currency units; absent when Google supplies no fare. */
  price?: { amount: number; currency: string };
  /** Opaque selection state, not a URL or a booking guarantee. */
  selectionToken?: string;
  raw: unknown;
}
export interface FlightSearchResult {
  origin: string;
  destination: string;
  departureDate: string;
  tripType: 'one-way';
  adults: 1;
  cabin: 'economy';
  currency: string;
  offers: FlightOffer[];
  searchUrl: string;
  raw: unknown;
}
