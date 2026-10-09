import type { AuthState, FilmRequest, Invitation, MediaItem, MediaType, SiteSettings, User } from "./types";
import type { ResourceReport } from "../shared/reports";

const TOKEN_KEY = "alum4k_token";

function expireSession(response: Response, url: string, token: string) {
  if (token && response.status === 401 && !["/api/auth/login", "/api/auth/register"].includes(url)) {
    setAuthToken(""); window.dispatchEvent(new Event("alum4k:session-expired"));
  }
}

async function readJson<T>(url: string): Promise<T> {
  const token = getAuthToken();
  const response = await fetch(url, {
    headers: token ? { authorization: `Bearer ${token}` } : undefined
  });
  if (!response.ok) {
    expireSession(response, url, token);
    const detail = await response.json().catch(() => ({ message: response.statusText }));
    if (detail.code === "SITE_LOGIN_REQUIRED") window.dispatchEvent(new Event("alum4k:login-required"));
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
    expireSession(response, url, token);
    const detail = await response.json().catch(() => ({ message: response.statusText }));
    if (detail.code === "SITE_LOGIN_REQUIRED") window.dispatchEvent(new Event("alum4k:login-required"));
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

export async function register(username: string, password: string, invitationCode: string) {
  const payload = await writeJson<AuthState>("/api/auth/register", "POST", { username, password, invitationCode });
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
    expireSession(response, "/api/auth/me", token);
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
export async function fetchMediaItem(id: string) { return (await readJson<{ item: MediaItem }>(`/api/media/${encodeURIComponent(id)}`)).item; }
export async function reportResource(mediaId: string, resourceId: string, reason: string, note: string) {
  return (await writeJson<{ item: ResourceReport }>(`/api/media/${encodeURIComponent(mediaId)}/resources/${encodeURIComponent(resourceId)}/reports`, "POST", { reason, note })).item;
}
export async function fetchResourceReports() { return (await readJson<{ items: ResourceReport[] }>("/api/admin/resource-reports")).items; }
export async function updateResourceReport(id: string, status: ResourceReport["status"], reply: string, markInvalid = false) {
  return (await writeJson<{ item: ResourceReport }>(`/api/admin/resource-reports/${encodeURIComponent(id)}`, "PUT", { status, reply, markInvalid })).item;
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
  const payload = await readJson<{ users: User[] }>("/api/admin/users");
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

export async function saveProfile(profile: { displayName: string; avatar: string; bio: string }) {
  return (await writeJson<{ user: User }>("/api/auth/profile", "PUT", profile)).user;
}
export async function changePassword(currentPassword: string, newPassword: string) {
  const result = await writeJson<AuthState>("/api/auth/password", "PUT", { currentPassword, newPassword });
  setAuthToken(result.token); return result;
}
export async function resetPassword(username: string, password: string) {
  return (await writeJson<{ user: User }>(`/api/admin/users/${encodeURIComponent(username)}/password`, "PUT", { password })).user;
}
export async function fetchInvitations() { return (await readJson<{ items: Invitation[] }>("/api/admin/invitations")).items; }
export async function generateInvitation() { return (await writeJson<{ item: Invitation }>("/api/admin/invitations", "POST")).item; }
export function disableInvitation(code: string) { return writeJson(`/api/admin/invitations/${code}`, "PUT"); }
export async function fetchRequests(admin = false) { return (await readJson<{ items: FilmRequest[] }>(admin ? "/api/admin/requests" : "/api/requests")).items; }
export async function submitRequest(input: { title: string; mediaType: "movie" | "tv"; year?: number; note: string }) {
  return (await writeJson<{ item: FilmRequest }>("/api/requests", "POST", input)).item;
}
export async function updateRequest(id: string, status: FilmRequest["status"], reply: string) {
  return (await writeJson<{ item: FilmRequest }>(`/api/admin/requests/${encodeURIComponent(id)}`, "PUT", { status, reply })).item;
}
