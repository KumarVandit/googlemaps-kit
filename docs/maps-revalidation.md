# Existing Maps capabilities

The Maps implementation predates the additional Google consumer clients.
This pass reused its source, wire builders, captured fixtures and explicit
surface-status catalog rather than treating every registered RPC as verified.
`src/known-surfaces.ts` and `src/platform/catalog.ts` retain the per-surface
working, partial, authentication and unsupported boundaries.

Representative anonymous live checks on 2026-10-29:

| Capability | Observed result |
| --- | --- |
| Reviews | Five-review page plus rating total/aggregate; 20 deduplicated reviews over two further pages |
| Forward geocoding | HSR Layout resolved to coordinates and its Bengaluru address |
| Reverse geocoding | Existing HSR fixture coordinates resolved to a Bengaluru address |
| Driving directions | HSR→Koramangala returned a 14-minute, 4.5km route with one leg and turn instructions |
| Viewport weather | Populated HSR response returned `28°` and `Sunny`, following an initial metadata stub |

These values describe captured checks, not fixed expected travel times or
weather. The existing core offline suite covers place/search parsers, reviews,
directions, tiles, photo/panorama formats and auth boundaries. This pass also
fixed authenticated review fallback cursor propagation and corrected two
supported environment-API request contracts; see [Reviews](reviews-research.md)
and [environment access](environment-research.md).

The consumer SDK is not full parity with every Maps Platform SKU. In particular,
keyed enterprise fields, authenticated Ask Maps/history, private lists,
session-dependent overlays, and endpoints marked unverified retain their
existing limits. Public Places' five-review cap and the consumer review page
protocol are separate contracts. Official API prices and credentials remain
documented in the [service inventory](google-services-research.md).
