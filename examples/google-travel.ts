import { flights } from '../src/flights.js';
import { hotels } from '../src/hotels.js';

const departure = new Date(); departure.setUTCDate(departure.getUTCDate() + 17);
const departureDate = process.env.GOOGLE_TRAVEL_DATE ?? departure.toISOString().slice(0, 10);
const checkout = new Date(`${departureDate}T00:00:00Z`); checkout.setUTCDate(checkout.getUTCDate() + 1);

const flightResults = await flights({ currency: 'INR' }).search({ origin: 'BLR', destination: 'BOM', departureDate });
console.log(flightResults.searchUrl);
console.log(flightResults.offers.slice(0, 5).map(offer => ({
  group: offer.group, price: offer.price, durationMinutes: offer.durationMinutes,
  segments: offer.segments.map(segment => ({ carrier: segment.airlineCode, number: segment.flightNumber, departure: segment.departure, arrival: segment.arrival })),
})));

const hotelResults = await hotels({ currency: 'INR' }).search({ query: 'Mumbai', checkIn: departureDate, checkOut: checkout.toISOString().slice(0, 10) });
console.log(hotelResults.hotels.slice(0, 5).map(hotel => ({ name: hotel.name, rating: hotel.rating, price: hotel.price && { amount: hotel.price.amount, currency: hotel.price.currency, formatted: hotel.price.formatted, basis: hotel.price.basis }, mapsUrl: hotel.mapsUrl })));
console.log({ nextPageToken: hotelResults.nextPageToken, occupancyRaw: hotelResults.occupancyRaw });
