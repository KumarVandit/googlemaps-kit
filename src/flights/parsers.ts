import { GoogleWebError } from '../utils/google-web.js';
import { array, dateFromWire, numeric, text, travelDate } from '../travel-google/common.js';
import type { FlightEndpoint, FlightOffer, FlightSearchOptions, FlightSearchResult, FlightSegment } from './types.js';

export function validateFlightSearch(options: FlightSearchOptions): { origin: string; destination: string; departureDate: string } {
  const origin = options.origin?.trim().toUpperCase(), destination = options.destination?.trim().toUpperCase();
  if (!origin || !destination || !/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination) || origin === destination) throw new TypeError('Flights require distinct three-letter origin and destination airport codes');
  travelDate(options.departureDate);
  return { origin, destination, departureDate: options.departureDate };
}

/** Prefetch constraints: field 3 trip type, 6 cabin, 7 passengers, 14 dated legs; airport type is 0. */
export function buildFlightSearchArgs(options: FlightSearchOptions): unknown[] {
  const { origin, destination, departureDate } = validateFlightSearch(options);
  const leg = [[[[origin, 0]]], [[[destination, 0]]], null, 0, null, null, departureDate, null, null, null, null, null, null, null, 3];
  return [[], [null, null, 2, null, [], 1, [1, 0, 0, 0], null, null, null, null, null, null, [leg], null, null, null, 1]];
}

export function buildFlightSearchUrl(options: FlightSearchOptions, currency = 'USD', language = 'en'): string {
  const request = validateFlightSearch(options), url = new URL('https://www.google.com/travel/flights');
  url.searchParams.set('q', `Flights from ${request.origin} to ${request.destination} on ${request.departureDate} one way`);
  url.searchParams.set('curr', currency);
  url.searchParams.set('hl', language);
  return url.toString();
}

function endpoint(code: unknown, name: unknown, rawDate: unknown, rawTime: unknown): FlightEndpoint {
  const airport = text(code), date = dateFromWire(rawDate), time = array(rawTime);
  // A present time message omits zero components: [null, 10] is 00:10.
  const hour = time[0] == null ? 0 : numeric(time[0]), minute = time[1] == null ? 0 : numeric(time[1]);
  if (!airport || !/^[A-Z]{3}$/.test(airport) || !date || !Array.isArray(rawTime) || hour == null || minute == null || !Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) throw new GoogleWebError('Invalid flight airport or local date/time', 'parse');
  return { airport, airportName: text(name), date, time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` };
}

/** Segment fields 4/7 are airports, 9/11 local times, 21/22 local dates, 23 carrier and number. */
function segment(value: unknown): FlightSegment {
  const raw = array(value), flight = array(raw[22]);
  return {
    departure: endpoint(raw[3], raw[4], raw[20], raw[8]), arrival: endpoint(raw[6], raw[5], raw[21], raw[10]),
    durationMinutes: numeric(raw[11]), airlineCode: text(flight[0]), airline: text(flight[3]), flightNumber: text(flight[1]), aircraft: text(raw[17]), raw: value,
  };
}

export function parseFlightSearchResponse(value: unknown, options: FlightSearchOptions, currency: string, language = 'en'): FlightSearchResult {
  const request = validateFlightSearch(options);
  if (!Array.isArray(value) || value.length < 4) throw new GoogleWebError('Invalid Flights shopping response', 'parse');
  const offers: FlightOffer[] = [];
  for (const [index, group] of [[2, 'best'], [3, 'other']] as const) {
    if (value[index] != null && !Array.isArray(value[index])) throw new GoogleWebError('Invalid Flights result group', 'parse');
    const result = array(value[index]);
    if (result[0] != null && !Array.isArray(result[0])) throw new GoogleWebError('Invalid Flights offers', 'parse');
    for (const entry of array(result[0])) {
      const raw = array(entry), itinerary = array(raw[0]), pricing = array(raw[1]);
      if (!Array.isArray(itinerary[2]) || itinerary[2].length === 0) throw new GoogleWebError('Flight segments are missing', 'parse');
      const segments = itinerary[2].map(segment), amount = numeric(array(pricing[0])[1]);
      if (amount != null && amount < 0) throw new GoogleWebError('Invalid flight price', 'parse');
      if (segments[0]?.departure.airport !== request.origin || segments.at(-1)?.arrival.airport !== request.destination || segments[0]?.departure.date !== request.departureDate) throw new GoogleWebError('Flights response did not match the requested route and date', 'parse');
      offers.push({ group, segments, durationMinutes: numeric(itinerary[9]), stops: segments.length - 1, price: amount == null ? undefined : { amount, currency }, selectionToken: text(pricing[1]), raw: entry });
    }
  }
  return { ...request, tripType: 'one-way', adults: 1, cabin: 'economy', currency, offers, searchUrl: buildFlightSearchUrl(options, currency, language), raw: value };
}
