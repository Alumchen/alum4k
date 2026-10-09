import type { ResourceDetails } from "../shared/resources";
import type { MediaSeason } from "../shared/seasons";
export type MediaType = "movie" | "tv";
export type SourceType = "pan115" | "alist" | "direct";
export type DownloadResourceType = "115" | "magnet";

export interface MediaSource {
  provider: "115";
  type: SourceType;
  pickcode?: string;
  fileId?: string;
  path?: string;
  directUrl?: string;
}

export interface DownloadResource extends ResourceDetails {
  id: string;
  type: DownloadResourceType;
  title: string;
  url: string;
  code?: string;
  size?: string;
  note?: string;
  access?: "free" | "vip";
}

export interface Episode {
  id: string;
  title: string;
  subtitle?: string;
  source?: MediaSource;
}

export interface MediaItem {
  id: string;
  tmdbId?: number;
  mediaType: MediaType;
  title: string;
  originalTitle?: string;
  aliases?: string[];
  year?: number;
  category: string;
  categoryMode?: "auto" | "manual";
  featured?: boolean;
  createdAt?: string;
  updatedAt?: string;
  region: string;
  access: "免费" | "会员" | "VIP";
  status: string;
  seasons?: MediaSeason[];
  selectedSeason?: number;
  episodeCount?: number;
  rating?: number;
  genres: string[];
  cast: string[];
  overview: string;
  posterPath?: string;
  backdropPath?: string;
  source?: MediaSource;
  resources?: DownloadResource[];
  episodes: Episode[];
}

export interface ResolvedSource {
  playUrl: string;
  expiresAt?: string;
}
