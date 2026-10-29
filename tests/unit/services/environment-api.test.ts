import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpClient } from '../../../src/client/http-client.js';
import { AirQualityService } from '../../../src/services/environment/air-quality.js';
import { WeatherService } from '../../../src/services/environment/weather.js';
import { loadJsonFixture } from '../../helpers/fixtures.js';

afterEach(() => vi.unstubAllGlobals());

describe('environment API contracts', () => {
  it('sends the Air Quality location as a JSON POST and preserves the response', async () => {
    const data = { indexes: [{ aqi: 42, category: 'Good' }], regionCode: 'in', dateTime: '2026-10-29T07:00:00Z', pollutants: [{ code: 'pm25' }] };
    const postJson = vi.fn().mockResolvedValue(data);
    const service = new AirQualityService({ postJson } as unknown as HttpClient, {});
    const result = await service.lookup({ lat: 12.9, lng: 77.6, apiKey: 'caller-key' });
    expect(postJson).toHaveBeenCalledWith('https://airquality.googleapis.com/v1/currentConditions:lookup', { location: { latitude: 12.9, longitude: 77.6 } }, { extraHeaders: { 'X-Goog-Api-Key': 'caller-key' }, noRetry: true });
    expect(result.indexes?.[0]?.aqi).toBe(42);
    expect(result.raw).toBe(data);
  });

  it('requests actual daily forecast records with pagination controls', async () => {
    const get = vi.fn().mockResolvedValue(JSON.stringify({ forecastDays: [{ displayDate: { year: 2026, month: 10, day: 29 } }], nextPageToken: 'next' }));
    const service = new WeatherService({ get } as unknown as HttpClient, {});
    const data = await service.lookupForecast({ lat: 12.9, lng: 77.6, apiKey: 'caller-key', days: 10, pageSize: 5, pageToken: 'token' });
    const url = new URL(get.mock.calls[0]![0] as string);
    expect(url.pathname).toBe('/v1/forecast/days:lookup');
    expect(Object.fromEntries(url.searchParams)).toEqual({ 'location.latitude': '12.9', 'location.longitude': '77.6', days: '10', pageSize: '5', pageToken: 'token' });
    expect(data).toMatchObject({ forecastDays: expect.any(Array), nextPageToken: 'next' });
    await expect(service.lookupForecast({ lat: 0, lng: 0, apiKey: 'key', days: 11 })).rejects.toBeInstanceOf(RangeError);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('does not invent Celsius for a viewport chip with an unlabeled degree symbol', async () => {
    const raw = loadJsonFixture('passiveassist-hsr-chips.json');
    const service = new WeatherService({ get: vi.fn().mockResolvedValue(raw) } as unknown as HttpClient, {});
    const result = await service.getCurrentConditions({ lat: 12.9, lng: 77.6, psi: 'caller-viewport-token' });
    expect(result.currentConditions?.temperature).toEqual({ value: 77, display: '77°', unit: undefined });
  });

  it('does not turn API access requirements into fabricated anonymous data', async () => {
    const get = vi.fn(), postJson = vi.fn();
    const http = { get, postJson } as unknown as HttpClient;
    const weather = new WeatherService(http, { weatherApiKey: '' });
    const airQuality = new AirQualityService(http, { airQualityApiKey: '' });
    await expect(weather.lookupForecast({ lat: 0, lng: 0 })).rejects.toThrow(/requires apiKey/);
    await expect(airQuality.lookup({ lat: 0, lng: 0 })).rejects.toThrow(/requires apiKey/);
    expect(get).not.toHaveBeenCalled(); expect(postJson).not.toHaveBeenCalled();
  });

  it('posts JSON without applying Maps array decoding or automatic retries', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('{"indexes":[{"aqi":0}]}')).mockResolvedValueOnce(new Response('blocked', { status: 429 }));
    vi.stubGlobal('fetch', fetcher);
    const http = new HttpClient({ config: { cookies: 'NID=test', maxRetries: 2 } });
    expect(await http.postJson('https://airquality.googleapis.com/v1/currentConditions:lookup', { location: { latitude: 0, longitude: 0 } })).toEqual({ indexes: [{ aqi: 0 }] });
    const options = fetcher.mock.calls[0]![1]!;
    expect(options.method).toBe('POST');
    expect(new Headers(options.headers).get('Content-Type')).toBe('application/json');
    expect(JSON.parse(options.body as string)).toEqual({ location: { latitude: 0, longitude: 0 } });
    await expect(http.postJson('https://airquality.googleapis.com/v1/currentConditions:lookup', {})).rejects.toThrow(/429/);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
