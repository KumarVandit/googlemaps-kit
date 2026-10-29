import { PassiveAssistService } from '../viewport.js';
import type { GMapsConfig } from '../../types/common.js';
import { HttpClient } from '../../client/http-client.js';
import { GMapsError } from '../../types/common.js';
import type { PassiveAssistOptions } from '../../types/viewport.js';

export interface WeatherCurrentConditions {
  temperature?: { value?: number; unit?: 'CELSIUS' | 'FAHRENHEIT'; display?: string };
  weatherCondition?: { description?: string; iconUrl?: string };
  isDaytime?: boolean;
}

export interface WeatherApiResponse {
  currentConditions?: WeatherCurrentConditions;
  timeZone?: { id?: string };
}

export interface WeatherLookupOptions extends PassiveAssistOptions {
  apiKey?: string;
}

export class WeatherService {
  private passiveAssist: PassiveAssistService;
  private http: HttpClient;
  private defaultApiKey?: string;

  constructor(http: HttpClient, config: GMapsConfig = {}) {
    this.passiveAssist = new PassiveAssistService(http, config);
    this.http = http;
    this.defaultApiKey = config.weatherApiKey ?? process.env.GMAPS_WEATHER_API_KEY;
  }

  /** Current conditions from viewport passive-assist chips. */
  async getCurrentConditions(options: WeatherLookupOptions): Promise<WeatherApiResponse> {
    const chips = await this.passiveAssist.getViewportChips(options);
    const weatherChip = chips.chips.find(
      (c) => c.weatherTemp != null || c.weatherLabel != null,
    );

    if (!weatherChip) {
      return {};
    }

    const tempMatch = weatherChip.weatherTemp?.match(/^(-?\d+(?:\.\d+)?)/);
    const value = tempMatch ? Number(tempMatch[1]) : undefined;
    const isFahrenheit = weatherChip.weatherTemp?.includes('°F');

    return {
      currentConditions: {
        temperature: {
          value,
          unit: isFahrenheit ? 'FAHRENHEIT' : weatherChip.weatherTemp?.includes('°C') ? 'CELSIUS' : undefined,
          display: weatherChip.weatherTemp,
        },
        weatherCondition: {
          description: weatherChip.weatherLabel,
          iconUrl: weatherChip.weatherIconUrl,
        },
      },
    };
  }

  /** Daily forecast when apiKey is configured; follows Google's page token contract. */
  async lookupForecast(options: {
    lat: number;
    lng: number;
    apiKey?: string;
    days?: number;
    pageSize?: number;
    pageToken?: string;
  }): Promise<unknown> {
    const apiKey = options.apiKey ?? this.defaultApiKey;
    if (!apiKey) {
      throw new GMapsError(
        'Weather API requires apiKey, config.weatherApiKey, or GMAPS_WEATHER_API_KEY',
      );
    }
    const params = new URLSearchParams();
    params.set('location.latitude', String(options.lat));
    params.set('location.longitude', String(options.lng));
    for (const [name, value] of [['days', options.days], ['pageSize', options.pageSize]] as const) {
      if (value !== undefined) {
        if (!Number.isInteger(value) || value < 1 || value > 10) throw new RangeError(`${name} must be an integer between 1 and 10`);
        params.set(name, String(value));
      }
    }
    if (options.pageToken !== undefined) params.set('pageToken', options.pageToken);
    const url = `https://weather.googleapis.com/v1/forecast/days:lookup?${params.toString()}`;
    const body = await this.http.get<string>(url, {
      extraHeaders: { 'X-Goog-Api-Key': apiKey },
      raw: true,
      noRetry: true,
    });
    return JSON.parse(body);
  }
}
