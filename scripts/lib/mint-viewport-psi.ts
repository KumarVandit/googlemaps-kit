/**
 * Mint an in-page passiveassist psi via a short headless Maps session.
 *
 * fetchSessionPsi / bootstrap kEI return cache-metadata stubs for passiveassist;
 * only psi observed in a live Maps viewport request yields POI chips.
 */

import { launchBrowser } from './cdp.js';
import { attachPage, enablePageSession, MapsHarness, sleep } from './maps-harness.js';

export interface MintViewportPsiOptions {
  lat: number;
  lng: number;
  zoom?: number;
  hl?: string;
  gl?: string;
  /** Also return the verbatim passiveassist URL the page requested. */
  captureUrl?: boolean;
}

export interface MintViewportPsiResult {
  psi: string;
  passiveAssistUrl?: string;
}

function extractPsiFromUrl(url: string): string | null {
  try {
    const pb = new URL(url).searchParams.get('pb');
    if (!pb) return null;
    const match = pb.match(/!3m3!1s([^!]+)!7e81/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export async function mintViewportPsi(options: MintViewportPsiOptions): Promise<MintViewportPsiResult> {
  const headless = process.env.GMAPS_HEADFUL !== '1';
  const zoom = options.zoom ?? 14;
  const hl = options.hl ?? 'en';
  const gl = options.gl ?? 'us';
  const browser = await launchBrowser({ headless });
  let passiveAssistUrl = '';

  try {
    const sessionId = await attachPage(browser.connection);
    const page = { connection: browser.connection, sessionId };
    await enablePageSession(page);

    browser.connection.on((event) => {
      if (event.sessionId !== sessionId || event.method !== 'Network.requestWillBeSent') return;
      const url = (event.params.request as { url: string }).url;
      if (!url.includes('/maps/preview/passiveassist')) return;
      if (url.includes('!1i50!') || url.includes('!1i20!')) {
        passiveAssistUrl = url;
      }
    });

    const harness = new MapsHarness(page);
    await harness.navigate(
      `https://www.google.com/maps/@${options.lat},${options.lng},${zoom}z?hl=${hl}&gl=${gl}`,
      { settleMs: 8000 },
    );
    await sleep(3000);

    const psi = passiveAssistUrl ? extractPsiFromUrl(passiveAssistUrl) : null;
    if (!psi) {
      throw new Error('passiveassist request not observed during headless viewport load');
    }

    return {
      psi,
      passiveAssistUrl: options.captureUrl ? passiveAssistUrl : undefined,
    };
  } finally {
    await browser.close();
  }
}
