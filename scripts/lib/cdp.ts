/**
 * Minimal Chrome DevTools Protocol client over Node's native WebSocket.
 *
 * Avoids a Playwright/Puppeteer dependency — we only need Network domain
 * interception to capture Maps batchexecute traffic.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface CdpEvent {
  method: string;
  params: Record<string, unknown>;
  sessionId?: string;
}

type EventHandler = (event: CdpEvent) => void;

interface PendingCall {
  resolve: (value: Record<string, unknown>) => void;
  reject: (error: Error) => void;
}

export class CdpConnection {
  private readonly socket: WebSocket;
  private readonly pending = new Map<number, PendingCall>();
  private readonly handlers = new Set<EventHandler>();
  private nextId = 1;

  private constructor(socket: WebSocket) {
    this.socket = socket;
    this.socket.addEventListener('message', (event) => {
      this.handleMessage(String((event as MessageEvent).data));
    });
  }

  static async connect(webSocketUrl: string): Promise<CdpConnection> {
    const socket = new WebSocket(webSocketUrl);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => resolve(), { once: true });
      socket.addEventListener('error', () => reject(new Error(`CDP connect failed: ${webSocketUrl}`)), {
        once: true,
      });
    });
    return new CdpConnection(socket);
  }

  private handleMessage(raw: string): void {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }

    const id = message.id as number | undefined;
    if (typeof id === 'number') {
      const call = this.pending.get(id);
      if (!call) return;
      this.pending.delete(id);
      const error = message.error as { message?: string } | undefined;
      if (error) {
        call.reject(new Error(error.message ?? 'CDP call failed'));
      } else {
        call.resolve((message.result as Record<string, unknown>) ?? {});
      }
      return;
    }

    const method = message.method as string | undefined;
    if (!method) return;
    const event: CdpEvent = {
      method,
      params: (message.params as Record<string, unknown>) ?? {},
      sessionId: message.sessionId as string | undefined,
    };
    for (const handler of this.handlers) handler(event);
  }

  on(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  send(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
    timeoutMs = 30_000,
  ): Promise<Record<string, unknown>> {
    const id = this.nextId++;
    const payload: Record<string, unknown> = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify(payload));
      setTimeout(() => {
        if (this.pending.delete(id)) {
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, timeoutMs);
    });
  }

  close(): void {
    this.socket.close();
  }
}

export interface LaunchBrowserOptions {
  port?: number;
  headless?: boolean;
}

export interface LaunchedBrowser {
  connection: CdpConnection;
  close: () => Promise<void>;
}

const CHROME_CANDIDATES = [
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1161/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

/** Desktop Chrome UA without HeadlessChrome — reduces Maps headless DOM divergence. */
export const DESKTOP_CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function resolveChromePath(): string {
  const override = process.env.GMAPS_CHROME_PATH;
  if (override) return override;
  const found = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error('No Chrome binary found. Set GMAPS_CHROME_PATH to a Chromium executable.');
  }
  return found;
}

async function waitForDevtools(port: number, timeoutMs = 20_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        const info = (await response.json()) as { webSocketDebuggerUrl?: string };
        if (info.webSocketDebuggerUrl) return info.webSocketDebuggerUrl;
      }
    } catch {
      // devtools not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Chrome DevTools endpoint did not open on port ${port}`);
}

/** Launch a disposable Chrome instance with the DevTools protocol enabled. */
export async function launchBrowser(options: LaunchBrowserOptions = {}): Promise<LaunchedBrowser> {
  const port = options.port ?? 9333;
  const headless = options.headless ?? process.env.GMAPS_HEADFUL !== '1';
  const chromePath = resolveChromePath();
  const profileDir = mkdtempSync(join(tmpdir(), 'gmaps-cdp-'));

  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-sync',
    '--disable-features=TranslateUI',
    '--disable-blink-features=AutomationControlled',
    '--lang=en-US',
    '--window-size=1440,900',
    'about:blank',
  ];
  if (headless) {
    args.unshift('--headless=new');
  } else {
    args.push('--start-maximized');
  }

  const child: ChildProcess = spawn(chromePath, args, { stdio: 'ignore' });
  const webSocketUrl = await waitForDevtools(port);
  const connection = await CdpConnection.connect(webSocketUrl);

  return {
    connection,
    close: async () => {
      connection.close();
      child.kill('SIGKILL');
      await new Promise((resolve) => setTimeout(resolve, 300));
      rmSync(profileDir, { recursive: true, force: true });
    },
  };
}
