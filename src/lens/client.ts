import { LensError } from './errors.js';
import type { LensConfig, LensSearchLinkOptions, LensSearchSession, LensUploadOptions } from './types.js';

function imageUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new TypeError('Lens requires an absolute HTTP or HTTPS image URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new TypeError('Lens requires an HTTP or HTTPS image URL without credentials');
  return url.toString();
}

/** Builds the image-URL navigation offered by Google's shipped Lens upload service. */
export function buildLensSearchUrl(url: string, options: LensSearchLinkOptions = {}): string {
  const endpoint = new URL('https://lens.google.com/v3/upload');
  endpoint.searchParams.set('url', imageUrl(url));
  endpoint.searchParams.set('ep', 'gsbubu');
  endpoint.searchParams.set('st', String(Date.now()));
  endpoint.searchParams.set('vpw', '1280');
  endpoint.searchParams.set('vph', '720');
  if (options.locale) endpoint.searchParams.set('hl', options.locale);
  return endpoint.toString();
}

/** Starts anonymous Lens uploads; result recognition remains subject to Google's access checks. */
export class LensClient {
  private readonly fetcher: typeof globalThis.fetch;
  private readonly locale: string;
  private readonly timeoutMs: number;
  constructor(config: LensConfig = {}) {
    this.fetcher = config.fetch ?? globalThis.fetch;
    this.locale = config.locale ?? 'en-US';
    this.timeoutMs = config.timeoutMs ?? 30_000;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0 || this.timeoutMs > 2_147_483_647) throw new RangeError('timeoutMs must be positive and no greater than 2147483647');
  }

  searchUrl(url: string): string { return buildLensSearchUrl(url, { locale: this.locale }); }

  /** Uploads caller-supplied image bytes and returns Google's redirect without loading result pages. */
  async createSearch(image: Uint8Array | Blob, options: LensUploadOptions = {}): Promise<LensSearchSession> {
    const mimeType = options.mimeType ?? ((image instanceof Blob ? image.type : '') || 'image/png');
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mimeType)) throw new TypeError('Lens supports PNG, JPEG, WebP, or GIF image bytes');
    const blob = image instanceof Blob ? new Blob([image], { type: mimeType }) : image instanceof Uint8Array ? new Blob([new Uint8Array(image).buffer], { type: mimeType }) : undefined;
    if (!blob || blob.size === 0) throw new TypeError('A nonempty image Blob or Uint8Array is required');
    if ((options.width === undefined) !== (options.height === undefined)) throw new TypeError('width and height must be provided together');
    if (options.width !== undefined && (!Number.isSafeInteger(options.width) || options.width <= 0 || !Number.isSafeInteger(options.height) || options.height! <= 0)) throw new RangeError('Image dimensions must be positive integers');
    if (options.signal?.aborted) throw options.signal.reason ?? new DOMException('The operation was aborted', 'AbortError');
    const body = new FormData();
    // The shipped UEShwc service submits encoded_image and optional processed_image_dimensions.
    body.set('encoded_image', blob, options.filename ?? `image.${mimeType === 'image/jpeg' ? 'jpg' : mimeType.slice(6)}`);
    if (options.width !== undefined) body.set('processed_image_dimensions', `${options.width},${options.height}`);
    const endpoint = new URL('https://lens.google.com/v3/upload');
    endpoint.searchParams.set('ep', 'gsbubb');
    endpoint.searchParams.set('st', String(Date.now()));
    endpoint.searchParams.set('hl', this.locale);
    endpoint.searchParams.set('vpw', '1280');
    endpoint.searchParams.set('vph', '720');
    const controller = new AbortController();
    const abort = () => controller.abort(options.signal?.reason ?? new DOMException('The operation was aborted', 'AbortError'));
    options.signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(new LensError('Lens upload timed out', 'timeout')), this.timeoutMs);
    timer.unref?.();
    try {
      const response = await this.fetcher(endpoint.toString(), { method: 'POST', body, redirect: 'manual', signal: controller.signal });
      const text = await response.text();
      if (controller.signal.aborted) throw controller.signal.reason;
      const retry = response.headers.get('retry-after');
      const retryAfterMs = retry && /^\d+(?:\.\d+)?$/.test(retry) ? Number(retry) * 1000 : undefined;
      if (response.status === 429) throw new LensError('Google Lens rate limited this request', 'rate-limit', 429, retryAfterMs);
      if (/g-recaptcha|Our systems have detected unusual traffic|\/sorry\//i.test(text) || response.url.includes('/sorry/')) throw new LensError('Google Lens returned a traffic challenge', 'blocked', response.status);
      if (response.status === 401) throw new LensError('Google Lens requires authentication', 'auth-required', 401);
      const location = response.headers.get('location');
      if (location && [301, 302, 303, 307, 308].includes(response.status)) {
        let target: URL;
        try { target = new URL(location, endpoint); } catch { throw new LensError('Google Lens returned a malformed redirect', 'parse', response.status); }
        if (target.hostname === 'accounts.google.com' || target.pathname.includes('ServiceLogin')) throw new LensError('Google Lens requires authentication', 'auth-required', response.status);
        if (target.protocol !== 'https:' || !['www.google.com', 'google.com', 'lens.google.com'].includes(target.hostname) || target.username || target.password || target.port) throw new LensError('Google Lens returned an unexpected redirect', 'parse', response.status);
        if (target.pathname.startsWith('/sorry/')) throw new LensError('Google Lens requires a traffic challenge', 'blocked', response.status);
        return { url: target.toString(), raw: { status: response.status, location, body: text } };
      }
      if (!response.ok) throw new LensError(`Google Lens returned HTTP ${response.status}`, 'http', response.status, retryAfterMs);
      throw new LensError('Google Lens did not provide a results redirect', 'parse', response.status);
    } catch (cause) {
      if (controller.signal.aborted) throw controller.signal.reason;
      if (cause instanceof LensError) throw cause;
      throw new LensError('Google Lens upload failed', 'network', undefined, undefined, { cause });
    } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); }
  }
}
