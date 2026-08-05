import { HttpClient } from '../client/http-client.js';
import { extractPassiveAssistChips } from '../parsers/passiveassist.js';
import { buildPassiveAssistUrl } from '../rpc/passiveassist-pb.js';
import { GMapsError, type GMapsConfig } from '../types/common.js';
import type { PassiveAssistOptions, PassiveAssistResult } from '../types/passiveassist.js';
import type { PbNode } from '../types/protobuf.js';

export class PassiveAssistService {
  private http: HttpClient;
  private hl: string;
  private gl: string;

  constructor(http: HttpClient, config: GMapsConfig) {
    this.http = http;
    this.hl = config.hl ?? 'en';
    this.gl = config.gl ?? 'us';
  }

  /**
   * Viewport POI chips for the map camera (weather, events, neighbourhood labels).
   *
   * Needs an in-page viewport psi: bootstrap kEI / fetchSessionPsi tokens return
   * the ~212 B cache-metadata stub, and only a token from a live viewport
   * passiveassist request yields chips. Such a token is portable — it replays over
   * plain Node fetch and stays valid for at least a few minutes — but minting one
   * requires a browser, so pass `psi` yourself or supply a `psiProvider`. This
   * service will not start a browser on your behalf.
   */
  async getViewportChips(options: PassiveAssistOptions): Promise<PassiveAssistResult> {
    const hl = options.hl ?? this.hl;
    const gl = options.gl ?? this.gl;
    let psi = options.psi;
    let url: string | undefined;

    if (!psi && options.psiProvider) {
      const minted = await options.psiProvider({
        lat: options.lat,
        lng: options.lng,
        zoom: options.zoom,
        hl,
        gl,
      });
      if (typeof minted === 'string') {
        psi = minted;
      } else {
        psi = minted.psi;
        url = minted.passiveAssistUrl;
      }
    }

    if (!psi) {
      throw new GMapsError(
        'passiveassist needs an in-page viewport psi: pass `psi`, or a `psiProvider` ' +
          '(see mintViewportPsi in scripts/lib/mint-viewport-psi.ts, which uses a headless browser). ' +
          'Bootstrap tokens only return the cache-metadata stub.',
      );
    }

    if (!url) {
      url = buildPassiveAssistUrl({
        lat: options.lat,
        lng: options.lng,
        zoom: options.zoom,
        psi,
        width: options.width,
        height: options.height,
        chipLimit: options.chipLimit,
        hl,
        gl,
      });
    }

    const data = await this.http.get<PbNode>(url, {
      referer: 'https://www.google.com/maps/',
      includeOrigin: true,
      allowShortBody: true,
    });

    return extractPassiveAssistChips(data);
  }
}
