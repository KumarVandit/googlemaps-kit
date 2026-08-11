import { describe, expect, it } from 'vitest';
import type { HttpClient } from '../../../src/client/http-client.js';
import { extractPassiveAssistChips } from '../../../src/parsers/viewport.js';
import { buildPassiveAssistPb, buildPassiveAssistUrl } from '../../../src/rpc/feature-pb.js';
import { PassiveAssistService } from '../../../src/services/viewport.js';
import type { PbNode } from '../../../src/types/protobuf.js';
import { loadJsonFixture } from '../../helpers/fixtures.js';

describe('passiveassist pb builders', () => {
  it('builds browser-capture pb shape with session psi', () => {
    const pb = buildPassiveAssistPb({
      lat: 12.9121263,
      lng: 77.6499775,
      zoom: 18,
      psi: 'aRtsaqi0BOygseMPr4_T4Qw',
    });
    expect(pb).toContain('!1m10!2m9!');
    expect(pb).toContain('!2m0!3m2!1i1440!2i900!');
    expect(pb).toContain('!3m3!1saRtsaqi0BOygseMPr4_T4Qw!7e81!15i312935');
    expect(pb).toContain('!35m6!1i50!');
    expect(pb).not.toContain('!6m2!1f0!2f0');
  });

  it('builds passiveassist URL with hl/gl', () => {
    const url = buildPassiveAssistUrl({
      lat: 51.5074,
      lng: -0.1278,
      psi: 'oTVsap-4NOGRnesP-JKFmAw',
      hl: 'en',
      gl: 'uk',
    });
    expect(url).toContain('/maps/preview/passiveassist');
    expect(url).toContain('hl=en');
    expect(url).toContain('gl=uk');
  });
});

describe('passiveassist service psi contract', () => {
  const fixture = loadJsonFixture('passiveassist-hsr-chips.json');
  const http = {
    get: async () => fixture,
  } as unknown as HttpClient;

  it('refuses to guess a psi, since bootstrap tokens only yield the stub', async () => {
    const service = new PassiveAssistService(http, {});
    await expect(service.getViewportChips({ lat: 51.5074, lng: -0.1278 })).rejects.toThrow(
      /in-page viewport psi/,
    );
  });

  it('accepts a psiProvider and uses the verbatim captured URL when given one', async () => {
    let requestedUrl = '';
    const capturingHttp = {
      get: async (url: string) => {
        requestedUrl = url;
        return fixture;
      },
    } as unknown as HttpClient;
    const service = new PassiveAssistService(capturingHttp, {});

    const result = await service.getViewportChips({
      lat: 51.5074,
      lng: -0.1278,
      psiProvider: async () => ({
        psi: 'oTVsap-4NOGRnesP-JKFmAw',
        passiveAssistUrl: 'https://www.google.com/maps/preview/passiveassist?captured=1',
      }),
    });

    expect(requestedUrl).toBe('https://www.google.com/maps/preview/passiveassist?captured=1');
    expect(result.chips[0]?.name).toBe('Parangi Palaya');
  });

  it('builds a request URL around a psi returned as a bare string', async () => {
    let requestedUrl = '';
    const capturingHttp = {
      get: async (url: string) => {
        requestedUrl = url;
        return fixture;
      },
    } as unknown as HttpClient;
    const service = new PassiveAssistService(capturingHttp, {});

    await service.getViewportChips({
      lat: 51.5074,
      lng: -0.1278,
      psiProvider: async () => 'oTVsap-4NOGRnesP-JKFmAw',
    });

    expect(requestedUrl).toContain('/maps/preview/passiveassist');
    expect(requestedUrl).toContain('oTVsap-4NOGRnesP-JKFmAw');
  });
});

describe('passiveassist parser', () => {
  it('extracts neighbourhood chip and weather from HSR fixture', () => {
    const raw = loadJsonFixture('passiveassist-hsr-chips.json');
    const result = extractPassiveAssistChips(raw as PbNode);

    expect(result.isStub).toBe(false);
    expect(result.chips).toHaveLength(1);
    expect(result.chips[0]?.name).toBe('Parangi Palaya');
    expect(result.chips[0]?.cacheKey).toBe('3bae149cc3');
    expect(result.chips[0]?.weatherTemp).toBe('77°');
    expect(result.chips[0]?.weatherLabel).toBe('Cloudy');
    expect(result.chips[0]?.weatherIconUrl).toContain('onebox/weather');
  });

  it('detects cache-metadata stub with no chips', () => {
    const raw = loadJsonFixture('passiveassist-stub.json');
    const result = extractPassiveAssistChips(raw as PbNode);

    expect(result.isStub).toBe(true);
    expect(result.chips).toHaveLength(0);
  });
});
