import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { startTestApi, adminPassword } from "./fixtures";

let api: Awaited<ReturnType<typeof startTestApi>>; let admin: string; let member: string; let other: string;
async function req(url: string, method = "GET", body?: unknown, token?: string) { const result = await fetch(api.base + url, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000) }); return { status: result.status, body: await result.json() }; }
before(async () => { api = await startTestApi(); admin = (await req("/api/auth/login", "POST", { username: "admin", password: adminPassword })).body.token; for (const name of ["chip_member", "chip_other"]) { const code = (await req("/api/admin/invitations", "POST", undefined, admin)).body.item.code; const result = await req("/api/auth/register", "POST", { username: name, password: "test-password", invitationCode: code }); if (name === "chip_member") member = result.body.token; else other = result.body.token; } });
after(async () => { await api.close(); });
const item = (title = "测试工艺设计笔记") => ({ title, category: "工艺整合", kind: "文章", content: "原创测试正文 <script>alert('xss')</script>", tags: ["测试"], cover: "", link: "", pinned: true, featured: true, status: "published" });

test("Forum registration, public pages, safe content and admin protections", async () => {
  const feed = await req("/api/xinsj"); assert.equal(feed.status, 200); assert.equal(feed.body.settings.name, "Alum芯世界"); assert.ok(feed.body.items.length >= 4); assert.equal(feed.body.stats.comments, 0);
  assert.equal(feed.body.items[0].likes, undefined); assert.equal(feed.body.items[0].reviewNote, undefined);
  assert.equal((await req("/api/admin/xinsj")).status, 401); assert.equal((await req("/api/admin/xinsj", "GET", undefined, member)).status, 403);
  assert.equal((await req("/api/xinsj/posts", "POST", { item: item() })).status, 401); assert.equal((await req("/api/xinsj?mode=mine")).status, 401);
  const plugins = (await req("/api/workbench")).body.plugins; assert.equal(plugins.find((plugin: { id: string }) => plugin.id === "alumxinsj").adminEntry, "/xinsj/admin");
  for (const url of ["/xinsj", "/xinsj/admin", "/xinsj/post/welcome"]) { const result = await fetch(api.base + url); const html = await result.text(); assert.equal(result.status, 200); assert.match(html, /Alum芯世界/); if (url.endsWith("admin")) assert.match(html, /noindex, nofollow/); }
  assert.equal((await fetch(api.base + "/xinsj/post/missing")).status, 404);
  assert.match(await (await fetch(api.base + "/robots.txt")).text(), /Disallow: \/xinsj\/admin/);
  assert.match(await (await fetch(api.base + "/sitemap.xml")).text(), /\/xinsj\/sitemap.xml/);
});

test("Members submit moderated posts, cannot self-approve, and own edits return to review", async () => {
  const result = await req("/api/xinsj/posts", "POST", { item: item() }, member); assert.equal(result.status, 201); const id = result.body.item.id;
  assert.equal(result.body.item.author, "chip_member"); assert.equal(result.body.item.status, "pending"); assert.equal(result.body.item.pinned, false);
  assert.equal((await req("/api/xinsj/posts/" + id)).status, 404); assert.equal((await req("/api/xinsj/posts/" + id, "GET", undefined, other)).status, 404);
  assert.equal((await req("/api/xinsj?mode=mine", "GET", undefined, member)).body.total, 1);
  const denied = await req("/api/xinsj/posts/" + id, "PUT", { item: item(), version: result.body.item.updatedAt }, other); assert.equal(denied.status, 403);
  let store = (await req("/api/admin/xinsj", "GET", undefined, admin)).body;
  const post = store.posts.find((post: { id: string }) => post.id === id);
  store = (await req("/api/admin/xinsj/posts/" + id, "PUT", { item: { ...post, status: "published", reviewNote: "内部审核说明" }, revision: store.revision }, admin)).body;
  const published = await req("/api/xinsj/posts/" + id); assert.equal(published.status, 200); assert.equal(published.body.item.reviewNote, undefined);
  const html = await (await fetch(api.base + "/xinsj/post/" + id)).text(); assert.ok(html.includes("&lt;script&gt;")); assert.ok(!html.includes("<script>alert('xss')</script>"));
  assert.equal((await req("/api/xinsj?category=工艺整合&q=测试工艺")).body.total, 1);
  assert.equal((await req("/api/xinsj/posts/" + id, "PUT", { item: item("重新编辑"), version: "stale" }, member)).status, 409);
  const updated = await req("/api/xinsj/posts/" + id, "PUT", { item: item("重新编辑"), version: post.updatedAt === published.body.item.updatedAt ? post.updatedAt : published.body.item.updatedAt }, member);
  assert.equal(updated.status, 200); assert.equal(updated.body.item.status, "pending"); assert.equal((await req("/api/xinsj/posts/" + id)).status, 404);
});

test("Reactions are idempotent toggles and comment moderation protects drafts", async () => {
  const url = "/api/xinsj/posts/welcome";
  assert.equal((await req(url + "/reactions", "POST", { action: "like" })).status, 401);
  const liked = await req(url + "/reactions", "POST", { action: "like" }, member); assert.equal(liked.body.item.likeCount, 1); assert.equal(liked.body.item.liked, true); assert.equal(liked.body.item.likes, undefined);
  await req(url + "/reactions", "POST", { action: "save" }, member); assert.equal((await req("/api/xinsj?mode=saved", "GET", undefined, member)).body.total, 1); assert.equal((await req("/api/xinsj?mode=saved", "GET", undefined, other)).body.total, 0);
  assert.equal((await req(url + "/reactions", "POST", { action: "like" }, member)).body.item.likeCount, 0);
  const comment = await req(url + "/comments", "POST", { content: "待审评论" }, member); assert.equal(comment.status, 201); assert.equal(comment.body.item.status, "pending");
  assert.equal((await req(url)).body.comments.length, 0); assert.equal((await req(url, "GET", undefined, member)).body.comments.length, 1); assert.equal((await req(url, "GET", undefined, other)).body.comments.length, 0);
  let store = (await req("/api/admin/xinsj", "GET", undefined, admin)).body;
  assert.equal((await req("/api/admin/xinsj/comments/" + comment.body.item.id, "PUT", { status: "published", revision: store.revision }, member)).status, 403);
  store = (await req("/api/admin/xinsj/comments/" + comment.body.item.id, "PUT", { status: "published", revision: store.revision }, admin)).body;
  assert.equal((await req(url)).body.item.commentCount, 1);
  const post = store.posts.find((post: { id: string }) => post.id === "welcome"); store = (await req("/api/admin/xinsj/posts/welcome", "PUT", { item: { ...post, locked: true }, revision: store.revision }, admin)).body;
  assert.equal((await req(url + "/comments", "POST", { content: "不应提交" }, other)).status, 403);
  store = (await req("/api/admin/xinsj/posts/welcome", "DELETE", { revision: store.revision }, admin)).body; assert.equal(store.comments.some((comment: { postId: string }) => comment.postId === "welcome"), false);
});

test("Validation, conflicting admin writes, paging, backups and plugin gates", async () => {
  let store = (await req("/api/admin/xinsj", "GET", undefined, admin)).body;
  for (const invalid of [{ ...item(), link: "javascript:alert(1)" }, { ...item(), cover: "data:text/html,evil" }, { ...item(), tags: [null] }, { ...item(), category: "missing" }, { ...item(), title: "" }]) assert.equal((await req("/api/admin/xinsj/posts", "POST", { item: invalid }, admin)).status, 400);
  const results = await Promise.all([1, 2].map((number) => req("/api/admin/xinsj/settings", "PUT", { revision: store.revision, settings: { ...store.settings, description: "测试 " + number } }, admin))); assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  store = (await req("/api/admin/xinsj", "GET", undefined, admin)).body;
  assert.equal((await req("/api/admin/xinsj/settings", "PUT", { revision: store.revision, settings: { ...store.settings, categories: [] } }, admin)).status, 400);
  for (let n = 0; n < 15; n++) assert.equal((await req("/api/admin/xinsj/posts", "POST", { item: item("分页 " + n) }, admin)).status, 201);
  const feed = await req("/api/xinsj"); assert.equal(feed.body.items.length, 12); assert.equal(feed.body.pages, 2); assert.equal((await req("/api/xinsj?page=2")).body.page, 2);
  store = (await req("/api/admin/xinsj", "GET", undefined, admin)).body; const disk = JSON.parse(await readFile(path.join(api.directory, "data/xinsj/forum.json"), "utf8")); assert.equal(disk.revision, store.revision); assert.ok(await readFile(path.join(api.directory, "data/xinsj/forum.json.bak")));
  const workbench = (await req("/api/admin/workbench", "GET", undefined, admin)).body; await req("/api/admin/workbench", "PUT", { ...workbench, plugins: workbench.plugins.map((plugin: { id: string }) => ({ ...plugin, enabled: plugin.id !== "alumxinsj" })) }, admin);
  assert.equal((await req("/api/xinsj")).status, 503); assert.equal((await req("/api/xinsj/posts", "POST", { item: item() }, member)).status, 503); assert.equal((await fetch(api.base + "/xinsj")).status, 503); assert.equal((await fetch(api.base + "/xinsj/admin")).status, 200); assert.equal((await req("/api/admin/xinsj", "GET", undefined, admin)).status, 200);
  assert.doesNotMatch(await (await fetch(api.base + "/sitemap.xml")).text(), /xinsj\/sitemap/);
});
