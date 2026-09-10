import {
  PLATFORM_CATALOG,
  type PlatformKitStatus,
  type PlatformProduct,
} from './catalog.js';

export interface PlatformCoverageSummary {
  total: number;
  byStatus: Record<PlatformKitStatus, number>;
  byAuth: Record<string, number>;
  keyless: PlatformProduct[];
  apiKeyOnly: PlatformProduct[];
  notApplicable: PlatformProduct[];
}

/** Summarize platform product coverage. */
export function summarizePlatformCoverage(): PlatformCoverageSummary {
  const byStatus: Record<PlatformKitStatus, number> = {
    working: 0,
    partial: 0,
    missing: 0,
    'api-key-required': 0,
    'not-applicable': 0,
  };
  const byAuth: Record<string, number> = {};

  for (const product of PLATFORM_CATALOG) {
    byStatus[product.kitStatus]++;
    byAuth[product.auth] = (byAuth[product.auth] ?? 0) + 1;
  }

  return {
    total: PLATFORM_CATALOG.length,
    byStatus,
    byAuth,
    keyless: PLATFORM_CATALOG.filter(
      (p) => p.auth === 'none' || p.auth === 'optional-key' || p.auth === 'auth-cookies',
    ),
    apiKeyOnly: PLATFORM_CATALOG.filter(
      (p) => p.kitStatus === 'api-key-required' || p.auth === 'api-key-required',
    ),
    notApplicable: PLATFORM_CATALOG.filter((p) => p.kitStatus === 'not-applicable'),
  };
}
