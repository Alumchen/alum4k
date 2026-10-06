import type { AuthState, MediaItem, MediaType, SiteSettings, User } from "./types";

const TOKEN_KEY = "alum4k_token";

async function readJson<T>(url: string): Promise<T> {
  const token = getAuthToken();
  const response = await fetch(url, {
    headers: token ? { authorization: `Bearer ${token}` } : undefined
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(detail.message ?? response.statusText);
  }
  return (await response.json()) as T;
}

async function writeJson<T>(url: string, method: "POST" | "PUT" | "DELETE", body?: unknown): Promise<T> {
  const token = getAuthToken();
  const response = await fetch(url, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(detail.message ?? response.statusText);
  }

  return (await response.json()) as T;
}

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

export function setAuthToken(token: string) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function login(username: string, password: string) {
  const payload = await writeJson<AuthState>("/api/auth/login", "POST", { username, password });
  setAuthToken(payload.token);
  return payload;
}

export async function register(username: string, password: string) {
  const payload = await writeJson<AuthState>("/api/auth/register", "POST", { username, password });
  setAuthToken(payload.token);
  return payload;
}

export async function fetchCurrentUser() {
  const token = getAuthToken();
  if (!token) return null;

  const response = await fetch("/api/auth/me", {
    headers: { authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    if (response.status === 401) setAuthToken("");
    return null;
  }

  const payload = (await response.json()) as { user: User };
  return payload.user;
}

export async function fetchMedia(query = "", exact = false) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (exact) params.set("exact", "1");
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const payload = await readJson<{ items: MediaItem[] }>(`/api/media${suffix}`);
  return payload.items;
}

export async function searchTmdb(query: string) {
  const payload = await readJson<{ items: MediaItem[]; fallback?: boolean }>(
    `/api/tmdb/search?q=${encodeURIComponent(query)}`
  );
  return payload;
}

export async function fetchTmdbDetail(mediaType: MediaType, tmdbId: number) {
  const payload = await readJson<{ item: MediaItem }>(`/api/tmdb/${mediaType}/${tmdbId}`);
  return payload.item;
}

export async function saveMedia(item: Partial<MediaItem>, id?: string) {
  const method = id ? "PUT" : "POST";
  const url = id ? `/api/admin/media/${encodeURIComponent(id)}` : "/api/admin/media";
  const payload = await writeJson<{ item: MediaItem }>(url, method, item);
  return payload.item;
}

export async function deleteMedia(id: string) {
  await writeJson<{ ok: true }>(`/api/admin/media/${encodeURIComponent(id)}`, "DELETE");
}

export async function collectTmdb(item: Partial<MediaItem>) {
  const payload = await writeJson<{ item: MediaItem }>("/api/admin/collect-tmdb", "POST", item);
  return payload.item;
}

export async function fetchUsers() {
  const token = getAuthToken();
  const response = await fetch("/api/admin/users", {
    headers: token ? { authorization: `Bearer ${token}` } : undefined
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(detail.message ?? response.statusText);
  }
  const payload = (await response.json()) as { users: User[] };
  return payload.users;
}

export async function setUserVip(username: string, vip: boolean, vipUntil?: string | null) {
  const payload = await writeJson<{ user: User }>(`/api/admin/users/${encodeURIComponent(username)}/vip`, "PUT", { vip, vipUntil });
  return payload.user;
}

export async function createAdmin(username: string, password: string) {
  const payload = await writeJson<{ user: User }>("/api/admin/users", "POST", { username, password });
  return payload.user;
}

export function fetchSettings() {
  return readJson<SiteSettings>("/api/settings");
}

export function saveSettings(settings: SiteSettings) {
  return writeJson<SiteSettings>("/api/admin/settings", "PUT", settings);
}

export function batchMedia(action: "classify" | "delete", ids: string[]) {
  return writeJson<{ count: number }>("/api/admin/media/batch", "POST", { action, ids });
}

export function importLibrary(items: Partial<MediaItem>[]) {
  return writeJson<{ count: number }>("/api/admin/media/import", "POST", { items });
}
