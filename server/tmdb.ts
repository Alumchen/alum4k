import https from "node:https";
import { HttpsProxyAgent } from "https-proxy-agent";
import type { MediaItem, MediaType } from "./types";
import { classifyMedia } from "../shared/media";

const API_BASE = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p";

interface TmdbSearchResult {
  id: number;
  media_type?: "movie" | "tv" | "person";
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  poster_path?: string;
  backdrop_path?: string;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  genre_ids?: number[];
  origin_country?: string[];
}

interface TmdbDetail {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  poster_path?: string;
  backdrop_path?: string;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  genres?: Array<{ id: number; name: string }>;
  credits?: {
    cast?: Array<{ name: string }>;
  };
  production_countries?: Array<{ iso_3166_1: string; name: string }>;
  origin_country?: string[];
}

function getAuth() {
  const bearer = process.env.TMDB_BEARER_TOKEN?.trim();
  const apiKey = process.env.TMDB_API_KEY?.trim();
  return { bearer, apiKey };
}

function getProxyUrl() {
  return process.env.HTTPS_PROXY?.trim() || process.env.HTTP_PROXY?.trim() || process.env.ALL_PROXY?.trim();
}

export function hasTmdbCredentials() {
  const { bearer, apiKey } = getAuth();
  return Boolean(bearer || apiKey);
}

async function readWithProxy<T>(url: URL, headers: Record<string, string>) {
  const proxyUrl = getProxyUrl();
  if (!proxyUrl) return undefined;

  return new Promise<T>((resolve, reject) => {
    const request = https.request(
      url,
      {
        method: "GET",
        headers,
        agent: new HttpsProxyAgent(proxyUrl),
        timeout: 20000
      },
      (incoming) => {
        const chunks: Buffer[] = [];
        incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
        incoming.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf-8");
          if (!incoming.statusCode || incoming.statusCode < 200 || incoming.statusCode >= 300) {
            reject(new Error(`TMDB request failed: ${incoming.statusCode ?? 0} ${text}`));
            return;
          }

          try {
            resolve(JSON.parse(text) as T);
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    request.on("timeout", () => request.destroy(new Error("TMDB request timed out.")));
    request.on("error", reject);
    request.end();
  });
}

async function tmdbFetch<T>(pathname: string, params: Record<string, string> = {}) {
  const { bearer, apiKey } = getAuth();
  if (!bearer && !apiKey) {
    throw new Error("TMDB credentials are not configured.");
  }

  const url = new URL(`${API_BASE}${pathname}`);
  url.searchParams.set("language", params.language ?? "zh-CN");
  Object.entries(params).forEach(([key, value]) => {
    if (key !== "language" && value) url.searchParams.set(key, value);
  });
  if (!bearer && apiKey) url.searchParams.set("api_key", apiKey);

  const headers: Record<string, string> = bearer ? { Authorization: `Bearer ${bearer}` } : {};
  const proxied = await readWithProxy<T>(url, headers);
  if (proxied) return proxied;

  const response = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`TMDB request failed: ${response.status} ${detail}`);
  }

  return (await response.json()) as T;
}

function imageUrl(path: string | undefined, size: "w342" | "w500" | "w780" | "w1280") {
  return path ? `${IMAGE_BASE}/${size}${path}` : "";
}

function yearFromDate(date: string | undefined) {
  if (!date) return undefined;
  const year = Number(date.slice(0, 4));
  return Number.isFinite(year) ? year : undefined;
}

function regionFrom(result: TmdbSearchResult | TmdbDetail) {
  const country = "origin_country" in result ? result.origin_country?.[0] : undefined;
  if (country === "CN") return "内地";
  if (country === "HK") return "中国香港";
  if (country === "TW") return "中国台湾";
  if (country === "JP") return "日本";
  if (country === "KR") return "韩国";
  if (country === "TH") return "泰国";
  if (country === "GB") return "英国";
  if (country === "US") return "美国";
  return "production_countries" in result ? result.production_countries?.[0]?.name ?? "其他" : "其他";
}

export function mapTmdbSearchResult(result: TmdbSearchResult): MediaItem | null {
  const mediaType = result.media_type === "movie" || result.media_type === "tv" ? result.media_type : null;
  if (!mediaType) return null;

  const title = result.title ?? result.name;
  if (!title) return null;

  return {
    id: `tmdb-${mediaType}-${result.id}`,
    tmdbId: result.id,
    mediaType,
    title,
    originalTitle: result.original_title ?? result.original_name,
    year: yearFromDate(result.release_date ?? result.first_air_date),
    category: mediaType === "movie" ? "电影" : "电视剧",
    region: regionFrom(result),
    access: "会员",
    status: mediaType === "movie" ? "正片" : "待绑定片源",
    rating: result.vote_average ? Number(result.vote_average.toFixed(1)) : undefined,
    genres: [],
    cast: [],
    overview: result.overview ?? "暂无简介。",
    posterPath: imageUrl(result.poster_path, "w500"),
    backdropPath: imageUrl(result.backdrop_path, "w1280"),
    episodes: []
  };
}

export function mapTmdbDetail(detail: TmdbDetail, mediaType: MediaType): MediaItem {
  const genres = detail.genres?.map((genre) => genre.name) ?? [];
  return {
    id: `tmdb-${mediaType}-${detail.id}`,
    tmdbId: detail.id,
    mediaType,
    title: detail.title ?? detail.name ?? "未命名",
    originalTitle: detail.original_title ?? detail.original_name,
    year: yearFromDate(detail.release_date ?? detail.first_air_date),
    category: classifyMedia({ mediaType, genres }),
    categoryMode: "auto",
    region: regionFrom(detail),
    access: "会员",
    status: mediaType === "movie" ? "待绑定片源" : "待绑定剧集",
    rating: detail.vote_average ? Number(detail.vote_average.toFixed(1)) : undefined,
    genres,
    cast: detail.credits?.cast?.slice(0, 6).map((person) => person.name) ?? [],
    overview: detail.overview ?? "暂无简介。",
    posterPath: imageUrl(detail.poster_path, "w500"),
    backdropPath: imageUrl(detail.backdrop_path, "w1280"),
    episodes: []
  };
}

export async function searchTmdb(query: string) {
  const data = await tmdbFetch<{ results: TmdbSearchResult[] }>("/search/multi", {
    query,
    include_adult: "false"
  });
  return data.results.map(mapTmdbSearchResult).filter(Boolean) as MediaItem[];
}

export async function getTmdbDetail(mediaType: MediaType, id: number) {
  const data = await tmdbFetch<TmdbDetail>(`/${mediaType}/${id}`, {
    append_to_response: "credits"
  });
  return mapTmdbDetail(data, mediaType);
}
