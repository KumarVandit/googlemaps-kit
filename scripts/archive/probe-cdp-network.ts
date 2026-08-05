/**
 * Does Chrome have network access in this environment?
 *
 * An earlier session concluded CDP was unusable because every Page.navigate timed out,
 * and all reverse engineering was done with Node fetch as a result. That conclusion was
 * wrong — run this before assuming the browser path is unavailable.
 */
import { launchBrowser } from './lib/cdp.js';

const TARGETS = ['https://example.com/', 'https://www.google.com/', 'https://www.google.com/maps'];

async function main(): Promise<void> {
  const headless = process.env.GMAPS_HEADFUL !== '1';
  console.log(`launching chrome (headless=${headless})...`);
  const browser = await launchBrowser({ headless, port: 9334 });

  try {
    const { targetId } = (await browser.connection.send('Target.createTarget', { url: 'about:blank' })) as {
      targetId: string;
    };
    const { sessionId } = (await browser.connection.send('Target.attachToTarget', {
      targetId,
      flatten: true,
    })) as { sessionId: string };

    await browser.connection.send('Page.enable', {}, sessionId);
    await browser.connection.send('Network.enable', {}, sessionId);

    const failures: string[] = [];
    browser.connection.on((event) => {
      if (event.method === 'Network.loadingFailed') {
        failures.push(String(event.params.errorText ?? 'unknown'));
      }
    });

    let failed = 0;
    for (const url of TARGETS) {
      const started = Date.now();
      try {
        await browser.connection.send('Page.navigate', { url }, sessionId);
        await new Promise((resolve) => setTimeout(resolve, 2500));
        const result = (await browser.connection.send(
          'Runtime.evaluate',
          { expression: 'document.title + "|" + document.documentElement.outerHTML.length', returnByValue: true },
          sessionId,
        )) as { result?: { value?: string } };
        console.log(`OK   ${url} -> ${result.result?.value ?? '?'} (${Date.now() - started}ms)`);
      } catch (error) {
        failed++;
        console.log(`FAIL ${url} -> ${(error as Error).message} (${Date.now() - started}ms)`);
      }
    }

    console.log(
      failures.length > 0
        ? `\nnetwork failures: ${[...new Set(failures)].join(', ')}`
        : '\nno network failures reported',
    );
    if (failed > 0) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
