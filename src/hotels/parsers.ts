import { GoogleWebError } from '../utils/google-web.js';
import { array, dateFromWire, numeric, text, travelDate } from '../travel-google/common.js';
import type { HotelPrice, HotelResult, HotelSearchOptions, HotelSearchResult } from './types.js';

export function validateHotelSearch(options: HotelSearchOptions): void {
  if (typeof options.query !== 'string' || !options.query.trim() || options.query.length > 1000) throw new TypeError('Hotel query must contain 1–1000 characters');
  travelDate(options.checkIn); travelDate(options.checkOut);
  if (options.checkOut <= options.checkIn) throw new RangeError('Hotel checkOut must follow checkIn');
  if (options.pageToken != null && (typeof options.pageToken !== 'string' || !/^[A-Za-z0-9_+=/-]{1,4096}$/.test(options.pageToken))) throw new TypeError('Invalid hotel page token');
}

/** HotelService.Search field 4 carries currency/dates; field 5 carries the returned page token. */
export function buildHotelSearchArgs(options: HotelSearchOptions, currency: string): unknown[] {
  validateHotelSearch(options);
  const args: unknown[] = [options.query, null, null, [null, null, null, currency, [travelDate(options.checkIn), travelDate(options.checkOut), 1, 1]]];
  if (options.pageToken) args.push(options.pageToken);
  return args;
}

function parsePrice(value: unknown, options: HotelSearchOptions): HotelPrice | undefined {
  const raw = array(value), amount = numeric(array(raw[1])[2]), currency = text(raw[15]);
  if (amount == null) return undefined;
  if (amount < 0) throw new GoogleWebError('Invalid hotel price', 'parse');
  const stay = array(raw[8]), checkIn = dateFromWire(stay[0]), checkOut = dateFromWire(stay[1]);
  if (!currency || !/^[A-Z]{3}$/.test(currency) || checkIn !== options.checkIn || checkOut !== options.checkOut) throw new GoogleWebError('Hotel price currency or stay dates are missing or mismatched', 'parse');
  return { amount, currency, formatted: text(array(raw[1])[0]), basis: 'displayed', checkIn, checkOut, occupancyRaw: stay.slice(2), raw: value };
}

/** Search field 9 is card data; extension 179305178 is the shipped HotelEntity message. */
export function parseHotelSearchResponse(value: unknown, options: HotelSearchOptions, expectedCurrency?: string): HotelSearchResult {
  validateHotelSearch(options);
  if (!Array.isArray(value) || !Array.isArray(value[1]) || !Array.isArray(value[8])) throw new GoogleWebError('Invalid HotelService.Search response', 'parse');
  const settings = array(value[1]), stay = array(settings[4]);
  if (dateFromWire(stay[0]) !== options.checkIn || dateFromWire(stay[1]) !== options.checkOut) throw new GoogleWebError('Hotel search dates did not match the request', 'parse');
  const currency = text(settings[3]);
  if (!currency || !/^[A-Z]{3}$/.test(currency)) throw new GoogleWebError('Hotel search currency is missing', 'parse');
  if (expectedCurrency && currency !== expectedCurrency) throw new GoogleWebError('Hotel search currency did not match the request', 'parse');
  const hotels: HotelResult[] = [], seen = new Set<string>();
  for (const entry of value[8]) {
    const extension = array(entry)[1];
    if (!extension || typeof extension !== 'object' || Array.isArray(extension) || !Object.prototype.hasOwnProperty.call(extension, '179305178')) continue;
    const node = (extension as Record<string, unknown>)['179305178'];
    if (!Array.isArray(node)) throw new GoogleWebError('Invalid hotel entity', 'parse');
    const id = text(node[20]), name = text(node[1]);
    if (!id || !name) throw new GoogleWebError('Hotel identity is missing', 'parse');
    if (seen.has(id)) continue;
    seen.add(id);
    const details = array(node[2]), coords = array(details[0]), lat = numeric(coords[0]), lng = numeric(coords[1]);
    if ((lat != null && (lat < -90 || lat > 90)) || (lng != null && (lng < -180 || lng > 180))) throw new GoogleWebError('Invalid hotel coordinates', 'parse');
    const rating = array(array(node[7])[0]), hotelClass = array(node[3]), price = parsePrice(array(node[6])[2], options);
    if (price && price.currency !== currency) throw new GoogleWebError('Hotel price currency differs from the search currency', 'parse');
    hotels.push({
      id, name, mapsFeatureId: text(node[9]), location: lat == null || lng == null ? undefined : { lat, lng },
      address: text(array(array(array(details[1])[0])[0])[0]), phone: text(array(details[2])[0]),
      hotelClass: numeric(hotelClass[1]), classLabel: text(hotelClass[0]), rating: numeric(rating[0]), reviewCount: numeric(rating[1]),
      description: text(array(node[11])[0]), price, website: text(array(details[29])[2]), mapsUrl: text(array(details[13])[2]), imageUrl: text(array(node[12])[0]), raw: node,
    });
  }
  return { query: options.query, checkIn: options.checkIn, checkOut: options.checkOut, currency, hotels, totalResults: numeric(array(value[9])[0]), nextPageToken: text(value[2]), occupancyRaw: stay.slice(2), raw: value };
}
