/**
 * Extended place entity types.
 *
 * These supplement the core `PlaceDetails` / `SearchResult` from common.ts with:
 *  - Structured address decomposition
 *  - Popular times (histogram + live busyness + visit duration)
 *  - Menu items
 *  - Q&A section
 *  - Review keyword tags
 *  - Hotel-specific data
 *  - Restaurant-specific data (table reservation provider)
 *  - Gas prices
 *  - "People also search for" recommendations
 *  - Owner updates
 *  - Raw escape hatch on every entity
 */

/** Fully decomposed address fields extracted from place preview node[18] and node[2]. */
export interface StructuredAddress {
  /** Full formatted address string (e.g. "175 Main St, Staten Island, NY 10307"). */
  formatted?: string;
  /** Street-level line: number + street name. */
  street?: string;
  /** Neighbourhood / sub-locality. */
  neighborhood?: string;
  /** City / locality. */
  city?: string;
  /** State / province / region. */
  state?: string;
  /** Postal / ZIP code. */
  postalCode?: string;
  /** ISO 3166-1 alpha-2 country code, e.g. "US". */
  countryCode?: string;
  /** Human-readable country name. */
  country?: string;
  raw?: unknown;
}

/**
 * Hourly busyness entry for one hour of the day.
 *
 * Google stores data as relative occupancy (0–100), not headcounts.
 * `livePercent` is present only when the place is currently open and
 * Google has live occupancy data; it is absent on the histogram-only
 * response or when the place is closed.
 */
export interface PopularTimesHour {
  /** 0–23 (local time). */
  hour: number;
  /**
   * Relative busyness 0–100 based on historical aggregate data.
   * `undefined` when Google does not have data for this hour.
   */
  busynessPercent?: number;
  /** Human-readable busyness label, e.g. "Usually not too busy" (locale-dependent). */
  label?: string;
  /**
   * Wait time text when Google has queue data, e.g. "Up to 15 mins wait".
   * `undefined` when there is no wait or no data.
   */
  waitText?: string;
  /** Time label from Google's UI, e.g. "6 am", "12 pm". */
  timeLabel?: string;
}

/**
 * Popular-times data for one day of the week.
 * `dayIndex` follows JS convention: 0 = Sunday, 1 = Monday, … 6 = Saturday.
 */
export interface PopularTimesDay {
  /** 0 = Sunday, 1 = Monday, … 6 = Saturday (JS Date convention). */
  dayIndex: number;
  /**
   * Raw day index as Google encodes it: 1=Monday … 7=Sunday (ISO weekday).
   * Preserved for round-tripping; consumers should use `dayIndex`.
   */
  rawDayIndex: number;
  /** Lower-cased day name, e.g. "monday". */
  dayName?: string;
  /** Hourly busyness histogram entries. */
  hours: PopularTimesHour[];
}

/**
 * Popular times data for a place, sourced from placeData[84].
 *
 * Verified against live fixture (Kake Di Hatti HSR, 2026-07-31).
 * Only present when Google has enough visit history for a place.
 */
export interface PopularTimesData {
  /** Weekly histogram — one entry per day, sorted by Google's day order. */
  days: PopularTimesDay[];
  /**
   * JS day index (0=Sun … 6=Sat) of the current day at time of fetch.
   * Derived from placeData[84][1] (which uses Google's 1=Mon…7=Sun scale).
   */
  currentDayIndex?: number;
  /** True when Google has real-time live busyness data for this place right now. */
  hasLiveData?: boolean;
  /** True when a weekly histogram is present (vs. live-only data). */
  hasHistogram?: boolean;
  /**
   * Human-readable visit duration string from placeData[117][0],
   * e.g. "People typically spend 1-2.5 hours here".
   */
  visitDurationText?: string;
  /**
   * Lower bound of typical visit duration in minutes (parsed from visitDurationText).
   * e.g. "1-2.5 hours" → 60.
   */
  typicalVisitMinMinutes?: number;
  /**
   * Upper bound of typical visit duration in minutes (parsed from visitDurationText).
   * e.g. "1-2.5 hours" → 150.
   */
  typicalVisitMaxMinutes?: number;
}

/** A single menu item from the inline menu card Google serves for some restaurants. */
export interface MenuItem {
  /** Display name of the item. */
  name: string;
  /** Price string in local currency, e.g. "₹120" or "$4.50". */
  price?: string;
  /** Item description when provided by the business. */
  description?: string;
  /** Photo URL for the item when Google has one. */
  imageUrl?: string;
  /** Section / category the item belongs to, e.g. "Starters", "Mains". */
  section?: string;
  raw?: unknown;
}

/** A section of a structured inline menu. */
export interface MenuSection {
  /** Section heading, e.g. "Appetizers". Omitted when the section has no heading. */
  title?: string;
  items: MenuItem[];
  raw?: unknown;
}

/** Structured inline menu scraped from the Google Maps place card. */
export interface PlaceMenu {
  /** External menu URL (may differ from the structured items). */
  menuUrl?: string;
  /** Inline menu sections when Google serves them. */
  sections?: MenuSection[];
  /** Flat list of all items across all sections. */
  allItems?: MenuItem[];
  raw?: unknown;
}

/** A single answer to a place Q&A question. */
export interface PlaceQAAnswer {
  /** Answer author name. */
  author?: string;
  /**
   * Author avatar URL.
   * Named `authorPhoto` to match the `Review` interface convention
   * (formerly `authorPhotoUrl` — renamed for consistency).
   */
  authorPhoto?: string;
  /** Answer author's Google Maps profile URL when present (answer[2] in wire). */
  authorProfileUrl?: string;
  /** Answer text. */
  text: string;
  /** Relative or absolute date string. */
  date?: string;
  /** How many users found this answer helpful. */
  upvotes?: number;
  /** True when the answer was posted by the business owner. */
  isOwnerAnswer?: boolean;
  raw?: unknown;
}

/** A question + its answers from the public Q&A section of a place. */
export interface PlaceQAItem {
  questionId?: string;
  /** Question text. */
  question: string;
  /** Who asked the question. */
  askedBy?: string;
  /** Profile URL of the person who asked the question (item[3] in wire). */
  askedByProfileUrl?: string;
  /** Date the question was posted. */
  askedDate?: string;
  /** How many users upvoted the question. */
  upvotes?: number;
  answers: PlaceQAAnswer[];
  /** Direct link to this Q&A entry. */
  url?: string;
  raw?: unknown;
}

export interface PlaceQAResult {
  items: PlaceQAItem[];
  totalCount?: number;
  nextPageToken?: string;
  raw?: unknown;
}

/**
 * Keyword-frequency tag shown in the review summary section of a place card.
 * e.g. { text: "prices", count: 6, mentions: "Mentioned in 6 reviews" }
 */
export interface ReviewTag {
  /** The keyword phrase. */
  text: string;
  /** Number of reviews mentioning this keyword (placeData[153][0][i][3][7] = totalMentions). */
  count?: number;
  /**
   * Human-readable label, e.g. "Mentioned in 6 reviews".
   * Always derived from `count` when both are set — not an independent data point.
   * `undefined` when `count` is unavailable.
   */
  mentions?: string;
  /**
   * Count of positive/complimentary mentions (placeData[153][0][i][3][4]).
   * Present on the primary path when Google breaks sentiment out.
   */
  positiveCount?: number;
  /**
   * Count of critical mentions (placeData[153][0][i][3][5]).
   * Present on the primary path alongside `positiveCount`.
   */
  negativeCount?: number;
  raw?: unknown;
}

/** A "people also search for" recommendation from a place card. */
export interface PeopleAlsoSearch {
  /** Place name. */
  title: string;
  /** Hex feature id when present. */
  hexId?: string;
  rating?: number;
  reviewCount?: number;
  category?: string;
  thumbnailUrl?: string;
  raw?: unknown;
}

/** A business-owner-posted update visible on the place card. */
export interface OwnerUpdate {
  updateId?: string;
  text?: string;
  imageUrl?: string;
  date?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  raw?: unknown;
}

/** A single fuel grade price at a gas station. */
export interface GasPrice {
  /** Fuel grade label, e.g. "Regular", "Mid", "Premium", "Diesel". */
  grade: string;
  /** Price string, e.g. "$3.45". */
  price: string;
  /** Currency code when parseable, e.g. "USD". */
  currency?: string;
  /** Price as a float when parseable. */
  priceValue?: number;
  /** Timestamp or relative date when this price was last updated. */
  updatedAt?: string;
  raw?: unknown;
}

/** A hotel booking offer shown on the place card. */
export interface HotelBookingOffer {
  /** Booking provider name, e.g. "Booking.com", "Hotels.com". */
  provider: string;
  /** Price per night string. */
  price?: string;
  /** Whether this is the hotel's official site. */
  isOfficialSite?: boolean;
  /** Booking link URL. */
  url?: string;
  /** Google-wrapped redirect URL. */
  googleUrl?: string;
  raw?: unknown;
}

/** A nearby hotel stub shown in the "similar hotels" section. */
export interface NearbyHotel {
  name: string;
  rating?: number;
  reviewCount?: number;
  description?: string;
  price?: string;
  hexId?: string;
  raw?: unknown;
}

/** Hotel-specific fields extracted from the place card. */
export interface HotelData {
  /** Star rating string, e.g. "4-star hotel". */
  stars?: string;
  /** Numeric star count parsed from the string (1–5). */
  starCount?: number;
  description?: string;
  /** Check-in date from a search context (YYYY-MM-DD), if present. */
  checkInDate?: string;
  /** Check-out date from a search context (YYYY-MM-DD), if present. */
  checkOutDate?: string;
  /** Live booking offers shown on the card. */
  bookingOffers?: HotelBookingOffer[];
  /** Nearby / similar hotels. */
  similarHotels?: NearbyHotel[];
  raw?: unknown;
}

/** Table reservation provider shown on a restaurant card. */
export interface TableReservationProvider {
  name: string;
  /** Google-wrapped reservation URL. */
  reserveTableUrl?: string;
  raw?: unknown;
}

/** Restaurant-specific fields. */
export interface RestaurantData {
  /** Structured reservation provider when Google shows an inline "Reserve a table" button. */
  reservationProvider?: TableReservationProvider;
  /** External table reservation links (provider name → URL). */
  tableReservationLinks?: Array<{ name: string; url: string }>;
  /** Delivery / ordering links (provider name → URL). */
  orderLinks?: Array<{ name: string; url: string }>;
  raw?: unknown;
}

/** All stable identifiers Google attaches to a place, gathered in one object. */
export interface PlaceIdentifiers {
  /** Hex feature id "0x…:0x…" — most stable cross-session id. */
  hexId?: string;
  /** ChIJ… base64 place id. */
  placeId?: string;
  /** Numeric content id (cid) used in some Maps URLs. */
  cid?: string;
  /** Knowledge Graph entity id (/m/… or /g/…). */
  kgmid?: string;
  /** Internal feature id /g/… when distinct from kgmid. */
  featureId?: string;
  /** ftid (full feature token id) used in place preview URLs. */
  ftid?: string;
}

export type BusinessOperatingStatus = 'open' | 'closed' | 'permanently_closed' | 'temporarily_closed' | 'unknown';

/**
 * Extended place details with all structured fields.
 *
 * This extends the base `PlaceDetails` with every additional data point
 * that can be extracted from the place preview protobuf and related endpoints.
 *
 * The `raw` field holds the full protobuf-over-JSON tree from the server,
 * serialized as-is. It is `undefined` unless you pass `{ raw: true }` to
 * the service/intent method. When present it contains **everything** Google
 * sent — useful for field discovery and debugging.
 */
export interface PlaceDetailsExtended {
  /** All Google-assigned identifiers for this place. */
  ids?: PlaceIdentifiers;
  /** Decomposed address fields. */
  structuredAddress?: StructuredAddress;
  /** Operating status derived from hours / closed flags. */
  operatingStatus?: BusinessOperatingStatus;
  /** True if the business listing has been claimed by an owner. */
  isClaimed?: boolean;
  /** Popular times histogram + live busyness + typical visit duration. */
  popularTimes?: PopularTimesData;
  /** Review keyword/topic frequency tags shown under the star rating. */
  reviewTags?: ReviewTag[];
  /** "People also search for" place recommendations. */
  peopleAlsoSearch?: PeopleAlsoSearch[];
  /** Owner-posted updates on the place card. */
  ownerUpdates?: OwnerUpdate[];
  /** Gas station fuel prices when applicable. */
  gasPrices?: GasPrice[];
  /** Hotel-specific card data when the place is a hotel. */
  hotelData?: HotelData;
  /** Restaurant-specific card data when applicable. */
  restaurantData?: RestaurantData;
  /** Inline menu when Google serves structured menu items. */
  menu?: PlaceMenu;
  /** Public Q&A section — populated separately via `places.qa()`. */
  qa?: PlaceQAResult;
  /**
   * Raw protobuf-over-JSON response tree.
   * Present only when the caller requested `raw: true`.
   * Contains every field Google sent, typed as `unknown`.
   */
  raw?: unknown;
}

/**
 * Extension fields for SearchResult that are present in the search response
 * but not in the base type.
 */
export interface SearchResultExtended {
  /** 1-based position in the search results list. */
  rank?: number;
  /** True when this result is a paid advertisement. */
  isAd?: boolean;
  /** Ad position (1-based) when `isAd` is true. */
  adPosition?: number;
  /** Numeric cid (content id). */
  cid?: string;
  /** kgmid (/g/… or /m/…). */
  kgmid?: string;
  /** Price range string (e.g. "$$" or "₹1,000–2,000"). */
  priceRange?: string;
  /** Decomposed address. */
  structuredAddress?: StructuredAddress;
  /** True when the listing has been claimed. */
  isClaimed?: boolean;
  isPermanentlyClosed?: boolean;
  isTemporarilyClosed?: boolean;
  /** Extended place details when fetched via `full` mode search. */
  extended?: PlaceDetailsExtended;
  raw?: unknown;
}
