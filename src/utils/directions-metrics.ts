const DISTANCE_RE =
  /^(\d[\d.,]*)\s*(km|kilometers?|mi|miles?|m|meters?|ft|feet)$/i;

const DURATION_RE =
  /^(\d[\d.,]*)\s*(days?|d|hrs?|hours?|hr|h|mins?|minutes?|min|m|secs?|seconds?|sec|s)$/i;

function parseLocalizedNumber(value: string): number {
  const normalized = value.replace(/,/g, '.').replace(/\.(?=.*\.)/g, '');
  return Number.parseFloat(normalized);
}

/** Parse Google directions distance strings such as `4.5 km` or `397 m`. */
export function parseDistanceToMeters(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const trimmed = text.trim();
  const match = DISTANCE_RE.exec(trimmed);
  if (!match) return undefined;

  const amount = parseLocalizedNumber(match[1]!);
  if (!Number.isFinite(amount)) return undefined;

  const unit = match[2]!.toLowerCase();
  if (unit.startsWith('km') || unit.startsWith('kilometer')) return Math.round(amount * 1000);
  if (unit === 'm' || unit.startsWith('meter')) return Math.round(amount);
  if (unit.startsWith('mi') || unit.startsWith('mile')) return Math.round(amount * 1609.344);
  if (unit.startsWith('ft') || unit.startsWith('feet')) return Math.round(amount * 0.3048);

  return undefined;
}

function durationUnitToSeconds(amount: number, unit: string): number {
  if (unit.startsWith('day') || unit === 'd') return amount * 86_400;
  if (unit.startsWith('hr') || unit.startsWith('hour') || unit === 'h') return amount * 3600;
  if (unit.startsWith('min') || unit === 'm') return amount * 60;
  if (unit.startsWith('sec') || unit === 's') return amount;
  return amount;
}

/** Parse Google directions duration strings such as `14 min` or `1 hr 5 mins`. */
export function parseDurationToSeconds(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return undefined;

  const parts = trimmed.match(/(\d[\d.,]*)\s*(days?|d|hrs?|hours?|hr|h|mins?|minutes?|min|m|secs?|seconds?|sec|s)\b/g);
  if (!parts || parts.length === 0) return undefined;

  let total = 0;
  for (const part of parts) {
    const match = DURATION_RE.exec(part.trim());
    if (!match) continue;
    const amount = parseLocalizedNumber(match[1]!);
    if (!Number.isFinite(amount)) continue;
    total += durationUnitToSeconds(amount, match[2]!.toLowerCase());
  }

  return total > 0 ? Math.round(total) : undefined;
}
