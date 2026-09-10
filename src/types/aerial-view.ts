/** Processing state returned by the Aerial View API. */
export type AerialViewState = 'ACTIVE' | 'PROCESSING';

/** Supported video container formats in lookupVideo responses. */
export type AerialViewFormat =
  | 'IMAGE'
  | 'MP4_LOW'
  | 'MP4_MEDIUM'
  | 'MP4_HIGH'
  | 'HLS'
  | 'DASH';

export interface AerialViewOrientationUris {
  landscapeUri?: string;
  portraitUri?: string;
}

export interface AerialViewCaptureDate {
  year?: number;
  month?: number;
  day?: number;
}

export interface AerialViewMetadata {
  videoId?: string;
  captureDate?: AerialViewCaptureDate;
  duration?: string;
}

export interface AerialViewLookupResult {
  state: AerialViewState;
  uris?: Partial<Record<AerialViewFormat, AerialViewOrientationUris>>;
  metadata?: AerialViewMetadata;
  /** Present when the video is not found or 3D imagery is unavailable. */
  error?: string;
  statusCode?: number;
}

export interface AerialViewLookupOptions {
  /** US postal address — mutually exclusive with videoId when both omitted. */
  address?: string;
  /** Stored video id from a prior lookup or renderVideo call. */
  videoId?: string;
  /** Google Cloud API key — required; no keyless consumer endpoint exists. */
  apiKey?: string;
}

export interface AerialViewRenderOptions {
  address: string;
  apiKey?: string;
}
