export interface PassiveAssistChip {
  name: string;
  cacheKey?: string;
  token?: string;
  weatherIconUrl?: string;
  weatherLabel?: string;
  weatherTemp?: string;
}

/** What a psi provider returns; `url` lets a provider hand back the verbatim captured request. */
export interface MintedViewportPsi {
  psi: string;
  passiveAssistUrl?: string;
}

export interface PassiveAssistPsiContext {
  lat: number;
  lng: number;
  zoom?: number;
  hl: string;
  gl: string;
}

export interface PassiveAssistOptions {
  lat: number;
  lng: number;
  /** Viewport zoom used to derive camera altitude (default 14). */
  zoom?: number;
  /**
   * In-page viewport psi. REQUIRED unless `psiProvider` is supplied: bootstrap
   * kEI / fetchSessionPsi tokens only ever return the cache-metadata stub.
   */
  psi?: string;
  /**
   * Supplies an in-page psi on demand. Only a live Maps viewport session produces
   * a usable token, so obtaining one needs a browser — this SDK deliberately will
   * not launch one for you. Use `mintViewportPsi` from `scripts/lib/mint-viewport-psi.ts`
   * to build a provider when a browser is acceptable in your environment.
   */
  psiProvider?: (context: PassiveAssistPsiContext) => Promise<string | MintedViewportPsi>;
  width?: number;
  height?: number;
  /** Chip density hint (default 50). Browser also requests a 20-chip variant. */
  chipLimit?: number;
  hl?: string;
  gl?: string;
}

export interface PassiveAssistResult {
  chips: PassiveAssistChip[];
  /** True when the response is the ~212 B cache-metadata stub with no POI rows. */
  isStub: boolean;
}
