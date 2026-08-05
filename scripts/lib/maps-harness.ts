/**
 * Shared CDP helpers for driving Google Maps UI and waiting for app readiness.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DESKTOP_CHROME_UA, type CdpConnection } from './cdp.js';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface PageSession {
  connection: CdpConnection;
  sessionId: string;
}

export interface FlowResult {
  flow: string;
  ok: boolean;
  error?: string;
  screenshot?: string;
  domOutline?: string;
  interactionVerified?: boolean;
  requestCount?: number;
  newRpcids?: string[];
  newEndpoints?: string[];
  /** Optional before/after state for filter or UI evidence. */
  evidence?: Record<string, unknown>;
}

/** Enable domains required for navigation, network capture, and UI interaction. */
export async function enablePageSession(page: PageSession): Promise<void> {
  const { connection, sessionId } = page;
  await connection.send('Page.enable', {}, sessionId);
  await connection.send('Network.enable', {}, sessionId);
  await connection.send('Runtime.enable', {}, sessionId);
  await connection.send('DOM.enable', {}, sessionId);
  await configureMapsPage(page);
}

/** UA override, viewport, locale — headless Maps needs this to render the real UI. */
export async function configureMapsPage(page: PageSession): Promise<void> {
  const { connection, sessionId } = page;
  await connection.send(
    'Network.setUserAgentOverride',
    {
      userAgent: DESKTOP_CHROME_UA,
      acceptLanguage: 'en-US,en;q=0.9',
      platform: 'MacIntel',
    },
    sessionId,
  );
  await connection.send(
    'Emulation.setDeviceMetricsOverride',
    {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    },
    sessionId,
  );
  await connection.send('Emulation.setLocaleOverride', { locale: 'en-US' }, sessionId);
  await setConsentCookies(connection, sessionId);
}

export async function attachPage(connection: CdpConnection, url = 'about:blank'): Promise<string> {
  const created = await connection.send('Target.createTarget', { url });
  const attached = await connection.send('Target.attachToTarget', {
    targetId: created.targetId,
    flatten: true,
  });
  return attached.sessionId as string;
}

/** Pre-set EU/consent cookies so Maps loads the real UI instead of consent.google.com. */
export async function setConsentCookies(connection: CdpConnection, sessionId: string): Promise<void> {
  const cookies = [
    {
      name: 'SOCS',
      value: 'CAISNQgAEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjQwNDI5LjA5X3AwGgJlbiACGgYIgK-EBg',
      domain: '.google.com',
      path: '/',
      secure: true,
    },
    {
      name: 'CONSENT',
      value: 'YES+cb.20210328-17-p0.en+FX+667',
      domain: '.google.com',
      path: '/',
      secure: true,
    },
  ];
  await connection.send('Network.setCookies', { cookies }, sessionId);
}

export async function waitForLoad(page: PageSession, timeoutMs = 30_000): Promise<void> {
  const { connection, sessionId } = page;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      off();
      reject(new Error('Page.loadEventFired timeout'));
    }, timeoutMs);
    const off = connection.on((event) => {
      if (event.sessionId === sessionId && event.method === 'Page.loadEventFired') {
        clearTimeout(timer);
        off();
        resolve();
      }
    });
  });
}

export async function waitForSelector(
  page: PageSession,
  selector: string,
  timeoutMs = 45_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = await evaluate<boolean>(
      page,
      `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })()`,
    );
    if (found) return true;
    await sleep(400);
  }
  return false;
}

export async function evaluate<T = unknown>(page: PageSession, expression: string): Promise<T | undefined> {
  try {
    const result = await page.connection.send(
      'Runtime.evaluate',
      { expression, returnByValue: true, awaitPromise: true },
      page.sessionId,
    );
    return (result.result as { value?: T } | undefined)?.value;
  } catch {
    return undefined;
  }
}

/** Click consent / cookie interstitials when present. */
export async function dismissConsent(page: PageSession): Promise<boolean> {
  const clicked = await evaluate<string | null>(
    page,
    `(() => {
      const patterns = [
        /accept all/i,
        /i agree/i,
        /agree/i,
        /accept/i,
        /reject all/i,
      ];
      const candidates = [
        ...document.querySelectorAll('button, [role="button"], form button, input[type="submit"]'),
      ];
      for (const el of candidates) {
        const text = (el.textContent || el.getAttribute('aria-label') || '').trim();
        if (!text) continue;
        for (const re of patterns) {
          if (re.test(text)) {
            el.click();
            return text.slice(0, 60);
          }
        }
      }
      const form = document.querySelector('form[action*="consent"]');
      if (form) {
        const submit = form.querySelector('button, input[type="submit"]');
        if (submit) { submit.click(); return 'consent-form'; }
      }
      return null;
    })()`,
  );
  if (clicked) {
    await sleep(2000);
    return true;
  }
  return false;
}

export async function readWizTokens(page: PageSession): Promise<Record<string, string>> {
  const raw = await evaluate<string>(
    page,
    `(() => {
      const wiz = window.WIZ_global_data || {};
      const keys = ['SNlM0e', 'FdrFJe', 'cfb2h', 'S06Grb', 'eptZe', 'Im6cmf'];
      const picked = {};
      for (const key of keys) picked[key] = wiz[key] ?? '';
      return JSON.stringify(picked);
    })()`,
  );
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

export class MapsHarness {
  readonly page: PageSession;
  flow = 'init';
  private screenshotIndex = 0;

  constructor(page: PageSession) {
    this.page = page;
  }

  /** Append hl/gl when missing — gl=us avoids EU consent walls. */
  withLocale(url: string, hl = 'en', gl = 'us'): string {
    if (/[?&]hl=/.test(url)) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}hl=${hl}&gl=${gl}`;
  }

  async navigate(url: string, options: { settleMs?: number; waitForMaps?: boolean } = {}): Promise<void> {
    const { settleMs = 4000, waitForMaps = true } = options;
    const target = this.withLocale(url);
    console.log(`  → ${target.slice(0, 110)}`);
    // Headless Chrome has no window to raise; never let it block a flow.
    try {
      await this.page.connection.send('Page.bringToFront', {}, this.page.sessionId, 2000);
    } catch {
      /* headless or detached target */
    }
    await this.page.connection.send('Page.navigate', { url: target }, this.page.sessionId);
    try {
      await waitForLoad(this.page, 45_000);
    } catch {
      // SPA navigations may not fire load; continue after settle.
    }
    await sleep(settleMs);

    const href = await evaluate<string>(this.page, 'location.href');
    if (href?.includes('consent.google.com')) {
      console.log('    consent interstitial detected');
      await dismissConsent(this.page);
      await sleep(2500);
    }

    if (waitForMaps) {
      const ready = await this.waitForMapsApp(45_000);
      if (!ready) {
        console.log('    warn: Maps app shell not detected');
      }
    }
  }

  async waitForMapsApp(timeoutMs = 45_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const ready = await evaluate<boolean>(
        this.page,
        `(() => {
          const canvas = document.querySelector('.widget-scene-canvas, canvas#scene, #scene');
          const pane = document.querySelector('[role="main"], .m6QErb, h1');
          return !!(canvas || pane);
        })()`,
      );
      if (ready) return true;
      await sleep(500);
    }
    return false;
  }

  async waitForPlacePanel(timeoutMs = 30_000): Promise<boolean> {
    return waitForSelector(
      this.page,
      'h1.DUwDvf, h1.fontHeadlineLarge, [role="main"] h1, .x3AX1-LfhbPe',
      timeoutMs,
    );
  }

  async screenshot(label: string): Promise<string | undefined> {
    try {
      const dir = '.cache/probes/flow-screenshots';
      mkdirSync(dir, { recursive: true });
      const result = await this.page.connection.send(
        'Page.captureScreenshot',
        { format: 'png', captureBeyondViewport: false },
        this.page.sessionId,
      );
      const data = result.data as string | undefined;
      if (!data) return undefined;
      const slug = `${String(this.screenshotIndex++).padStart(2, '0')}-${this.flow}-${label}.png`;
      const path = join(dir, slug);
      writeFileSync(path, Buffer.from(data, 'base64'));
      console.log(`    screenshot: ${path}`);
      return path;
    } catch {
      return undefined;
    }
  }

  async saveDomOutline(label: string): Promise<string | undefined> {
    const outline = await evaluate<string>(
      this.page,
      `(() => {
        const parts = [];
        const title = document.title;
        parts.push('title=' + title);
        const h1 = document.querySelector('h1');
        if (h1) parts.push('h1=' + (h1.textContent || '').trim().slice(0, 80));
        const tabs = [...document.querySelectorAll('[role="tab"]')].map(t =>
          (t.getAttribute('aria-label') || t.textContent || '').trim().slice(0, 40)
        ).filter(Boolean);
        if (tabs.length) parts.push('tabs=' + tabs.join('|'));
        const selected = document.querySelector('[role="tab"][aria-selected="true"]');
        if (selected) parts.push('activeTab=' + (selected.getAttribute('aria-label') || selected.textContent || '').trim().slice(0, 40));
        const chipSelectors = [
          '.CPtD3c button', '.qR292b button', 'button[aria-pressed]',
          'button[jsaction*="filter"]', 'button[jsaction*="pane.filters"]',
          'button[jsaction*="pane.search"]', '[role="button"][jsaction*="filter"]',
          '.m6QErb button', '[data-value]', 'button[data-tooltip]',
        ];
        const chipSet = new Set();
        for (const sel of chipSelectors) {
          for (const b of document.querySelectorAll(sel)) {
            const label = (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 40);
            if (label && label.length < 80) chipSet.add(label);
          }
        }
        if (chipSet.size) parts.push('chips=' + [...chipSet].slice(0, 20).join('|'));
        const buttons = [...document.querySelectorAll('button, [role="button"]')]
          .filter(b => {
            const r = b.getBoundingClientRect();
            return r.width > 2 && r.height > 2;
          })
          .map(b => {
            const label = (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 35);
            const js = (b.getAttribute('jsaction') || '').slice(0, 40);
            return label + (js ? '{' + js + '}' : '');
          })
          .filter(s => s.length > 1)
          .slice(0, 30);
        if (buttons.length) parts.push('buttons=' + buttons.join('|'));
        const tabNodes = [...document.querySelectorAll('[role="tab"]')]
          .map(t => {
            const label = (t.getAttribute('aria-label') || t.textContent || '').trim().slice(0, 30);
            const sel = t.getAttribute('aria-selected');
            const js = (t.getAttribute('jsaction') || '').slice(0, 35);
            return label + (sel === 'true' ? '*' : '') + (js ? '{' + js + '}' : '');
          })
          .slice(0, 20);
        if (tabNodes.length) parts.push('tabDetail=' + tabNodes.join('|'));
        const scrollables = [...document.querySelectorAll('.m6QErb, [role="main"], [role="feed"], .section-scrollbox')]
          .filter(el => el.scrollHeight > el.clientHeight + 20)
          .map(el => {
            const cls = (el.className || '').toString().split(/\\s+/).slice(0, 2).join('.');
            return cls + ':' + el.scrollHeight + '/' + el.clientHeight;
          })
          .slice(0, 8);
        if (scrollables.length) parts.push('scrollables=' + scrollables.join('|'));
        const imgs = document.querySelectorAll('img[src*="googleusercontent"], img[src*="ggpht"]').length;
        parts.push('photoImgs=' + imgs);
        const reviews = document.querySelectorAll('[data-review-id], .jftiEf, [jsaction*="review"]').length;
        parts.push('reviewNodes=' + reviews);
        return parts.join('\\n');
      })()`,
    );
    if (!outline) return undefined;
    const dir = '.cache/probes/flow-screenshots';
    mkdirSync(dir, { recursive: true });
    const path = join(dir, `${this.flow}-${label}.dom.txt`);
    writeFileSync(path, outline);
    console.log(`    dom outline: ${path}`);
    return path;
  }

  async domFingerprint(): Promise<string> {
    return (
      (await evaluate<string>(
        this.page,
        `(() => {
          const h1 = document.querySelector('h1');
          const tab = document.querySelector('[role="tab"][aria-selected="true"]');
          const imgs = document.querySelectorAll('img[src*="googleusercontent"]').length;
          const feed = document.querySelectorAll('[role="feed"] > div').length;
          return JSON.stringify({
            h1: h1 ? (h1.textContent || '').trim().slice(0, 60) : '',
            tab: tab ? (tab.getAttribute('aria-label') || tab.textContent || '').trim() : '',
            imgs,
            feed,
            path: location.pathname + location.search.slice(0, 40),
          });
        })()`,
      )) ?? '{}'
    );
  }

  async click(selectors: string[], ariaPattern?: string, options: { ariaFirst?: boolean } = {}): Promise<string | null> {
    const ariaFirst = options.ariaFirst ?? Boolean(ariaPattern);
    const expression = `(() => {
      const tryAria = ${ariaPattern ? `() => {
        const re = new RegExp(${JSON.stringify(ariaPattern)}, 'i');
        const nodes = document.querySelectorAll('[aria-label], [role="tab"], button, a, [role="button"], span, div[role="menuitem"]');
        for (const el of nodes) {
          const label = (el.getAttribute('aria-label') || el.textContent || '').trim();
          if (!label || label.length > 120) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width < 2 || rect.height < 2) continue;
          if (re.test(label)) {
            el.scrollIntoView({ block: 'center', inline: 'nearest' });
            el.click();
            return 'aria:' + label.slice(0, 50);
          }
        }
        return null;
      }` : '() => null'};
      const trySelectors = () => {
        const selectors = ${JSON.stringify(selectors)};
        for (const selector of selectors) {
          const nodes = document.querySelectorAll(selector);
          for (const el of nodes) {
            const rect = el.getBoundingClientRect();
            if (rect.width < 2 || rect.height < 2) continue;
            el.scrollIntoView({ block: 'center', inline: 'nearest' });
            el.click();
            return selector;
          }
        }
        return null;
      };
      if (${ariaFirst}) {
        return tryAria() || trySelectors();
      }
      return trySelectors() || tryAria();
    })()`;
    const hit = await evaluate<string | null>(this.page, expression);
    console.log(`    click ${hit ?? 'MISS'}`);
    return hit ?? null;
  }

  async clickJsAction(actionPattern: string): Promise<string | null> {
    const hit = await evaluate<string | null>(
      this.page,
      `(() => {
        const re = new RegExp(${JSON.stringify(actionPattern)});
        for (const el of document.querySelectorAll('[jsaction]')) {
          const action = el.getAttribute('jsaction') || '';
          if (!re.test(action)) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width < 2 || rect.height < 2) continue;
          el.scrollIntoView({ block: 'center', inline: 'nearest' });
          el.click();
          return 'jsaction:' + action.slice(0, 60);
        }
        return null;
      })()`,
    );
    console.log(`    jsaction ${hit ?? 'MISS'}`);
    return hit ?? null;
  }

  async clickTab(labelPattern: string): Promise<string | null> {
    return this.click(['button[role="tab"]', '[role="tab"]', 'button[data-tab-index]'], labelPattern, {
      ariaFirst: true,
    });
  }

  async clickChip(labelPattern: string): Promise<string | null> {
    return this.click(
      [
        '.CPtD3c button',
        '.qR292b button',
        '[jsaction*="pane.filters"]',
        '[jsaction*="pane.search"]',
        'button[aria-pressed]',
        'button[jsaction*="filter"]',
        'button[jsaction*="chip"]',
        '[role="button"][jsaction]',
        '.m6QErb button[data-value]',
        'button[data-tooltip]',
      ],
      labelPattern,
      { ariaFirst: true },
    );
  }

  /** Current URL and decoded `data=` pb fragment when present. */
  async getLocationState(): Promise<{ href: string; dataParam: string; pathname: string }> {
    const raw =
      (await evaluate<string>(
        this.page,
        `JSON.stringify({
          href: location.href,
          dataParam: (() => {
            const m = location.href.match(/[?&]data=([^&]+)/);
            return m ? decodeURIComponent(m[1]) : '';
          })(),
          pathname: location.pathname,
        })`,
      )) ?? '{}';
    return JSON.parse(raw) as { href: string; dataParam: string; pathname: string };
  }

  /** Place names visible in the search results feed (first N). */
  async getSearchResultNames(limit = 12): Promise<string[]> {
    const raw =
      (await evaluate<string>(
        this.page,
        `JSON.stringify((() => {
          const names = [];
          const feed = document.querySelector('[role="feed"]');
          if (feed) {
            for (const row of feed.querySelectorAll('[role="article"], .Nv2PK, a.hfpxzc')) {
              const h = row.querySelector('[aria-label], .fontHeadlineSmall, .qBF1Pd');
              const label = h ? (h.getAttribute('aria-label') || h.textContent || '').trim() : '';
              if (label && label.length > 2) names.push(label.slice(0, 80));
              if (names.length >= ${limit}) break;
            }
          }
          if (names.length === 0) {
            for (const h of document.querySelectorAll('.fontHeadlineSmall, .qBF1Pd')) {
              const t = (h.textContent || '').trim();
              if (t.length > 2) names.push(t.slice(0, 80));
              if (names.length >= ${limit}) break;
            }
          }
          return names;
        })())`,
      )) ?? '[]';
    return JSON.parse(raw) as string[];
  }

  async clickApplyFilter(): Promise<string | null> {
    return (
      (await this.clickJsAction('\\.done')) ??
      (await this.click(['button[jsaction*="done"]', 'button[jsaction*="apply"]'], 'apply|done', {
        ariaFirst: true,
      }))
    );
  }

  /**
   * Open a search filter chip, pick a submenu option, and click Apply.
   * Returns click trace plus whether Apply was pressed.
   */
  async applySearchFilter(
    chipPattern: string,
    optionPattern: string,
  ): Promise<{ chip: string | null; option: string | null; applied: string | null }> {
    const chip = await this.clickChip(chipPattern);
    await sleep(1200);
    const option = await this.click(
      [
        '[role="menuitem"]',
        '[role="menuitemcheckbox"]',
        '[role="checkbox"]',
        'label',
        'li',
        'span',
      ],
      optionPattern,
      { ariaFirst: true },
    );
    await sleep(800);
    const applied = await this.clickApplyFilter();
    await sleep(1500);
    return { chip, option, applied };
  }

  /** Open the Reviews tab on a place page (not just inline review snippets). */
  async openReviewsTab(): Promise<string | null> {
    const hit = await this.clickTab('^Reviews\\b|reviews for');
    if (hit) return hit;
    return this.click(['button[role="tab"]', '[role="tab"]'], 'reviews', { ariaFirst: true });
  }

  /** Click a photo-gallery category tab (role=tab in the photos pane). */
  async clickPhotoCategory(labelPattern: string): Promise<string | null> {
    const hit = await this.clickTab(labelPattern);
    if (hit) return hit;
    return this.click(
      ['button[jsaction*="pane.photo"]', '[jsaction*="photoCategory"]'],
      labelPattern,
      { ariaFirst: true },
    );
  }

  /** Open place photo gallery — hero image uses pane.photo.open, not a top tab. */
  async openPlacePhotos(): Promise<string | null> {
    const hit =
      (await this.clickJsAction('pane\\.photo\\.open')) ??
      (await this.click(['button.xUc6Hf', '.FabbNe button', 'button[data-photo-index]'], 'photo|gallery|see all'));
    return hit;
  }

  /** Open reviews pane — prefer the Reviews tab, then inline review entry points. */
  async openPlaceReviews(): Promise<string | null> {
    const tab = await this.openReviewsTab();
    if (tab) return tab;
    const hit =
      (await this.clickJsAction('pane\\.review')) ??
      (await this.click(
        ['button[jsaction*="reviewChart"]', 'button[aria-label*="review"]', '.F7nice a', 'span[role="img"]'],
        'review|rating',
        { ariaFirst: true },
      ));
    return hit;
  }

  async scrollMainPane(steps = 4): Promise<number> {
    let total = 0;
    for (let i = 0; i < steps; i++) {
      const scrolled = await evaluate<number>(
        this.page,
        `(() => {
          const panes = document.querySelectorAll(
            '.m6QErb.DxyBCb, .m6QErb[role="main"], [role="main"] .m6QErb, .section-scrollbox, .m6QErb.XfBNaf'
          );
          let count = 0;
          for (const pane of panes) {
            if (pane.scrollHeight > pane.clientHeight + 20) {
              pane.scrollTop += Math.floor(pane.clientHeight * 0.85);
              count++;
            }
          }
          if (count === 0) {
            const feed = document.querySelector('[role="feed"]');
            if (feed && feed.scrollHeight > feed.clientHeight + 20) {
              feed.scrollTop += Math.floor(feed.clientHeight * 0.85);
              count = 1;
            }
          }
          return count;
        })()`,
      );
      total += scrolled ?? 0;
      await this.cdpWheelScroll(3);
      await sleep(1200);
    }
    console.log(`    scroll panes=${total}`);
    return total;
  }

  /** CDP mouse wheel on the largest scrollable pane — triggers lazy-load listeners DOM scroll misses. */
  async cdpWheelScroll(steps = 3): Promise<void> {
    const { connection, sessionId } = this.page;
    const rect = await evaluate<string>(
      this.page,
      `(() => {
        let best = null;
        let bestArea = 0;
        for (const el of document.querySelectorAll('.m6QErb, [role="main"], [role="feed"]')) {
          if (el.scrollHeight <= el.clientHeight + 20) continue;
          const r = el.getBoundingClientRect();
          const area = r.width * r.height;
          if (area > bestArea) { bestArea = area; best = r; }
        }
        if (!best) return '';
        return JSON.stringify({ x: best.left + best.width / 2, y: best.top + best.height / 2 });
      })()`,
    );
    if (!rect) return;
    const { x, y } = JSON.parse(rect) as { x: number; y: number };
    for (let i = 0; i < steps; i++) {
      await connection.send(
        'Input.dispatchMouseEvent',
        { type: 'mouseWheel', x, y, deltaX: 0, deltaY: 400, modifiers: 0 },
        sessionId,
        10_000,
      );
      await sleep(600);
    }
  }

  async scrollIntoView(selector: string): Promise<void> {
    await evaluate(
      this.page,
      `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (el) el.scrollIntoView({ block: 'center' });
      })()`,
    );
    await sleep(500);
  }

  /** Pan/zoom via DOM wheel on the map canvas. */
  async zoomMap(steps: number): Promise<void> {
    for (let index = 0; index < steps; index++) {
      const delta = index % 2 === 0 ? -240 : 240;
      await evaluate(
        this.page,
        `(() => {
          const canvas = document.querySelector('.widget-scene-canvas, canvas, #scene');
          const target = canvas || document.querySelector('#map') || document.body;
          const rect = target.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;
          target.dispatchEvent(new WheelEvent('wheel', {
            bubbles: true, cancelable: true, clientX: x, clientY: y, deltaY: ${delta},
          }));
        })()`,
      );
      await sleep(900);
    }
  }

  async drag(fromX: number, fromY: number, toX: number, toY: number): Promise<void> {
    await evaluate(
      this.page,
      `(() => {
        const canvas = document.querySelector('.widget-scene-canvas, canvas, #scene');
        const target = canvas || document.querySelector('#map') || document.body;
        const mk = (type, x, y) => new MouseEvent(type, {
          bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === 'mouseup' ? 0 : 1,
        });
        target.dispatchEvent(mk('mousedown', ${fromX}, ${fromY}));
        target.dispatchEvent(mk('mousemove', ${toX}, ${toY}));
        target.dispatchEvent(mk('mouseup', ${toX}, ${toY}));
      })()`,
    );
    await sleep(1500);
  }

  /** Real CDP mouse click — needed for WebGL map canvas POI hits. */
  async cdpClick(x: number, y: number): Promise<void> {
    const { connection, sessionId } = this.page;
    const params = { x, y, button: 'left' as const, clickCount: 1 };
    await connection.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...params, button: 'none' }, sessionId, 15_000);
    await connection.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...params }, sessionId, 15_000);
    await connection.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...params }, sessionId, 15_000);
    console.log(`    cdpClick (${x}, ${y})`);
  }

  /** Click several points on the map canvas to hit POI markers. */
  async clickMapPois(): Promise<number> {
    const rect = await evaluate<string>(
      this.page,
      `(() => {
        const canvas = document.querySelector('.widget-scene-canvas, canvas');
        if (!canvas) return '';
        const r = canvas.getBoundingClientRect();
        return JSON.stringify({ left: r.left, top: r.top, width: r.width, height: r.height });
      })()`,
    );
    if (!rect) return 0;
    const { left, top, width, height } = JSON.parse(rect) as {
      left: number;
      top: number;
      width: number;
      height: number;
    };
    const points: Array<[number, number]> = [
      [left + width * 0.45, top + height * 0.42],
      [left + width * 0.55, top + height * 0.38],
      [left + width * 0.5, top + height * 0.48],
      [left + width * 0.62, top + height * 0.45],
    ];
    for (const [x, y] of points) {
      await this.cdpClick(Math.round(x), Math.round(y));
      await sleep(2500);
    }
    return points.length;
  }

  async enableTransitLayer(): Promise<string | null> {
    return this.click(
      ['button[aria-label*="Transit"]', 'button[jsaction*="transit"]', '[data-value="transit"]'],
      'transit',
    );
  }
}

export interface VerifiedFlowOptions {
  minRequests?: number;
  requireInteraction?: boolean;
  /** When set, flow passes if any of these rpcids were captured (overrides DOM-change heuristic). */
  targetRpcids?: string[];
  verify?: () => Promise<boolean>;
}

export async function runVerifiedFlow(
  harness: MapsHarness,
  name: string,
  fn: () => Promise<void>,
  options: VerifiedFlowOptions,
  metrics: {
    countForFlow: (flow: string) => number;
    rpcidsForFlow: (flow: string) => string[];
    endpointsForFlow: (flow: string) => string[];
  },
): Promise<FlowResult> {
  harness.flow = name;
  console.log(`\n=== flow: ${name} ===`);
  const beforeFp = await harness.domFingerprint();
  try {
    await fn();
    await sleep(1500);
    const afterFp = await harness.domFingerprint();
    const requestCount = metrics.countForFlow(name);
    const newRpcids = metrics.rpcidsForFlow(name);
    const newEndpoints = metrics.endpointsForFlow(name);
    const minRequests = options.minRequests ?? 1;
    const requireInteraction = options.requireInteraction ?? true;
    const targetRpcids = options.targetRpcids ?? [];
    const capturedTargetRpc =
      targetRpcids.length === 0 || targetRpcids.some((id) => newRpcids.includes(id));
    const domVerified =
      options.verify != null ? await options.verify() : beforeFp !== afterFp;
    const requestVerified = requestCount >= minRequests && capturedTargetRpc;
    const interactionVerified = requestVerified || domVerified;

    console.log(
      `    verified=${interactionVerified} dom=${domVerified} requests=${requestCount} rpcids=${newRpcids.join(',') || '(none)'}`,
    );
    await harness.screenshot('done');

    if (requestCount < minRequests) {
      await harness.saveDomOutline('fail');
      throw new Error(`captured ${requestCount} data requests (need >= ${minRequests})`);
    }
    if (targetRpcids.length > 0 && !capturedTargetRpc) {
      await harness.saveDomOutline('fail');
      throw new Error(`missing target rpcids: need one of ${targetRpcids.join(', ')}`);
    }
    if (requireInteraction && !interactionVerified) {
      await harness.saveDomOutline('fail');
      throw new Error('interaction produced no observable DOM change and no target requests captured');
    }

    return {
      flow: name,
      ok: true,
      interactionVerified,
      requestCount,
      newRpcids,
      newEndpoints,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`    FAILED: ${message}`);
    const screenshot = await harness.screenshot('failure');
    const domOutline = await harness.saveDomOutline('failure');
    return {
      flow: name,
      ok: false,
      error: message,
      screenshot,
      domOutline,
      requestCount: metrics.countForFlow(name),
      newRpcids: metrics.rpcidsForFlow(name),
      newEndpoints: metrics.endpointsForFlow(name),
    };
  }
}
