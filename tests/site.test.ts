import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { defaultFilters, filterCatalog, latestCategoryItems, mediaPath, matchesExact, parseDetailPath, readCatalogUrl, catalogPath, suggestMedia } from "../shared/catalog";
import { addPublicPageLocations } from "../scripts/public-pages.mjs";
import { classifyMedia, extractDownloadLink, isDownloadUrl, resourceHref } from "../shared/media";
import { cleanResources } from "../src/ResourceEditor";
import { resourceDisplayMetadata } from "../shared/resources";
import { adminPassword, magnetUrl, panUrl, startTestApi } from "./fixtures";

let api: Awaited<ReturnType<typeof startTestApi>>;
let adminToken: string;
let userToken: string;
async function invite() { return (await request("/api/admin/invitations", "POST", undefined, adminToken)).body.item.code as string; }
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
  userToken = (await request("/api/auth/register", "POST", { username: "normal_user", password: "test-password", invitationCode: await invite() })).body.token;
  await request("/api/admin/users/normal_user/vip", "PUT", { vip: false }, adminToken);
});
after(async () => { await api?.close(); });

test("latest homepage groups use category and update date, limited to two rows", () => {
  const base = { mediaType: "movie" as const, title: "电影", category: "电影", region: "内地", genres: [] };
  const items = [{ ...base, id: "old", createdAt: "2026-01-01" }, { ...base, id: "recent", updatedAt: "2026-10-08" }, { ...base, id: "tv", category: "电视剧", updatedAt: "2026-10-09" }, { ...base, id: "new", createdAt: "2026-10-01" }];
  assert.deepEqual(latestCategoryItems(items, "电影", 2).map((item) => item.id), ["recent", "new"]);
  assert.equal(latestCategoryItems(items, "综艺", 4).length, 0);
});

test("registration hint defaults, persists, validates and requires administrator", async () => {
  assert.equal((await request("/api/settings")).body.registration.hint, "限时免费送7天体验会员，联系微信dkiss_zhou领取激活码。");
  assert.equal((await request("/api/admin/settings", "PUT", { registration: { hint: "新提示" } }, userToken)).status, 403);
  assert.equal((await request("/api/admin/settings", "PUT", { registration: { hint: "活动提示\n联系管理员领取邀请码" } }, adminToken)).status, 200);
  assert.equal((await request("/api/settings")).body.registration.hint, "活动提示\n联系管理员领取邀请码");
  assert.equal((await request("/api/admin/settings", "PUT", { registration: { hint: "x".repeat(501) } }, adminToken)).status, 400);
  assert.equal((await request("/api/admin/settings", "PUT", { registration: [] }, adminToken)).status, 400);
  assert.equal((await request("/api/admin/settings", "PUT", { registration: { hint: "" } }, adminToken)).status, 200);
});

test("registration invitation policy is server-owned and new members receive resource access", async () => {
  const before = (await request("/api/settings")).body.registration;
  assert.equal(before.requireInvitation, true);
  const account = { username: "open_member", password: "test-password" };
  assert.equal((await request("/api/auth/register", "POST", { ...account, requireInvitation: false, vip: true })).status, 400);
  assert.equal((await request("/api/admin/settings", "PUT", { registration: { requireInvitation: false } }, userToken)).status, 403);
  assert.equal((await request("/api/admin/settings", "PUT", { registration: { requireInvitation: "false" } }, adminToken)).status, 400);
  const code = await invite();
  try {
    assert.equal((await request("/api/admin/settings", "PUT", { registration: { requireInvitation: false } }, adminToken)).status, 200);
    assert.equal((await request("/api/settings")).body.registration.hint, before.hint);
    await request("/api/admin/settings", "PUT", { registration: { hint: before.hint } }, adminToken);
    assert.equal((await request("/api/settings")).body.registration.requireInvitation, false);
    const member = await request("/api/auth/register", "POST", { ...account, role: "admin" });
    assert.equal(member.status, 201); assert.equal(member.body.user.vip, true); assert.equal(member.body.user.vipUntil, null); assert.equal(member.body.user.role, "user");
    const movie = (await request("/api/media/test-movie", "GET", undefined, member.body.token)).body.item;
    assert.equal(movie.resources[0].url, panUrl); assert.equal(movie.resources[1].url, magnetUrl);
    assert.equal((await request("/api/admin/users", "GET", undefined, member.body.token)).status, 403);
    assert.equal((await request("/api/auth/register", "POST", { username: "ignored_code", password: "test-password", invitationCode: code })).status, 201);
    const unused = (await request("/api/admin/invitations", "GET", undefined, adminToken)).body.items.find((item: { code: string }) => item.code === code);
    assert.equal(unused.usedAt, undefined);
    await request("/api/admin/settings", "PUT", { registration: { requireInvitation: true } }, adminToken);
    assert.equal((await request("/api/auth/register", "POST", { username: "needs_code", password: "test-password" })).status, 400);
    const invited = await request("/api/auth/register", "POST", { username: "needs_code", password: "test-password", invitationCode: code });
    assert.equal(invited.status, 201); assert.equal(invited.body.user.vip, true);
    assert.equal((await request("/api/auth/login", "POST", account)).body.user.vip, true);
    assert.equal((await request("/api/auth/me", "GET", undefined, userToken)).body.user.vip, false);
  } finally { await request("/api/admin/settings", "PUT", { registration: before }, adminToken); }
});

test("catalog exact aliases, suggestions, compound filters and URL round trips", () => {
  const movie = { id: "中文片名", mediaType: "movie" as const, title: "测试电影", originalTitle: "Test Movie", aliases: ["旧译名"], category: "电影", region: "内地", genres: ["喜剧"], year: 2024, rating: 8.5, resources: [{ access: "free" as const, availability: "available" }, { access: "vip" as const }] };
  const empty = { ...movie, id: "empty", title: "无资源", aliases: [], originalTitle: "Empty", rating: 6, resources: [] };
  assert.equal(matchesExact(movie, "《旧译名》"), true); assert.equal(matchesExact(movie, "test.movie"), true); assert.equal(matchesExact(movie, "测试"), false);
  assert.equal(suggestMedia([movie, empty], "旧译")[0].id, movie.id);
  const filters = { ...defaultFilters, category: "电影", access: "免费", genre: "喜剧", region: "内地", year: "2024", rating: "8", resources: "有资源" };
  assert.deepEqual(filterCatalog([movie, empty], filters, "旧译名").map((item) => item.id), [movie.id]);
  assert.equal(filterCatalog([movie, empty], { ...filters, rating: "9" }).length, 0);
  assert.equal(filterCatalog([{ ...movie, resources: [{ access: "free", availability: "invalid" }] }], filters).length, 1);
  assert.equal(filterCatalog([empty], { ...defaultFilters, resources: "待补资源" }).length, 1);
  assert.deepEqual(readCatalogUrl(new URL(catalogPath(filters, "旧译名"), "https://example.com")), { filters, query: "旧译名" });
  assert.deepEqual(parseDetailPath(mediaPath(movie)), { id: movie.id, mediaType: "movie" });
  assert.equal(parseDetailPath("/movie/%ZZ"), null); assert.equal(parseDetailPath("/movie/a%2Fb"), null);
});

test("Nginx route upgrade is idempotent and preserves TLS, custom ports and redirects", () => {
  const config = `# server { in comment\nserver {\n listen 1023;\n server_name www.alum4k.com;\n location /api/ { proxy_pass http://127.0.0.1:5188/api/; }\n location / { try_files $uri $uri/ /index.html; }\n}\nserver {\n listen 443 ssl;\n ssl_certificate /etc/letsencrypt/live/alum4k/fullchain.pem;\n if ($host = "www.alum4k.com") { set $test "brace } inside string"; }\n server_name www.alum4k.com;\n}\nserver { listen 80; return 301 https://$host$request_uri; }\n`;
  const upgraded = addPublicPageLocations(config, 5174);
  assert.equal((upgraded.match(/# alum4k-public-pages:start/g) ?? []).length, 3);
  assert.ok(upgraded.includes("listen 1023;")); assert.ok(upgraded.includes("listen 443 ssl;")); assert.ok(upgraded.includes("ssl_certificate /etc/letsencrypt/live/alum4k/fullchain.pem;")); assert.ok(upgraded.includes("return 301 https://$host$request_uri;"));
  assert.ok(upgraded.includes("proxy_pass http://127.0.0.1:5188;")); assert.equal(addPublicPageLocations(upgraded, 5174), upgraded);
  assert.throws(() => addPublicPageLocations("server { location /movie/ { return 200; } }"));
  assert.throws(() => addPublicPageLocations('server { set $bad "unterminated; }'));
  assert.throws(() => addPublicPageLocations("server {", 5174)); assert.throws(() => addPublicPageLocations("server {}", 0));
});

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

test("resource display shows size, quality and Shanghai update date with missing-field fallbacks", () => {
  assert.deepEqual(resourceDisplayMetadata({ size: "122.14 GB", resolution: "2160p / 4K", dynamicRange: "HDR10", videoCodec: "H.265 / HEVC", updatedAt: "2026-10-07T18:00:00Z" }), { size: "122.14 GB", quality: "2160p / 4K / HDR10 / H.265 / HEVC", updated: "2026-10-08" });
  assert.deepEqual(resourceDisplayMetadata({ updatedAt: "invalid" }), { size: "大小未填写", quality: "画质未填写", updated: "更新时间未记录" });
});

test("resource input is preserved verbatim without URL format checks", async () => {
  const texts = ["  分享说明\nhttps://example.com/download 提取码：Ab12  ", "/电影/片名.mkv", "任意文字", "javascript:alert(1)", "magnet:?anything=here"];
  const resources = texts.map((url, index) => ({ id: `raw-${index}`, type: index === 4 ? "magnet" as const : "115" as const, title: "原样资源", url, access: index === 2 ? "vip" as const : "free" as const }));
  assert.deepEqual(cleanResources(resources).map((item) => item.url), texts);
  const saved = await request("/api/admin/media", "POST", { title: "原样输入验证", resources }, adminToken);
  assert.equal(saved.status, 201);
  const id = saved.body.item.id;
  assert.deepEqual((await request(`/api/media/${id}`, "GET", undefined, adminToken)).body.item.resources.map((item: { url: string }) => item.url), texts);
  const guest = (await request(`/api/media/${id}`)).body.item.resources;
  assert.equal(guest[0].url, texts[0]); assert.equal(guest[2].url, "");
  assert.equal(resourceHref(texts[0]), undefined); assert.equal(resourceHref(texts[3]), undefined);
  assert.equal(resourceHref("https://example.com/download"), "https://example.com/download");
  assert.equal(resourceHref(texts[4]), texts[4]);
  assert.equal((await request("/api/admin/media", "POST", { title: "过长内容", resources: [{ type: "115", url: "x".repeat(10001) }] }, adminToken)).status, 400);
  await request(`/api/admin/media/${id}`, "DELETE", undefined, adminToken);
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
  assert.equal((await request("/api/admin/media", "POST", { title: "自定义资源", resources: [{ type: "115", url: "/电影/no.mp4" }] }, adminToken)).status, 201);
  const items = (await request("/api/media", "GET", undefined, adminToken)).body.items;
  assert.equal(items.filter((item: { tmdbId: number }) => item.tmdbId === 666).length, 1);
  assert.equal((await request("/api/admin/media/batch", "POST", { action: "classify", ids: [saved.body.item.id] }, adminToken)).body.count, 1);
  assert.equal((await request(`/api/media/${saved.body.item.id}`, "GET", undefined, adminToken)).body.item.category, "动漫");
});

test("homepage promotion is administrator-owned and does not expose VIP resource links", async () => {
  const draft = { title: "热播推送验证", mediaType: "movie", featured: false, resources: [{ type: "115", url: panUrl, access: "vip" }] };
  const created = await request("/api/admin/media", "POST", draft, adminToken);
  assert.equal(created.status, 201);
  const id = created.body.item.id;
  try {
    assert.equal((await request(`/api/admin/media/${id}`, "PUT", { ...created.body.item, featured: true }, userToken)).status, 403);
    assert.equal((await request(`/api/admin/media/${id}`, "PUT", { ...created.body.item, featured: true }, adminToken)).body.item.featured, true);
    const promoted = (await request(`/api/media/${id}`)).body.item;
    assert.equal(promoted.featured, true);
    assert.equal(promoted.resources[0].url, "");
    assert.equal((await request(`/api/admin/media/${id}`, "PUT", { ...created.body.item, featured: false }, adminToken)).body.item.featured, false);
    assert.equal((await request(`/api/media/${id}`)).body.item.featured, false);
  } finally { await request(`/api/admin/media/${id}`, "DELETE", undefined, adminToken); }
});

test("saving an unsaved TMDB draft or deleted entry creates it without stale-ID failures", async () => {
  const input = { id: "tmdb-movie-777777", title: "未入库采集条目", tmdbId: 777777, mediaType: "movie", resources: [{ id: "raw", type: "115", url: "随便填写\n分享文字", access: "free" }] };
  assert.equal((await request(`/api/admin/media/${input.id}`, "PUT", input, userToken)).status, 403);
  const created = await request(`/api/admin/media/${input.id}`, "PUT", input, adminToken);
  assert.equal(created.status, 200); assert.equal(created.body.item.id, input.id);
  assert.equal(created.body.item.resources[0].url, input.resources[0].url);
  const repeated = await request("/api/admin/media/stale-other-id", "PUT", { ...input, title: "再次保存" }, adminToken);
  assert.equal(repeated.status, 200); assert.equal(repeated.body.item.id, input.id);
  assert.equal(repeated.body.item.createdAt, created.body.item.createdAt);
  assert.equal((await request("/api/media", "GET", undefined, adminToken)).body.items.filter((item: { tmdbId: number }) => item.tmdbId === 777777).length, 1);
  await request(`/api/admin/media/${input.id}`, "DELETE", undefined, adminToken);
  const restored = await request(`/api/admin/media/${input.id}`, "PUT", { ...input, title: "旧编辑框重新保存" }, adminToken);
  assert.equal(restored.status, 200); assert.equal(restored.body.item.title, "旧编辑框重新保存");
  await request(`/api/admin/media/${input.id}`, "DELETE", undefined, adminToken);
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
  const untrusted = await request("/api/auth/register", "POST", { username: "not_admin", password: "normal-password", role: "admin", invitationCode: await invite() });
  assert.equal(untrusted.body.user.role, "user");
  assert.equal((await request("/api/admin/users", "GET", undefined, untrusted.body.token)).status, 403);
  const concurrent = await Promise.all(Array.from({ length: 4 }, (_, index) => request("/api/admin/users", "POST", { username: `parallel_admin_${index}`, password: "parallel-admin-password" }, adminToken)));
  assert.ok(concurrent.every((result) => result.status === 201));
  const users = (await request("/api/admin/users", "GET", undefined, adminToken)).body.users;
  assert.equal(users.filter((user: { username: string }) => user.username.startsWith("parallel_admin_")).length, 4);
  assert.equal(JSON.stringify(users).includes("passwordHash"), false);
});

test("invitation codes are eight digits, one-use, protected and concurrency-safe", async () => {
  assert.equal((await request("/api/admin/invitations")).status, 401);
  assert.equal((await request("/api/admin/invitations", "POST", undefined, userToken)).status, 403);
  const codes = await Promise.all(Array.from({ length: 8 }, () => invite()));
  assert.equal(new Set(codes).size, 8); assert.ok(codes.every((code) => /^\d{8}$/.test(code)));
  const input = { username: "invite_user", password: "invite-test-password" };
  assert.equal((await request("/api/auth/register", "POST", input)).status, 400);
  assert.equal((await request("/api/auth/register", "POST", { ...input, invitationCode: "123" })).status, 400);
  await request(`/api/admin/invitations/${codes[0]}`, "PUT", undefined, adminToken);
  assert.equal((await request("/api/auth/register", "POST", { ...input, invitationCode: codes[0] })).status, 400);
  const results = await Promise.all(["invite_user_a", "invite_user_b"].map((username) => request("/api/auth/register", "POST", { ...input, username, invitationCode: codes[1] })));
  assert.deepEqual(results.map((item) => item.status).sort(), [201, 400]);
  assert.equal((await request("/api/auth/register", "POST", { ...input, invitationCode: codes[1] })).status, 400);
  const stored = (await request("/api/admin/invitations", "GET", undefined, adminToken)).body.items.find((item: { code: string }) => item.code === codes[1]);
  assert.ok(stored.usedAt); assert.ok(stored.usedBy.startsWith("invite_user_"));
});

test("profiles preserve account permissions and reject unsafe images", async () => {
  assert.equal((await request("/api/auth/profile", "PUT", { displayName: "访客" })).status, 401);
  const profile = { displayName: "测试昵称", bio: "我的影视清单", avatar: "", role: "admin", vip: true, username: "admin" };
  const changed = await request("/api/auth/profile", "PUT", profile, userToken);
  assert.equal(changed.status, 200); assert.equal(changed.body.user.username, "normal_user"); assert.equal(changed.body.user.role, "user");
  assert.equal(changed.body.user.displayName, "测试昵称"); assert.equal(changed.body.user.vip, false);
  assert.equal((await request("/api/auth/me", "GET", undefined, userToken)).body.user.bio, profile.bio);
  for (const patch of [{ displayName: "<script>" }, { avatar: "data:image/svg+xml;base64,PHN2Zz4=" }, { bio: "x".repeat(161) }]) {
    assert.equal((await request("/api/auth/profile", "PUT", { ...profile, ...patch }, userToken)).status, 400);
  }
  const avatar = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
  assert.equal((await request("/api/auth/profile", "PUT", { ...profile, avatar }, userToken)).body.user.avatar, avatar);
  const vip = await request("/api/admin/users/normal_user/vip", "PUT", { vip: false }, adminToken);
  assert.equal(vip.body.user.displayName, profile.displayName); assert.equal(vip.body.user.avatar, avatar);
});

test("registered users submit private film requests and administrators respond", async () => {
  const input = { title: "求片测试", year: 2025, mediaType: "movie", note: "希望提供 4K 版本", username: "admin", status: "fulfilled" };
  assert.equal((await request("/api/requests", "POST", input)).status, 401);
  const saved = await request("/api/requests", "POST", input, userToken);
  assert.equal(saved.status, 201); assert.equal(saved.body.item.username, "normal_user"); assert.equal(saved.body.item.status, "pending");
  assert.equal((await request("/api/requests", "POST", { ...input, title: " 求片 测试 " }, userToken)).status, 400);
  assert.equal((await request(`/api/admin/requests/${saved.body.item.id}`, "PUT", { status: "fulfilled", reply: "已添加" }, userToken)).status, 403);
  assert.equal((await request("/api/admin/requests", "GET", undefined, userToken)).status, 403);
  assert.equal((await request("/api/requests", "GET", undefined, adminToken)).body.items.length, 0);
  assert.equal((await request("/api/admin/requests", "GET", undefined, adminToken)).body.items.length, 1);
  assert.equal((await request(`/api/admin/requests/${saved.body.item.id}`, "PUT", { status: "fulfilled", reply: "已添加，请搜索影视名。" }, adminToken)).status, 200);
  const mine = (await request("/api/requests", "GET", undefined, userToken)).body.items[0];
  assert.equal(mine.status, "fulfilled"); assert.equal(mine.reply, "已添加，请搜索影视名。");
  assert.equal((await request(`/api/admin/requests/${mine.id}`, "PUT", { status: "invalid" }, adminToken)).status, 400);
  assert.equal((await request("/api/requests", "POST", { ...input, title: "无效年份", year: 1 }, userToken)).status, 400);
});

test("bulletins and SEO metadata persist safely in production HTML", async () => {
  const before = (await request("/api/settings")).body;
  const seo = { title: 'Alum4K <影视> "目录"', adminTitle: "Alum4K 后台", description: "115 & 磁力下载资源介绍", siteUrl: "" };
  const bulletins = [{ id: "ad", type: "advertisement", enabled: true, title: "合作信息", content: "<script>不会执行</script>", image: "", link: "https://example.com/" }];
  assert.equal((await request("/api/admin/settings", "PUT", { seo, bulletins }, userToken)).status, 403);
  assert.equal((await request("/api/admin/settings", "PUT", { seo, bulletins }, adminToken)).status, 200);
  const saved = (await request("/api/settings")).body;
  assert.deepEqual(saved.seo, seo); assert.deepEqual(saved.bulletins, bulletins); assert.deepEqual(saved.branding, before.branding);
  const html = await readFile(path.join(api.directory, "dist/index.html"), "utf8");
  assert.ok(html.includes("Alum4K &lt;影视&gt; &quot;目录&quot;")); assert.ok(html.includes("115 &amp; 磁力下载资源介绍"));
  assert.ok(html.includes('src="/assets/test.js"')); assert.ok(html.includes('name="description"'));
  assert.equal((await request("/api/admin/settings", "PUT", { bulletins: [{ ...bulletins[0], link: "javascript:alert(1)" }] }, adminToken)).status, 400);
  assert.equal((await request("/api/admin/settings", "PUT", { bulletins: [{ ...bulletins[0], image: "data:image/svg+xml;base64,PHN2Zz4=" }] }, adminToken)).status, 400);
  assert.deepEqual((await request("/api/settings")).body.bulletins, bulletins);
});

test("password changes and administrator resets invalidate old sessions without changing privileges", async () => {
  assert.equal((await request("/api/auth/password", "PUT", { currentPassword: "wrong", newPassword: "new-user-password" }, userToken)).status, 400);
  const oldToken = userToken;
  const changed = await request("/api/auth/password", "PUT", { currentPassword: "test-password", newPassword: "new-user-password" }, userToken);
  assert.equal(changed.status, 200); userToken = changed.body.token;
  assert.equal((await request("/api/auth/me", "GET", undefined, oldToken)).status, 401);
  assert.equal((await request("/api/auth/me", "GET", undefined, userToken)).status, 200);
  assert.equal((await request("/api/auth/login", "POST", { username: "normal_user", password: "test-password" })).status, 401);
  assert.equal((await request("/api/auth/login", "POST", { username: "normal_user", password: "new-user-password" })).status, 200);
  assert.equal((await request("/api/admin/users/normal_user/password", "PUT", { password: "reset-user-password" }, userToken)).status, 403);
  assert.equal((await request("/api/admin/users/admin/password", "PUT", { password: "reset-admin-password" }, adminToken)).status, 400);
  const reset = await request("/api/admin/users/normal_user/password", "PUT", { password: "reset-user-password" }, adminToken);
  assert.equal(reset.status, 200); assert.equal(reset.body.user.displayName, "测试昵称"); assert.equal(reset.body.user.role, "user"); assert.equal(reset.body.user.passwordHash, undefined);
  assert.equal((await request("/api/auth/me", "GET", undefined, userToken)).status, 401);
  assert.equal((await request("/api/requests", "GET", undefined, userToken)).status, 401);
  const signedIn = await request("/api/auth/login", "POST", { username: "normal_user", password: "reset-user-password" });
  assert.equal(signedIn.status, 200); userToken = signedIn.body.token;
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
  assert.ok((await readFile(path.join(api.directory, "dist/index.html"), "utf8")).includes(`href="${logo}"`));
  for (const patch of [{ theme: "invalid" }, { name: "<script>" }, { logo: "data:image/svg+xml;base64,PHN2Zz4=" }, { logo: "https://attacker.invalid/logo.svg" }, { logo: "data:image/png;base64,SGVsbG8=" }]) {
    assert.equal((await request("/api/admin/settings", "PUT", { branding: { ...branding, ...patch } }, adminToken)).status, 400);
  }
  assert.deepEqual((await request("/api/settings")).body.branding, branding);
  await request("/api/admin/settings", "PUT", { announcement: { ...before.announcement, title: "仅更新公告" } }, adminToken);
  assert.deepEqual((await request("/api/settings")).body.branding, branding);
});

test("resource metadata survives saves and verification dates are server-owned", async () => {
  const input = { id: "versioned", title: "版本测试", mediaType: "movie", aliases: ["资源测试旧名"], resources: [{ id: "free-version", type: "115", title: "4K 版本", url: panUrl, code: "vcode", access: "free", resolution: "2160p / 4K", dynamicRange: "Dolby Vision", videoCodec: "H.265 / HEVC", subtitles: "简繁中字", audio: "普通话 / DTS-HD MA", size: "40 GB", availability: "available", verifiedAt: "2099-01-01" }] };
  const saved = await request("/api/admin/media", "POST", input, adminToken);
  assert.equal(saved.status, 201);
  const resource = saved.body.item.resources[0];
  assert.equal(resource.resolution, "2160p / 4K"); assert.equal(resource.audio, "普通话 / DTS-HD MA"); assert.ok(resource.updatedAt);
  assert.ok(Date.parse(resource.verifiedAt) <= Date.now());
  const same = await request("/api/admin/media/versioned", "PUT", saved.body.item, adminToken);
  assert.equal(same.body.item.resources[0].updatedAt, resource.updatedAt); assert.equal(same.body.item.resources[0].verifiedAt, resource.verifiedAt);
  assert.equal((await request("/api/media/versioned")).body.item.resources[0].code, "vcode");
  for (const patch of [{ resolution: "bad" }, { dynamicRange: "bad" }, { availability: "bad" }, { audio: "x".repeat(161) }]) {
    assert.equal((await request("/api/admin/media", "POST", { ...input, resources: [{ ...input.resources[0], ...patch }] }, adminToken)).status, 400);
  }
  assert.equal((await request("/api/media?q=资源测试旧名&exact=1")).body.items[0].id, "versioned");
  assert.equal((await request("/api/media?q=资源测试&exact=1")).body.items.length, 0);
});

test("guest feedback is limited to free resources, deduplicated and handled by admins", async () => {
  const input = { reason: "链接失效", note: "网盘提示分享取消", reporter: "admin" };
  assert.equal((await request("/api/media/test-movie/resources/pan/reports", "POST", input)).status, 400);
  const saved = await request("/api/media/versioned/resources/free-version/reports", "POST", input);
  assert.equal(saved.status, 201); assert.equal(saved.body.item.reporter, "游客"); assert.equal(saved.body.item.linkHash, undefined); assert.equal(saved.body.item.fingerprint, undefined);
  assert.equal((await request("/api/media/versioned/resources/free-version/reports", "POST", input)).status, 400);
  assert.equal((await request("/api/admin/resource-reports")).status, 401); assert.equal((await request("/api/admin/resource-reports", "GET", undefined, userToken)).status, 403);
  assert.equal((await request(`/api/admin/resource-reports/${saved.body.item.id}`, "PUT", { status: "resolved", markInvalid: true }, userToken)).status, 403);
  assert.equal((await request(`/api/admin/resource-reports/${saved.body.item.id}`, "PUT", { status: "resolved", reply: "已核验，资源失效。", markInvalid: true }, adminToken)).status, 200);
  const item = (await request("/api/media/versioned")).body.item;
  assert.equal(item.resources[0].availability, "invalid"); assert.ok(item.resources[0].verifiedAt); assert.equal(item.resources[0].resolution, "2160p / 4K");
  assert.equal(JSON.stringify((await request("/api/admin/resource-reports", "GET", undefined, adminToken)).body).includes(panUrl), false);
  const stale = await request("/api/media/versioned/resources/free-version/reports", "POST", input, userToken);
  assert.equal(stale.status, 201);
  await request("/api/admin/media/versioned", "PUT", { ...item, resources: [{ ...item.resources[0], url: "https://115.com/s/replacement", availability: "unknown" }] }, adminToken);
  const changed = await request(`/api/admin/resource-reports/${stale.body.item.id}`, "PUT", { status: "resolved", markInvalid: true }, adminToken);
  assert.equal(changed.status, 400); assert.match(changed.body.message, /链接已被更换/);
  assert.equal((await request("/api/media/versioned")).body.item.resources[0].availability, "unknown");
});

test("independent detail HTML contains unique SEO and public synopsis but no private links", async () => {
  const settings = (await request("/api/settings")).body;
  const siteUrl = "https://www.alum4k.com";
  await request("/api/admin/settings", "PUT", { seo: { ...settings.seo, siteUrl } }, adminToken);
  const response = await fetch(api.base + "/movie/test-movie"); const html = await response.text();
  assert.equal(response.status, 200); assert.ok(html.includes("验证电影 (2024)")); assert.ok(html.includes('rel="canonical" href="https://www.alum4k.com/movie/test-movie"'));
  assert.ok(html.includes("影视资料和下载链接验证。")); assert.ok(html.includes("测试演员")); assert.ok(html.includes('/assets/test.js'));
  for (const privateValue of [panUrl, magnetUrl, "abcd", "private.invalid/video", "/private/movie.mp4"]) assert.equal(html.includes(privateValue), false);
  for (const endpoint of ["/movie/missing", "/tv/test-movie", "/movie/test-movie/extra", "/movie/%ZZ"]) assert.equal((await fetch(api.base + endpoint)).status, 404);
  const missing = await (await fetch(api.base + "/movie/missing")).text(); assert.ok(missing.includes("noindex, follow"));
  const xml = await (await fetch(api.base + "/sitemap.xml")).text(); assert.ok(xml.includes("<sitemapindex")); assert.ok(xml.includes(siteUrl + "/sitemap-1.xml"));
  const page = await (await fetch(api.base + "/sitemap-1.xml")).text(); assert.ok(page.includes(siteUrl + "/movie/test-movie")); assert.ok(page.includes("<lastmod>")); assert.equal(page.includes(panUrl), false);
  assert.equal((await fetch(api.base + "/sitemap-999.xml")).status, 404);
  const robots = await (await fetch(api.base + "/robots.txt")).text(); assert.ok(robots.includes("Disallow: /admin")); assert.ok(robots.includes("Sitemap: " + siteUrl + "/sitemap.xml"));
  assert.equal((await request("/api/admin/settings", "PUT", { seo: { ...settings.seo, siteUrl: "javascript:alert(1)" } }, adminToken)).status, 400);
});
