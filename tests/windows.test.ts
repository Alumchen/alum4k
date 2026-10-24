import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { startTestApi, adminPassword } from "./fixtures";
import seed from "../plugins/alumwindows/catalog.seed.json";
import { parseWindowsSource } from "../server/windows-source";
import { windowsHref, defaultWindowsCategory } from "../shared/windows";

let api: Awaited<ReturnType<typeof startTestApi>>; let token: string; let userToken: string;
async function request(endpoint: string, method = "GET", body?: unknown, auth?: string) { const response = await fetch(api.base + endpoint, { method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...(auth ? { authorization: `Bearer ${auth}` } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000) }); return { status: response.status, body: await response.json() }; }
before(async () => { api = await startTestApi(); token = (await request("/api/auth/login", "POST", { username: "admin", password: adminPassword })).body.token; const code = (await request("/api/admin/invitations", "POST", undefined, token)).body.item.code; userToken = (await request("/api/auth/register", "POST", { username: "windows_user", password: "test-password", invitationCode: code })).body.token; });
after(async () => { await api.close(); });

test("HelloWindows import only parses public JSON facts and keeps download addresses unchanged", () => {
  const url = "https://hellowindows.cn/link?target=original%2Bencoded&_name=Windows+11";
  const groups = [{ category: "Windows11 version 26H2", list: [{ type: "divider", content: "<b>版本分组</b>" }, { id: "original", title: "Windows 11 (business editions)", bit: "64位", type: "商业版", date: "2026.10", info: '文件：windows.iso<br>大小：6 GB<br>SHA1：ABCD<script>fetch("/steal")</script><p>不复制的推广说明</p>', links: [{ name: "迅雷网盘", url, hide: false }, { name: "隐藏内容", url: "secret", hide: true }] }] }];
  const store = parseWindowsSource(`<script>new Vue({data:{\nitems: ${JSON.stringify(groups).replace(/</g, "\\u003c")} },\n});</script>`);
  assert.equal(store.items.length, 1); assert.equal(store.items[0].links.length, 1); assert.equal(store.items[0].links[0].url, url); assert.equal(store.items[0].title, groups[0].list[1].title);
  assert.equal(store.items[0].group, "版本分组"); assert.equal(store.items[0].info, "文件：windows.iso\n大小：6 GB\nSHA1：ABCD");
  assert.equal(store.items[0].sourceId, "original"); assert.equal(defaultWindowsCategory(store.categories), store.categories[0]);
  assert.throws(() => parseWindowsSource("<script>throw new Error('not run')</script>"));
  assert.throws(() => parseWindowsSource('<script>\nitems: [] },\n</script>'));
  for (const url of ["javascript:alert(1)", "data:text/html,<script>", "https://user:pass@example.com", "magnet:?xt=urn:btih:example", "ed2k://|file|example|"]) assert.equal(windowsHref(url), "");
  assert.equal(windowsHref("https://example.com/file.iso"), "https://example.com/file.iso");
});

test("Windows plugin initializes from an offline snapshot with all visible source resources", async () => {
  const result = await request("/api/windows"); assert.equal(result.status, 200);
  assert.equal(result.body.items.length, seed.items.length); assert.equal(result.body.categories.length, seed.categories.length);
  assert.equal(result.body.items[0].links[0].url, seed.items[0].links[0].url);
  assert.ok(seed.items.length >= 150); assert.ok(seed.categories.includes("Windows 7"));
  const plugins = (await request("/api/workbench")).body.plugins; assert.equal(plugins.find((plugin: { id: string }) => plugin.id === "alumwindows").entry, "/windows");
  for (const endpoint of ["/api/admin/windows", "/api/admin/windows/collect"]) assert.equal((await request(endpoint, endpoint.endsWith("collect") ? "POST" : "GET")).status, 401);
  assert.equal((await request("/api/admin/windows", "GET", undefined, userToken)).status, 403);
  for (const endpoint of ["/windows", "/windows/faq", "/windows/admin"]) { const response = await fetch(api.base + endpoint); const html = await response.text(); assert.equal(response.status, 200); assert.match(html, /AlumWindows/); if (endpoint.endsWith("admin")) assert.match(html, /noindex, nofollow/); }
  const robots = await (await fetch(api.base + "/robots.txt")).text(); assert.match(robots, /Disallow: \/windows\/admin/);
  const map = await (await fetch(api.base + "/workbench-sitemap.xml")).text(); assert.match(map, /\/windows<\/loc>/);
});

test("Windows management protects writes, preserves link text and never publishes drafts", async () => {
  let store = (await request("/api/admin/windows", "GET", undefined, token)).body;
  const item = { ...store.items[0], title: "仅管理员可见的草稿", published: false, info: "文件：test.iso\nSHA256：ABC", links: [{ name: "自定义内容", url: "任意文本不作链接核验" }] };
  assert.equal((await request("/api/admin/windows/resources", "POST", { item, revision: store.revision }, userToken)).status, 403);
  const created = await request("/api/admin/windows/resources", "POST", { item, revision: store.revision }, token); assert.equal(created.status, 201); store = created.body;
  const draft = store.items.find((item: { title: string }) => item.title === "仅管理员可见的草稿"); assert.ok(draft.id); assert.notEqual(draft.id, item.id);
  assert.equal((await request("/api/windows")).body.items.some((item: { id: string }) => item.id === draft.id), false);
  assert.equal((await (await fetch(api.base + "/windows")).text()).includes(draft.title), false);
  assert.equal((await request("/api/admin/windows/resources/" + draft.id, "PUT", { item: { ...draft, published: true }, revision: 0 }, token)).status, 409);
  store = (await request("/api/admin/windows/resources/" + draft.id, "PUT", { item: { ...draft, published: true }, revision: store.revision }, token)).body;
  assert.equal((await request("/api/windows")).body.items.find((item: { id: string }) => item.id === draft.id).links[0].url, "任意文本不作链接核验");
  for (const invalid of [{ ...draft, category: "missing" }, { ...draft, title: "" }, { ...draft, links: [null] }, { ...draft, published: "true" }]) assert.equal((await request("/api/admin/windows/resources/" + draft.id, "PUT", { item: invalid, revision: store.revision }, token)).status, 400);
  const results = await Promise.all([1, 2].map((index) => request("/api/admin/windows/settings", "PUT", { revision: store.revision, settings: { ...store.settings, name: "AlumWindows " + index } }, token)));
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  store = (await request("/api/admin/windows", "GET", undefined, token)).body;
  store = (await request("/api/admin/windows/resources/" + draft.id, "DELETE", { revision: store.revision }, token)).body;
  assert.equal(store.items.some((item: { id: string }) => item.id === draft.id), false);
  assert.ok((await readdir(path.join(api.directory, "data/windows"))).includes("catalog.json.bak"));
  assert.equal(JSON.parse(await readFile(path.join(api.directory, "data/windows/catalog.json"), "utf8")).revision, store.revision);
});

test("Windows imports are atomic, merge published flags, and upgrade old workbench configurations", async () => {
  let store = (await request("/api/admin/windows", "GET", undefined, token)).body;
  const original = store.items[0];
  store = (await request("/api/admin/windows/resources/" + original.id, "PUT", { revision: store.revision, item: { ...original, published: false } }, token)).body;
  const imported = { ...store, items: [{ ...original, published: true, title: "来源更新标题" }] };
  const result = await request("/api/admin/windows/import", "POST", { store: imported, revision: store.revision, mode: "merge" }, token);
  assert.equal(result.status, 200); store = result.body;
  assert.equal(store.items[0].published, false); assert.equal(store.items[0].title, "来源更新标题"); assert.ok(store.items.length > 100);
  const bad = await request("/api/admin/windows/import", "POST", { store: { ...imported, items: [original, original] }, revision: store.revision, mode: "replace" }, token); assert.equal(bad.status, 400);
  assert.equal((await request("/api/admin/windows", "GET", undefined, token)).body.revision, store.revision);
  const workbench = (await request("/api/admin/workbench", "GET", undefined, token)).body;
  await writeFile(path.join(api.directory, "data/workbench.json"), JSON.stringify({ settings: workbench.settings, plugins: workbench.plugins.filter((plugin: { id: string }) => plugin.id !== "alumwindows") }));
  const upgraded = (await request("/api/admin/workbench", "GET", undefined, token)).body;
  assert.equal(upgraded.plugins.length, 3); assert.equal(upgraded.plugins.find((plugin: { id: string }) => plugin.id === "alumwindows").enabled, true);
  await request("/api/admin/workbench", "PUT", { ...workbench, plugins: workbench.plugins.map((plugin: { id: string }) => ({ ...plugin, enabled: plugin.id !== "alumwindows" })) }, token);
  assert.equal((await request("/api/windows")).status, 503); assert.equal((await fetch(api.base + "/windows")).status, 503); assert.equal((await fetch(api.base + "/windows/admin")).status, 200);
  assert.equal((await request("/api/admin/windows", "GET", undefined, token)).status, 200);
  assert.equal((await (await fetch(api.base + "/workbench-sitemap.xml")).text()).includes("/windows<"), false);
  await request("/api/admin/workbench", "PUT", workbench, token);
});
