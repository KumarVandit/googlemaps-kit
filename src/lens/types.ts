export interface LensConfig {
  fetch?: typeof globalThis.fetch;
  locale?: string;
  timeoutMs?: number;
}
export interface LensRequestOptions { signal?: AbortSignal }
export interface LensUploadOptions extends LensRequestOptions {
  filename?: string;
  mimeType?: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
  width?: number;
  height?: number;
}
export interface LensSearchLinkOptions {
  locale?: string;
}
export interface LensSearchSession {
  /** Google-issued results URL; opening it may still require an access challenge. */
  url: string;
  raw: { status: number; location: string; body: string };
}
