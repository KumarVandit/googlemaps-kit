import type { AdminLevel, AdminRegion } from '../types/location-context.js';

/** Leading Plus Code token in a reverse-geocode address ("XHCV+JRQ Bengaluru, …"). */
const PLUS_CODE_PREFIX = /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}\s+/i;

/**
 * Administrative hierarchy from a reverse-geocode address line.
 *
 * Google returns the hierarchy as a comma-separated tail ("… Bengaluru,
 * Karnataka, India") rather than as tagged components, so levels are assigned
 * by position: last is the country, the one before it a state, and anything
 * ahead of those the city. No extent is reported on this surface.
 */
export function extractAdminRegions(address: string | undefined): AdminRegion[] {
  if (!address) return [];

  const parts = address
    .replace(PLUS_CODE_PREFIX, '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length === 0) return [];

  // Order coarse → fine so each region can point at its parent.
  const coarseToFine = [...parts].reverse();
  // Levels are positional. Callers should hand this a fully-qualified address
  // (see LocationContextService.getRegions, which probes for the country) —
  // a truncated one shifts every level up.
  const levels: AdminLevel[] =
    coarseToFine.length >= 3
      ? ['country', 'state', 'city']
      : coarseToFine.length === 2
        ? ['country', 'city']
        // A lone component is a locality ("New York"), not a country.
        : ['city'];

  const regions: AdminRegion[] = [];
  let parent: AdminRegion | undefined;

  for (const [index, name] of coarseToFine.entries()) {
    const region: AdminRegion = {
      name,
      type: levels[Math.min(index, levels.length - 1)] ?? 'city',
      parent,
    };
    regions.push(region);
    parent = region;
  }

  // Return fine → coarse: callers usually want the most specific region first.
  return regions.reverse();
}
