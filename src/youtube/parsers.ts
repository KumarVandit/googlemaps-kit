import { YouTubeError } from './errors.js';
import type { YouTubeCaptionTrack, YouTubeSearchCursor, YouTubeSearchItem, YouTubeSearchPage, YouTubeThumbnail, YouTubeVideo } from './types.js';

export function youtubeObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fail(label: string): never { throw new YouTubeError(`Malformed YouTube ${label}`, 'parse'); }
function optionalString(value: unknown): string | undefined { return typeof value === 'string' ? value : undefined; }
function requiredString(value: unknown, name: string): string { return typeof value === 'string' && value.length > 0 ? value : fail(name); }
function numeric(value: unknown): number | undefined {
  const result = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  return typeof result === 'number' && Number.isFinite(result) && result >= 0 ? result : undefined;
}

export function youtubeText(value: unknown): string | undefined {
  if (!youtubeObject(value)) return undefined;
  if (typeof value.simpleText === 'string') return value.simpleText;
  if (Array.isArray(value.runs)) return value.runs.map(run => youtubeObject(run) && typeof run.text === 'string' ? run.text : '').join('');
  if (typeof value.content === 'string') return value.content;
  return undefined;
}

function thumbnails(value: unknown): YouTubeThumbnail[] {
  if (!youtubeObject(value) || !Array.isArray(value.thumbnails)) return [];
  return value.thumbnails.flatMap(item => youtubeObject(item) && typeof item.url === 'string' ? [{ url: item.url.startsWith('//') ? `https:${item.url}` : item.url, width: numeric(item.width), height: numeric(item.height) }] : []);
}

export function extractYouTubeJson(html: string, variable: string): Record<string, unknown> | undefined {
  const escaped = variable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?:var\\s+)?${escaped}\\s*=\\s*|window\\[["']${escaped}["']\\]\\s*=\\s*`, 'g');
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    const start = pattern.lastIndex;
    if (html[start] !== '{') continue;
    let depth = 0, quoted = false, escapedCharacter = false;
    for (let index = start; index < html.length; index++) {
      const character = html[index];
      if (quoted) {
        if (escapedCharacter) escapedCharacter = false;
        else if (character === '\\') escapedCharacter = true;
        else if (character === '"') quoted = false;
      } else if (character === '"') quoted = true;
      else if (character === '{') depth++;
      else if (character === '}' && --depth === 0) {
        try { const value: unknown = JSON.parse(html.slice(start, index + 1)); return youtubeObject(value) ? value : fail(variable); }
        catch (cause) { throw new YouTubeError(`Malformed YouTube ${variable} JSON`, 'parse', undefined, undefined, { cause }); }
      }
    }
    return fail(variable);
  }
  return undefined;
}

export function parseVideo(raw: unknown, id: string, initialData?: Record<string, unknown>): YouTubeVideo {
  if (!youtubeObject(raw) || !youtubeObject(raw.playabilityStatus)) return fail('player response');
  const playability = raw.playabilityStatus;
  const details = youtubeObject(raw.videoDetails) ? raw.videoDetails : {};
  if (details.videoId !== undefined && details.videoId !== id) return fail('player video ID');
  const captionContainer = youtubeObject(raw.captions) && youtubeObject(raw.captions.playerCaptionsTracklistRenderer) ? raw.captions.playerCaptionsTracklistRenderer : undefined;
  const captions: YouTubeCaptionTrack[] = !Array.isArray(captionContainer?.captionTracks) ? [] : captionContainer.captionTracks.map(value => {
    if (!youtubeObject(value)) return fail('caption track');
    return { languageCode: requiredString(value.languageCode, 'caption language'), name: youtubeText(value.name) ?? '', baseUrl: requiredString(value.baseUrl, 'caption URL'), kind: optionalString(value.kind), isTranslatable: typeof value.isTranslatable === 'boolean' ? value.isTranslatable : undefined, raw: value };
  });
  return {
    id: optionalString(details.videoId) ?? id,
    url: `https://www.youtube.com/watch?v=${id}`,
    title: optionalString(details.title), author: optionalString(details.author), channelId: optionalString(details.channelId),
    description: optionalString(details.shortDescription), lengthSeconds: numeric(details.lengthSeconds), viewCount: optionalString(details.viewCount),
    keywords: Array.isArray(details.keywords) ? details.keywords.filter((value): value is string => typeof value === 'string') : undefined,
    isLiveContent: typeof details.isLiveContent === 'boolean' ? details.isLiveContent : undefined,
    thumbnails: thumbnails(details.thumbnail),
    playability: { status: requiredString(playability.status, 'playability status'), reason: optionalString(playability.reason), raw: playability },
    captions, raw, initialData,
  };
}

function ownerId(value: unknown): string | undefined {
  if (!youtubeObject(value) || !Array.isArray(value.runs)) return undefined;
  for (const run of value.runs) {
    if (youtubeObject(run) && youtubeObject(run.navigationEndpoint) && youtubeObject(run.navigationEndpoint.browseEndpoint)) return optionalString(run.navigationEndpoint.browseEndpoint.browseId);
  }
  return undefined;
}

function searchItem(type: 'video' | 'channel', raw: Record<string, unknown>): YouTubeSearchItem {
  const id = requiredString(raw[type === 'video' ? 'videoId' : 'channelId'], 'search result ID');
  const title = youtubeText(raw.title) ?? fail('search result title');
  const owner = raw.ownerText ?? raw.longBylineText ?? raw.shortBylineText;
  return {
    type, id, title,
    url: type === 'video' ? `https://www.youtube.com/watch?v=${id}` : `https://www.youtube.com/channel/${id}`,
    description: youtubeText(raw.descriptionSnippet), author: youtubeText(owner), channelId: type === 'channel' ? id : ownerId(owner),
    duration: youtubeText(raw.lengthText), viewCount: youtubeText(raw.viewCountText), publishedTime: youtubeText(raw.publishedTimeText),
    thumbnails: thumbnails(raw.thumbnail ?? (Array.isArray(raw.thumbnails) ? raw.thumbnails[0] : undefined)), raw,
  };
}

function path(value: unknown, ...keys: Array<string | number>): unknown {
  for (const key of keys) value = typeof key === 'number' && Array.isArray(value) ? value[key] : typeof key === 'string' && youtubeObject(value) ? value[key] : undefined;
  return value;
}

function playlistLockup(raw: Record<string, unknown>): YouTubeSearchItem {
  const id = requiredString(raw.contentId, 'playlist ID');
  const metadata = path(raw, 'metadata', 'lockupMetadataViewModel');
  const rows = path(metadata, 'metadata', 'contentMetadataViewModel', 'metadataRows');
  const byline = Array.isArray(rows) ? rows.find(row => path(row, 'lockupContentMetadataRowExtension', 'contentType') === 'METADATA_ROW_CONTENT_TYPE_BYLINE') : undefined;
  const author = path(byline, 'metadataParts', 0, 'text');
  return {
    type: 'playlist', id,
    title: requiredString(youtubeText(path(metadata, 'title')), 'playlist title'),
    url: `https://www.youtube.com/playlist?list=${id}`,
    author: youtubeText(author),
    channelId: optionalString(path(author, 'commandRuns', 0, 'onTap', 'innertubeCommand', 'browseEndpoint', 'browseId')),
    thumbnails: thumbnails({ thumbnails: path(raw, 'contentImage', 'collectionThumbnailViewModel', 'primaryThumbnail', 'thumbnailViewModel', 'image', 'sources') }),
    raw,
  };
}

export function parseSearch(raw: unknown, client: YouTubeSearchCursor['client']): YouTubeSearchPage {
  if (!youtubeObject(raw)) return fail('search response');
  const primary = youtubeObject(raw.contents) && youtubeObject(raw.contents.twoColumnSearchResultsRenderer) ? raw.contents.twoColumnSearchResultsRenderer.primaryContents : undefined;
  const actions = raw.onResponseReceivedCommands ?? raw.onResponseReceivedActions;
  if (!youtubeObject(primary) && !Array.isArray(actions)) return fail('search results');
  const items: YouTubeSearchItem[] = [];
  const seen = new Set<string>();
  let token: string | undefined;
  const stack: unknown[] = [primary ?? actions];
  while (stack.length) {
    const value = stack.pop();
    if (Array.isArray(value)) { for (let i = value.length - 1; i >= 0; i--) stack.push(value[i]); continue; }
    if (!youtubeObject(value)) continue;
    if (youtubeObject(value.continuationCommand) && typeof value.continuationCommand.token === 'string') token ??= value.continuationCommand.token;
    if (youtubeObject(value.lockupViewModel) && value.lockupViewModel.contentType === 'LOCKUP_CONTENT_TYPE_PLAYLIST') {
      const item = playlistLockup(value.lockupViewModel);
      if (!seen.has(`playlist:${item.id}`)) { items.push(item); seen.add(`playlist:${item.id}`); }
      continue;
    }
    const entry = (['video', 'channel'] as const).find(type => youtubeObject(value[`${type}Renderer`]));
    if (entry) {
      const item = searchItem(entry, value[`${entry}Renderer`] as Record<string, unknown>);
      const key = `${entry}:${item.id}`;
      if (!seen.has(key)) { items.push(item); seen.add(key); }
      continue;
    }
    for (const [key, child] of Object.entries(value).reverse()) {
      if (!/adSlotRenderer|promotedSparklesWebRenderer|searchPyvRenderer|adMetadata|loggingDirectives|trackingParams/.test(key)) stack.push(child);
    }
  }
  return { items, estimatedResults: optionalString(raw.estimatedResults), continuation: token ? { token, client } : undefined, raw };
}

export function extractYouTubeClient(html: string): YouTubeSearchCursor['client'] {
  const pattern = /ytcfg\.set\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    const config = extractYouTubeJson(`config=${html.slice(pattern.lastIndex).trimStart()}`, 'config');
    if (!config || !youtubeObject(config.INNERTUBE_CONTEXT) || !youtubeObject(config.INNERTUBE_CONTEXT.client)) continue;
    const client = config.INNERTUBE_CONTEXT.client;
    if (client.clientName !== 'WEB') return fail('unsupported anonymous client');
    return { clientName: 'WEB', clientVersion: requiredString(client.clientVersion, 'client version'), hl: optionalString(client.hl), gl: optionalString(client.gl), visitorData: optionalString(client.visitorData) };
  }
  return fail('anonymous client configuration');
}

export function parseYouTubeVideoId(value: string): string {
  if (typeof value !== 'string') throw new TypeError('A YouTube video ID or URL is required');
  if (/^[A-Za-z0-9_-]{11}$/.test(value)) return value;
  let url: URL;
  try { url = new URL(value); } catch { throw new TypeError('Invalid YouTube video ID or URL'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) throw new TypeError('Invalid YouTube video URL');
  const host = url.hostname.toLowerCase();
  const id = host === 'youtu.be' ? url.pathname.slice(1) : ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'www.youtube-nocookie.com'].includes(host) ? url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1] : undefined;
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(id)) throw new TypeError('Invalid YouTube video URL');
  return id;
}
