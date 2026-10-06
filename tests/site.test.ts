import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { classifyMedia, extractDownloadLink, isDownloadUrl } from "../shared/media";
import { adminPassword, magnetUrl, panUrl, startTestApi } from "./fixtures";

let api: Awaited<ReturnType<typeof startTestApi>>;
let adminToken: string;
let userToken: string;
async function request(endpoint: string, method = "GET", body?: unknown, token?: string) {
  const response = await fetch(api.base + endpoint, {
    method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: response.status, body: await response.json() };
}
before(async () => {
  api = await startTestApi();
  adminToken = (await request("/api/auth/login", "POST", { username: "admin", password: adminPassword })).body.token;
  userToken = (await request("/api/auth/register", "POST", { username: "normal_user", password: "test-password" })).body.token;
});
after(async () => { await api?.close(); });

test("automatic classification distinguishes animation, kids, documentaries and variety", () => {
  assert.equal(classifyMedia({ mediaType: "movie", genres: ["动画"] }), "动漫");
  assert.equal(classifyMedia({ mediaType: "tv", genres: ["动画", "儿童"] }), "少儿");
  assert.equal(classifyMedia({ mediaType: "movie", genres: ["纪录"] }), "纪录片");
  assert.equal(classifyMedia({ mediaType: "tv", genres: ["Reality"] }), "综艺");
  assert.equal(classifyMedia({ mediaType: "movie", genres: ["剧情"] }), "电影");
  assert.equal(isDownloadUrl("115", "https://115.com.attacker.invalid/s/abc"), false);
  assert.equal(isDownloadUrl("115", "/电影/test.mp4"), false);
  assert.equal(isDownloadUrl("magnet", "javascript:alert(1)"), false);
  assert.equal(isDownloadUrl("magnet", magnetUrl), true);
});

test("plain URLs and copied share text need no separator format", () => {
  assert.equal(extractDownloadLink("115", panUrl).url, panUrl);
  assert.deepEqual(extractDownloadLink("115", `电影分享：${panUrl} 提取码：abcd`), { url: panUrl, code: "abcd" });
  assert.equal(extractDownloadLink("magnet", `下载地址 ${magnetUrl}`).url, magnetUrl);
  assert.throws(() => extractDownloadLink("115", `${panUrl}\nhttps://115.com/s/second`));
  assert.throws(() => extractDownloadLink("115", "javascript:alert(1)"));
});

test("public responses hide links, extraction codes and legacy playback sources", async () => {
  const { body } = await request("/api/media");
  const movie = body.items.find((item: { id: string }) => item.id === "test-movie");
  assert.equal(movie.resources.length, 2);
  assert.equal(movie.resources[0].url, "");
  assert.equal(movie.resources[0].code, undefined);
  assert.equal(movie.source, undefined);
  assert.equal(movie.episodes[0].source, undefined);
  assert.equal(body.items.find((item: { id: string }) => item.id === "empty").resources.length, 0);
});

test("administrator APIs remain protected and playback is disabled", async () => {
  assert.equal((await request("/api/admin/users")).status, 401);
  assert.equal((await request("/api/admin/users", "GET", undefined, userToken)).status, 403);
  assert.equal((await request("/api/tmdb/search?q=test", "GET", undefined, userToken)).status, 403);
  assert.equal((await request("/api/watch/test-movie/pan", "GET", undefined, adminToken)).status, 410);
});

test("VIP granting and revoking applies to an existing login token", async () => {
  await request("/api/admin/users/normal_user/vip", "PUT", { vip: true, vipUntil: null }, adminToken);
  let movie = (await request("/api/media/test-movie", "GET", undefined, userToken)).body.item;
  assert.equal(movie.resources[0].url, panUrl);
  assert.equal(movie.resources[0].code, "abcd");
  await request("/api/admin/users/normal_user/vip", "PUT", { vip: false }, adminToken);
  movie = (await request("/api/media/test-movie", "GET", undefined, userToken)).body.item;
  assert.equal(movie.resources[0].url, "");
});

test("media save supports automatic and manual classification without TMDB duplicates", async () => {
  const input = { title: "分类测试", tmdbId: 666, mediaType: "tv", genres: ["动画"], resources: [] };
  const saved = await request("/api/admin/media", "POST", input, adminToken);
  assert.equal(saved.status, 201); assert.equal(saved.body.item.category, "动漫");
  const updated = await request("/api/admin/media", "POST", { ...input, title: "重新采集", categoryMode: "manual", category: "短剧" }, adminToken);
  assert.equal(updated.body.item.id, saved.body.item.id); assert.equal(updated.body.item.category, "短剧");
  assert.equal((await request("/api/admin/media", "POST", { title: "无效资源", resources: [{ type: "115", url: "/电影/no.mp4" }] }, adminToken)).status, 400);
  const items = (await request("/api/media", "GET", undefined, adminToken)).body.items;
  assert.equal(items.filter((item: { tmdbId: number }) => item.tmdbId === 666).length, 1);
  assert.equal((await request("/api/admin/media/batch", "POST", { action: "classify", ids: [saved.body.item.id] }, adminToken)).body.count, 1);
  assert.equal((await request(`/api/media/${saved.body.item.id}`, "GET", undefined, adminToken)).body.item.category, "动漫");
});

test("concurrent saves retain all items and invalid imports do not partially write", async () => {
  const results = await Promise.all(Array.from({ length: 8 }, (_, index) => request("/api/admin/media", "POST", { title: `并发条目${index}`, resources: [] }, adminToken)));
  assert.ok(results.every((result) => result.status === 201));
  const before = (await request("/api/media", "GET", undefined, adminToken)).body.items;
  assert.equal(before.filter((item: { title: string }) => item.title.startsWith("并发条目")).length, 8);
  assert.equal((await request("/api/admin/media/import", "POST", { items: [{ title: "不能部分保存" }, { title: "" }] }, adminToken)).status, 400);
  const after = (await request("/api/media", "GET", undefined, adminToken)).body.items;
  assert.equal(after.length, before.length);
  assert.ok(!after.some((item: { title: string }) => item.title === "不能部分保存"));
  assert.equal((await request("/api/admin/media/import", "POST", { items: [{ id: "imported", title: "导入条目", mediaType: "movie", genres: ["纪录"] }] }, adminToken)).body.count, 1);
  assert.equal((await request("/api/media/imported")).body.item.category, "纪录片");
  await request("/api/admin/media/batch", "POST", { action: "delete", ids: ["imported"] }, adminToken);
  assert.equal((await request("/api/media/imported")).status, 404);
});

test("resource saves deduplicate links and keep resource identifiers unique", async () => {
  const resources = [
    { id: "same", type: "115", url: panUrl },
    { id: "same", type: "115", url: panUrl },
    { id: "same", type: "magnet", url: magnetUrl }
  ];
  const saved = await request("/api/admin/media", "POST", { title: "资源去重测试", resources }, adminToken);
  assert.equal(saved.status, 201);
  assert.equal(saved.body.item.resources.length, 2);
  assert.equal(new Set(saved.body.item.resources.map((resource: { id: string }) => resource.id)).size, 2);
});

test("announcement publishing validates content and requires administrator access", async () => {
  assert.equal((await request("/api/settings")).body.announcement.enabled, false);
  const settings = { announcement: { enabled: true, title: "测试公告", content: "欢迎来到 Alum4K。\n<script>不会执行</script>", frequency: "daily" } };
  assert.equal((await request("/api/admin/settings", "PUT", settings, userToken)).status, 403);
  const first = await request("/api/admin/settings", "PUT", settings, adminToken);
  assert.equal(first.status, 200);
  const second = await request("/api/admin/settings", "PUT", settings, adminToken);
  assert.equal(first.body.announcement.revision, second.body.announcement.revision);
  const changed = await request("/api/admin/settings", "PUT", { announcement: { ...settings.announcement, title: "更新公告" } }, adminToken);
  assert.notEqual(changed.body.announcement.revision, second.body.announcement.revision);
  assert.equal((await request("/api/settings")).body.announcement.content, settings.announcement.content);
  assert.equal((await request("/api/admin/settings", "PUT", { announcement: { ...settings.announcement, content: "" } }, adminToken)).status, 400);
  assert.equal((await request("/api/admin/settings", "PUT", { announcement: { ...settings.announcement, content: "x".repeat(3001) } }, adminToken)).status, 400);
});

test("free and VIP links can coexist without exposing private URLs or extraction codes", async () => {
  const saved = await request("/api/admin/media", "POST", { title: "混合权限测试", access: "VIP", resources: [
    { id: "free", type: "115", url: panUrl, code: "free-code", access: "free" },
    { id: "vip", type: "magnet", url: magnetUrl, code: "private-code", access: "vip" }
  ] }, adminToken);
  for (const token of [undefined, userToken]) {
    const item = (await request(`/api/media/${saved.body.item.id}`, "GET", undefined, token)).body.item;
    assert.equal(item.resources[0].url, panUrl);
    assert.equal(item.resources[0].code, "free-code");
    assert.equal(item.resources[1].url, "");
    assert.equal(item.resources[1].code, undefined);
  }
  await request("/api/admin/users/normal_user/vip", "PUT", { vip: true, vipUntil: "2000-01-01" }, adminToken);
  assert.equal((await request(`/api/media/${saved.body.item.id}`, "GET", undefined, userToken)).body.item.resources[1].url, "");
  await request("/api/admin/users/normal_user/vip", "PUT", { vip: true, vipUntil: null }, adminToken);
  assert.equal((await request(`/api/media/${saved.body.item.id}`, "GET", undefined, userToken)).body.item.resources[1].url, magnetUrl);
  await request("/api/admin/users/normal_user/vip", "PUT", { vip: false }, adminToken);
  const legacyFree = await request("/api/admin/media", "POST", { title: "继承免费权限", access: "免费", resources: [{ type: "115", url: panUrl }] }, adminToken);
  assert.equal((await request(`/api/media/${legacyFree.body.item.id}`)).body.item.resources[0].url, panUrl);
});

test("only administrators can create admin accounts and secrets never appear in responses", async () => {
  const input = { username: "new_admin", password: "new-admin-test-password" };
  assert.equal((await request("/api/admin/users", "POST", input)).status, 401);
  assert.equal((await request("/api/admin/users", "POST", input, userToken)).status, 403);
  assert.equal((await request("/api/admin/users", "POST", { ...input, password: "short" }, adminToken)).status, 400);
  const created = await request("/api/admin/users", "POST", input, adminToken);
  assert.equal(created.status, 201); assert.equal(created.body.user.role, "admin");
  assert.equal(created.body.user.passwordHash, undefined); assert.equal(created.body.user.salt, undefined);
  assert.equal((await request("/api/admin/users", "POST", input, adminToken)).status, 400);
  const signedIn = await request("/api/auth/login", "POST", input);
  assert.equal((await request("/api/admin/users", "GET", undefined, signedIn.body.token)).status, 200);
  const untrusted = await request("/api/auth/register", "POST", { username: "not_admin", password: "normal-password", role: "admin" });
  assert.equal(untrusted.body.user.role, "user");
  assert.equal((await request("/api/admin/users", "GET", undefined, untrusted.body.token)).status, 403);
  const concurrent = await Promise.all(Array.from({ length: 4 }, (_, index) => request("/api/admin/users", "POST", { username: `parallel_admin_${index}`, password: "parallel-admin-password" }, adminToken)));
  assert.ok(concurrent.every((result) => result.status === 201));
  const users = (await request("/api/admin/users", "GET", undefined, adminToken)).body.users;
  assert.equal(users.filter((user: { username: string }) => user.username.startsWith("parallel_admin_")).length, 4);
  assert.equal(JSON.stringify(users).includes("passwordHash"), false);
});

test("branding persists with legacy announcements and rejects invalid themes or executable logos", async () => {
  const before = (await request("/api/settings")).body;
  assert.equal(before.branding.name, "Alum4K");
  const logo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
  const branding = { name: "测试影视", logo, theme: "light" };
  assert.equal((await request("/api/admin/settings", "PUT", { branding }, userToken)).status, 403);
  assert.equal((await request("/api/admin/settings", "PUT", { branding }, adminToken)).status, 200);
  const saved = (await request("/api/settings")).body;
  assert.deepEqual(saved.branding, branding); assert.deepEqual(saved.announcement, before.announcement);
  for (const patch of [{ theme: "invalid" }, { name: "<script>" }, { logo: "data:image/svg+xml;base64,PHN2Zz4=" }, { logo: "https://attacker.invalid/logo.svg" }, { logo: "data:image/png;base64,SGVsbG8=" }]) {
    assert.equal((await request("/api/admin/settings", "PUT", { branding: { ...branding, ...patch } }, adminToken)).status, 400);
  }
  assert.deepEqual((await request("/api/settings")).body.branding, branding);
  await request("/api/admin/settings", "PUT", { announcement: { ...before.announcement, title: "仅更新公告" } }, adminToken);
  assert.deepEqual((await request("/api/settings")).body.branding, branding);
});
