import { HttpClient } from '../client/http-client.js';
import { GMapsError, type GMapsConfig } from '../types/common.js';

function resolveApiKey(
  override?: string,
  configKey?: string,
  envKey?: string,
  label?: string,
): string {
  const key = override ?? configKey ?? envKey;
  if (!key) {
    throw new GMapsError(
      `${label ?? 'Service'} requires apiKey, client config, or environment variable`,
    );
  }
  return key;
}

/** Roads — snapToRoads / nearestRoads (requires apiKey). */
export class RoadsService {
  private http: HttpClient;
  private apiKey?: string;

  constructor(http: HttpClient, config: GMapsConfig = {}) {
    this.http = http;
    this.apiKey = config.roadsApiKey ?? process.env.GMAPS_ROADS_API_KEY;
  }

  async snapToRoads(options: {
    path: Array<{ lat: number; lng: number }>;
    interpolate?: boolean;
    apiKey?: string;
  }): Promise<unknown> {
    const key = resolveApiKey(options.apiKey, this.apiKey, undefined, 'Roads');
    const path = options.path.map((p) => `${p.lat},${p.lng}`).join('|');
    const params = new URLSearchParams({ path, interpolate: String(options.interpolate ?? false) });
    const url = `https://roads.googleapis.com/v1/snapToRoads?${params.toString()}`;
    const body = await this.http.get<string>(url, {
      extraHeaders: { 'X-Goog-Api-Key': key },
      raw: true,
      noRetry: true,
    });
    return JSON.parse(body);
  }

  async nearestRoads(options: {
    points: Array<{ lat: number; lng: number }>;
    apiKey?: string;
  }): Promise<unknown> {
    const key = resolveApiKey(options.apiKey, this.apiKey, undefined, 'Roads');
    const points = options.points.map((p) => `${p.lat},${p.lng}`).join('|');
    const params = new URLSearchParams({ points });
    const url = `https://roads.googleapis.com/v1/nearestRoads?${params.toString()}`;
    const body = await this.http.get<string>(url, {
      extraHeaders: { 'X-Goog-Api-Key': key },
      raw: true,
      noRetry: true,
    });
    return JSON.parse(body);
  }
}

/** Solar building insights (requires apiKey). */
export class SolarService {
  private http: HttpClient;
  private apiKey?: string;

  constructor(http: HttpClient, config: GMapsConfig = {}) {
    this.http = http;
    this.apiKey = config.solarApiKey ?? process.env.GMAPS_SOLAR_API_KEY;
  }

  async findClosestBuildingInsights(options: {
    lat: number;
    lng: number;
    apiKey?: string;
  }): Promise<unknown> {
    const key = resolveApiKey(options.apiKey, this.apiKey, undefined, 'Solar');
    const params = new URLSearchParams({
      'location.latitude': String(options.lat),
      'location.longitude': String(options.lng),
    });
    const url = `https://solar.googleapis.com/v1/buildingInsights:findClosest?${params.toString()}`;
    const body = await this.http.get<string>(url, {
      extraHeaders: { 'X-Goog-Api-Key': key },
      raw: true,
      noRetry: true,
    });
    return JSON.parse(body);
  }
}

/** Pollen forecast (requires apiKey). */
export class PollenService {
  private http: HttpClient;
  private apiKey?: string;

  constructor(http: HttpClient, config: GMapsConfig = {}) {
    this.http = http;
    this.apiKey = config.pollenApiKey ?? process.env.GMAPS_POLLEN_API_KEY;
  }

  async lookupForecast(options: {
    lat: number;
    lng: number;
    days?: number;
    apiKey?: string;
  }): Promise<unknown> {
    const key = resolveApiKey(options.apiKey, this.apiKey, undefined, 'Pollen');
    const params = new URLSearchParams({
      'location.latitude': String(options.lat),
      'location.longitude': String(options.lng),
      days: String(options.days ?? 1),
    });
    const url = `https://pollen.googleapis.com/v1/forecast:lookup?${params.toString()}`;
    const body = await this.http.get<string>(url, {
      extraHeaders: { 'X-Goog-Api-Key': key },
      raw: true,
      noRetry: true,
    });
    return JSON.parse(body);
  }
}

/** Address validation (requires apiKey). */
export class AddressValidationService {
  private http: HttpClient;
  private apiKey?: string;

  constructor(http: HttpClient, config: GMapsConfig = {}) {
    this.http = http;
    this.apiKey = config.addressValidationApiKey ?? process.env.GMAPS_ADDRESS_VALIDATION_API_KEY;
  }

  async validateAddress(options: {
    addressLines: string[];
    regionCode?: string;
    apiKey?: string;
  }): Promise<unknown> {
    const key = resolveApiKey(options.apiKey, this.apiKey, undefined, 'Address Validation');
    const url = 'https://addressvalidation.googleapis.com/v1:validateAddress';
    const payload = {
      address: {
        addressLines: options.addressLines,
        regionCode: options.regionCode,
      },
    };
    const body = await this.httpPostJson(url, payload, key);
    return JSON.parse(body);
  }

  private async httpPostJson(url: string, payload: unknown, apiKey: string): Promise<string> {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new GMapsError(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.text();
  }
}

/** WiFi/cell geolocation (requires apiKey). */
export class GeolocationService {
  private apiKey?: string;

  constructor(_http: HttpClient, config: GMapsConfig = {}) {
    this.apiKey = config.geolocationApiKey ?? process.env.GMAPS_GEOLOCATION_API_KEY;
  }

  async geolocate(options: {
    considerIp?: boolean;
    wifiAccessPoints?: Array<{ macAddress: string; signalStrength?: number }>;
    cellTowers?: Array<{
      cellId: number;
      locationAreaCode: number;
      mobileCountryCode: number;
      mobileNetworkCode: number;
      signalStrength?: number;
    }>;
    apiKey?: string;
  }): Promise<unknown> {
    const key = resolveApiKey(options.apiKey, this.apiKey, undefined, 'Geolocation');
    const url = `https://www.googleapis.com/geolocation/v1/geolocate?key=${encodeURIComponent(key)}`;
    const body = await this.httpPostJson(url, {
      considerIp: options.considerIp,
      wifiAccessPoints: options.wifiAccessPoints,
      cellTowers: options.cellTowers,
    });
    return JSON.parse(body);
  }

  private async httpPostJson(url: string, payload: unknown): Promise<string> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new GMapsError(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.text();
  }
}
