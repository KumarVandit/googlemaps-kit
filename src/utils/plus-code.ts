/**
 * Open Location Code (Plus Code) encoder — ported from Google's reference implementation.
 *
 * Forward geocode hits carry address metadata at placeData[183] but omit the compact
 * code at [183][2][1][0]; that slot appears on reverse-geocode coordinate hits only.
 * When coordinates are known, a derived code matches Google's mathematically.
 */

const SEPARATOR = '+';
const SEPARATOR_POSITION = 8;
const PADDING_CHARACTER = '0';
const CODE_ALPHABET = '23456789CFGHJMPQRVWX';
const ENCODING_BASE = CODE_ALPHABET.length;
const LATITUDE_MAX = 90;
const LONGITUDE_MAX = 180;
const PAIR_CODE_LENGTH = 10;
const MAX_DIGIT_COUNT = 15;
const GRID_COLUMNS = 4;
const GRID_ROWS = 5;
const PAIR_PRECISION = ENCODING_BASE ** 3;
const GRID_CODE_LENGTH = MAX_DIGIT_COUNT - PAIR_CODE_LENGTH;
const FINAL_LAT_PRECISION =
  PAIR_PRECISION * GRID_ROWS ** (MAX_DIGIT_COUNT - PAIR_CODE_LENGTH);
const FINAL_LNG_PRECISION =
  PAIR_PRECISION * GRID_COLUMNS ** (MAX_DIGIT_COUNT - PAIR_CODE_LENGTH);

function locationToIntegers(latitude: number, longitude: number): [number, number] {
  let latVal = Math.floor(latitude * FINAL_LAT_PRECISION);
  latVal += LATITUDE_MAX * FINAL_LAT_PRECISION;
  if (latVal < 0) {
    latVal = 0;
  } else if (latVal >= 2 * LATITUDE_MAX * FINAL_LAT_PRECISION) {
    latVal = 2 * LATITUDE_MAX * FINAL_LAT_PRECISION - 1;
  }

  let lngVal = Math.floor(longitude * FINAL_LNG_PRECISION);
  lngVal += LONGITUDE_MAX * FINAL_LNG_PRECISION;
  if (lngVal < 0) {
    lngVal =
      (lngVal % (2 * LONGITUDE_MAX * FINAL_LNG_PRECISION)) +
      2 * LONGITUDE_MAX * FINAL_LNG_PRECISION;
  } else if (lngVal >= 2 * LONGITUDE_MAX * FINAL_LNG_PRECISION) {
    lngVal = lngVal % (2 * LONGITUDE_MAX * FINAL_LNG_PRECISION);
  }

  return [latVal, lngVal];
}

function encodeIntegers(latInt: number, lngInt: number, codeLength = PAIR_CODE_LENGTH): string {
  const code: string[] = new Array(MAX_DIGIT_COUNT + 1);
  code[SEPARATOR_POSITION] = SEPARATOR;

  if (codeLength > PAIR_CODE_LENGTH) {
    for (let i = MAX_DIGIT_COUNT - PAIR_CODE_LENGTH; i >= 1; i--) {
      const latDigit = latInt % GRID_ROWS;
      const lngDigit = lngInt % GRID_COLUMNS;
      const ndx = latDigit * GRID_COLUMNS + lngDigit;
      code[SEPARATOR_POSITION + 2 + i] = CODE_ALPHABET[ndx]!;
      latInt = Math.floor(latInt / GRID_ROWS);
      lngInt = Math.floor(lngInt / GRID_COLUMNS);
    }
  } else {
    latInt = Math.floor(latInt / GRID_ROWS ** GRID_CODE_LENGTH);
    lngInt = Math.floor(lngInt / GRID_COLUMNS ** GRID_CODE_LENGTH);
  }

  code[SEPARATOR_POSITION + 1] = CODE_ALPHABET[latInt % ENCODING_BASE]!;
  code[SEPARATOR_POSITION + 2] = CODE_ALPHABET[lngInt % ENCODING_BASE]!;
  latInt = Math.floor(latInt / ENCODING_BASE);
  lngInt = Math.floor(lngInt / ENCODING_BASE);

  for (let i = PAIR_CODE_LENGTH / 2 + 1; i >= 0; i -= 2) {
    code[i] = CODE_ALPHABET[latInt % ENCODING_BASE]!;
    code[i + 1] = CODE_ALPHABET[lngInt % ENCODING_BASE]!;
    latInt = Math.floor(latInt / ENCODING_BASE);
    lngInt = Math.floor(lngInt / ENCODING_BASE);
  }

  if (codeLength >= SEPARATOR_POSITION) {
    return code.slice(0, codeLength + 1).join('');
  }
  return (
    code.slice(0, codeLength).join('') +
    PADDING_CHARACTER.repeat(SEPARATOR_POSITION - codeLength) +
    SEPARATOR
  );
}

/** Encode a full Plus Code from WGS84 coordinates (default 10-digit pair precision). */
export function encodePlusCode(latitude: number, longitude: number, codeLength = PAIR_CODE_LENGTH): string {
  const [latInt, lngInt] = locationToIntegers(latitude, longitude);
  return encodeIntegers(latInt, lngInt, codeLength);
}

export type PlusCodeSource = 'payload' | 'derived-olc';
