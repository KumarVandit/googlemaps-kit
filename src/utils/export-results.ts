/**
 * Export helpers for discover / place results (CSV + GeoJSON).
 */

import type { PlaceDetails, SearchResult } from '../types/common.js';
import type { PlaceProfile } from '../types/dx.js';

export type ExportablePlace = SearchResult | PlaceDetails | PlaceProfile;

function asPlaceFields(row: ExportablePlace): {
  name?: string;
  hexId?: string;
  placeId?: string;
  address?: string;
  lat?: number;
  lng?: number;
  rating?: number;
  reviewCount?: number;
  phone?: string;
  website?: string;
  category?: string;
} {
  if ('place' in row && row.place) {
    const p = row.place;
    return {
      name: p.name,
      hexId: p.hexId,
      placeId: p.placeId,
      address: p.address,
      lat: p.lat ?? p.latitude,
      lng: p.lng ?? p.longitude,
      rating: p.rating,
      reviewCount: p.reviewCount,
      phone: p.phone,
      website: p.website,
      category: p.categories?.[0],
    };
  }
  const r = row as SearchResult | PlaceDetails;
  return {
    name: r.name,
    hexId: r.hexId,
    placeId: r.placeId,
    address: r.address,
    lat: r.lat ?? r.latitude,
    lng: r.lng ?? r.longitude,
    rating: r.rating,
    reviewCount: r.reviewCount,
    phone: r.phone,
    website: r.website,
    category: 'category' in r ? r.category : r.categories?.[0],
  };
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Flat CSV for spreadsheets / agents. */
export function toCsv(rows: ExportablePlace[]): string {
  const header = [
    'name',
    'hexId',
    'placeId',
    'address',
    'lat',
    'lng',
    'rating',
    'reviewCount',
    'phone',
    'website',
    'category',
  ];
  const lines = [header.join(',')];
  for (const row of rows) {
    const f = asPlaceFields(row);
    lines.push(
      [
        f.name ?? '',
        f.hexId ?? '',
        f.placeId ?? '',
        f.address ?? '',
        f.lat ?? '',
        f.lng ?? '',
        f.rating ?? '',
        f.reviewCount ?? '',
        f.phone ?? '',
        f.website ?? '',
        f.category ?? '',
      ]
        .map((v) => csvEscape(String(v)))
        .join(','),
    );
  }
  return lines.join('\n');
}

export interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: { type: 'Point'; coordinates: [number, number] } | null;
    properties: Record<string, unknown>;
  }>;
}

/** GeoJSON FeatureCollection (skips rows without coords unless includeMissing). */
export function toGeoJSON(
  rows: ExportablePlace[],
  options: { includeMissing?: boolean } = {},
): GeoJsonFeatureCollection {
  const features: GeoJsonFeatureCollection['features'] = [];
  for (const row of rows) {
    const f = asPlaceFields(row);
    const hasCoords = f.lat != null && f.lng != null;
    if (!hasCoords && !options.includeMissing) continue;
    features.push({
      type: 'Feature',
      geometry: hasCoords
        ? { type: 'Point', coordinates: [f.lng!, f.lat!] }
        : null,
      properties: {
        name: f.name,
        hexId: f.hexId,
        placeId: f.placeId,
        address: f.address,
        rating: f.rating,
        reviewCount: f.reviewCount,
        phone: f.phone,
        website: f.website,
        category: f.category,
      },
    });
  }
  return { type: 'FeatureCollection', features };
}
