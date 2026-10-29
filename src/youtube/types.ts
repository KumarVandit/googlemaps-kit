export interface YouTubeConfig {
  fetch?: typeof globalThis.fetch;
  locale?: string;
  region?: string;
  timeoutMs?: number;
}

export interface YouTubeRequestOptions { signal?: AbortSignal }
export interface YouTubeThumbnail { url: string; width?: number; height?: number }
export interface YouTubeCaptionTrack {
  languageCode: string;
  name: string;
  baseUrl: string;
  kind?: string;
  isTranslatable?: boolean;
  raw: Record<string, unknown>;
}

export interface YouTubeVideo {
  id: string;
  url: string;
  title?: string;
  author?: string;
  channelId?: string;
  description?: string;
  lengthSeconds?: number;
  viewCount?: string;
  keywords?: string[];
  isLiveContent?: boolean;
  thumbnails: YouTubeThumbnail[];
  playability: { status: string; reason?: string; raw: Record<string, unknown> };
  captions: YouTubeCaptionTrack[];
  raw: Record<string, unknown>;
  initialData?: Record<string, unknown>;
}

export interface YouTubeSearchItem {
  type: 'video' | 'channel' | 'playlist';
  id: string;
  title: string;
  url: string;
  description?: string;
  author?: string;
  channelId?: string;
  duration?: string;
  viewCount?: string;
  publishedTime?: string;
  thumbnails: YouTubeThumbnail[];
  raw: Record<string, unknown>;
}

export interface YouTubeSearchCursor {
  token: string;
  client: { clientName: 'WEB'; clientVersion: string; hl?: string; gl?: string; visitorData?: string };
}

export interface YouTubeSearchPage {
  items: YouTubeSearchItem[];
  estimatedResults?: string;
  continuation?: YouTubeSearchCursor;
  raw: Record<string, unknown>;
}

export interface YouTubeOEmbed {
  title: string;
  author_name: string;
  author_url: string;
  type: string;
  height: number;
  width: number;
  version: string;
  provider_name: string;
  provider_url: string;
  thumbnail_height: number;
  thumbnail_width: number;
  thumbnail_url: string;
  html: string;
  [key: string]: unknown;
}
