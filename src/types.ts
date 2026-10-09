export type MediaType = "movie" | "tv";
export type DownloadResourceType = "115" | "magnet";

export interface MediaSource {
  provider: "115";
  type: "pan115" | "alist" | "direct";
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
import type { ResourceDetails } from "../shared/resources";
import type { MediaSeason } from "../shared/seasons";

export interface ResourceCheckResult {
  ok: boolean;
  playable: boolean;
  status?: number;
  contentType?: string;
  size?: string;
  codecHint?: string;
  containerHint?: string;
  message: string;
  warnings: string[];
}

export interface AListEntry {
  name: string;
  path: string;
  isDir: boolean;
  size?: number;
  modified?: string;
  isVideo: boolean;
}

export interface AListListResult {
  path: string;
  parentPath?: string;
  entries: AListEntry[];
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

export interface User {
  username: string;
  role: "admin" | "user";
  vip: boolean;
  vipUntil?: string | null;
  createdAt?: string;
  displayName?: string;
  avatar?: string;
  bio?: string;
}

export interface AuthState {
  token: string;
  user: User;
}

export type { Announcement, SiteSettings } from "../shared/site";
export type { FilmRequest, Invitation } from "../shared/community";
