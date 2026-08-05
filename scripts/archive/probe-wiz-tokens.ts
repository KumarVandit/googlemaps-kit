/**
 * Control experiment: is an empty SNlM0e specific to Maps, or is it what every
 * Google WIZ app serves to a signed-out client?
 *
 * SNlM0e is the XSRF token batchexecute requires as its `at` form field. If other
 * signed-out WIZ apps DO emit one, then Maps is deliberately withholding it and
 * the blocker is Maps-specific. If none of them do, the blocker is being signed out.
 *
 * Usage: npm run probe:wiz-tokens
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { buildBrowserHeaders } from '../src/auth/session.js';
import { extractWizGlobalString } from '../src/rpc/app-options.js';

const TARGETS = [
  { name: 'maps', url: 'https://www.google.com/maps' },
  { name: 'travel-flights', url: 'https://www.google.com/travel/flights' },
  { name: 'travel-explore', url: 'https://www.google.com/travel/explore' },
  { name: 'finance', url: 'https://www.google.com/finance' },
  { name: 'shopping', url: 'https://www.google.com/shopping' },
  { name: 'trends', url: 'https://trends.google.com/trends/' },
];

const KEYS = ['SNlM0e', 'FdrFJe', 'cfb2h', 'eptZe', 'Im6cmf'] as const;

interface Probe {
  name: string;
  url: string;
  status: number;
  htmlLength: number;
  hasWizGlobalData: boolean;
  tokens: Partial<Record<(typeof KEYS)[number], string>>;
  snlM0eNonEmpty: boolean;
}

async function probe(target: { name: string; url: string }): Promise<Probe> {
  const response = await fetch(target.url, {
    headers: buildBrowserHeaders({ mode: 'document' }),
    redirect: 'follow',
  });
  const html = await response.text();

  const tokens: Partial<Record<(typeof KEYS)[number], string>> = {};
  for (const key of KEYS) {
    const value = extractWizGlobalString(html, key);
    if (value !== undefined) tokens[key] = value;
  }

  return {
    name: target.name,
    url: target.url,
    status: response.status,
    htmlLength: html.length,
    hasWizGlobalData: html.includes('WIZ_global_data'),
    tokens,
    snlM0eNonEmpty: Boolean(tokens.SNlM0e && tokens.SNlM0e.length > 0),
  };
}

async function main(): Promise<void> {
  mkdirSync('.cache/probes', { recursive: true });
  const results: Probe[] = [];

  console.log('=== Signed-out WIZ token survey ===\n');
  for (const target of TARGETS) {
    try {
      const result = await probe(target);
      results.push(result);
      const snl = result.tokens.SNlM0e;
      console.log(
        `${result.name.padEnd(16)} HTTP ${result.status}` +
          ` wiz=${result.hasWizGlobalData ? 'yes' : 'no '}` +
          ` SNlM0e=${snl === undefined ? 'absent' : snl.length === 0 ? 'EMPTY' : `${snl.length} chars`}` +
          ` batchexecutePath=${result.tokens.eptZe ?? '-'}`,
      );
    } catch (error) {
      console.log(`${target.name.padEnd(16)} ERROR ${(error as Error).message.slice(0, 60)}`);
    }
  }

  const withWiz = results.filter((r) => r.hasWizGlobalData);
  const withToken = withWiz.filter((r) => r.snlM0eNonEmpty);

  console.log('\n=== Conclusion ===');
  console.log(`WIZ apps probed:                 ${withWiz.length}`);
  console.log(`...serving a non-empty SNlM0e:   ${withToken.length}`);
  if (withWiz.length > 0 && withToken.length === 0) {
    console.log('→ Empty SNlM0e is generic to signed-out Google WIZ apps, not Maps-specific.');
    console.log('→ batchexecute XSRF cannot be satisfied without an authenticated session.');
  } else if (withToken.length > 0) {
    console.log(`→ These signed-out apps DO emit a token: ${withToken.map((r) => r.name).join(', ')}`);
    console.log('→ So Maps specifically withholds it; the blocker is Maps-side, not auth-generic.');
  }

  writeFileSync('.cache/probes/wiz-token-survey.json', JSON.stringify(results, null, 2));
  console.log('\nWrote .cache/probes/wiz-token-survey.json');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
