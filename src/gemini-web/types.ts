import type { GoogleWebConfig, GoogleWebRequestOptions } from '../utils/google-web.js';

export interface GeminiBrowserLocator {
  count(): Promise<number>;
  nth(index: number): GeminiBrowserLocator;
  isVisible(): Promise<boolean>;
  fill(value: string, options?: { timeout?: number }): Promise<void>;
  press(key: string, options?: { timeout?: number }): Promise<void>;
}

/** The subset of a browser Page needed to use the observed anonymous Gemini composer. */
export interface GeminiBrowserPage {
  url(): string;
  goto(url: string, options?: { waitUntil?: 'domcontentloaded'; timeout?: number }): Promise<unknown>;
  content(): Promise<string>;
  locator(selector: string): GeminiBrowserLocator;
}

export interface GeminiWebConfig extends GoogleWebConfig {
  page?: GeminiBrowserPage;
  pollIntervalMs?: number;
}

export interface GeminiWebBootstrap {
  build: string;
  hasSession: boolean;
  hasPromptToken: boolean;
  generation: 'unverified';
}

export interface GeminiWebMessage {
  role: 'user' | 'model';
  text: string;
  complete?: boolean;
  id?: string;
}

export interface GeminiWebGenerationOptions extends GoogleWebRequestOptions {
  timeoutMs?: number;
}

export interface GeminiWebGeneration {
  text: string;
  responseId?: string;
  conversationUrl: string;
}
