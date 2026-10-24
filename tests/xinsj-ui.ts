import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Page } from "playwright";
import { startTestApi, freePort, projectRoot, adminPassword } from "./fixtures";

const api = await startTestApi(); const port = await freePort(); const origin = `http://127.0.0.1:${port}`; const output = path.join(projectRoot, "artifacts/ui");
const web = spawn(process.execPath, [path.join(projectRoot, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: projectRoot, env: { ...process.env, API_ORIGIN: api.base }, windowsHide: true, stdio: "ignore" });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined; const errors: string[] = [];
async function req(url: string, method = "GET", body?: unknown, token?: string) { const response = await fetch(api.base + url, { method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined }); assert.ok(response.ok, url + ": " + response.status); return response.json(); }
async function shot(page: Page, name: string) { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, name + " overflows"); await page.screenshot({ path: path.join(output, name), fullPage: false }); }
try {
  await mkdir(output, { recursive: true }); for (let i = 0; i < 100; i++) { try { if ((await fetch(origin)).ok) break; } catch { /* Wait for Vite. */ } await new Promise((resolve) => setTimeout(resolve, 100)); }
  const admin = (await req("/api/auth/login", "POST", { username: "admin", password: adminPassword })).token;
  const invitationCode = (await req("/api/admin/invitations", "POST", undefined, admin)).item.code;
  const member = (await req("/api/auth/register", "POST", { username: "chip_ui_member", password: "test-password", invitationCode })).token;
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const page = await context.newPage(); page.on("pageerror", (error) => errors.push(error.message)); page.on("dialog", (dialog) => dialog.accept());
  await page.goto(origin + "/xinsj"); await page.locator(".chip-post").first().waitFor(); assert.match(await page.title(), /Alum芯世界/);
  await page.locator(".chip-banner-photo").evaluate((image) => (image as HTMLImageElement).decode());
  assert.equal(await page.locator(".chip-layout").evaluate((element) => getComputedStyle(element).display), "grid");
  await shot(page, "xinsj-desktop.png");
  await page.getByRole("button", { name: "切换深色", exact: true }).click(); await shot(page, "xinsj-dark.png"); await page.reload(); await page.locator(".chip-post").first().waitFor(); assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
  await page.getByRole("button", { name: "切换浅色", exact: true }).click();
  await page.getByLabel("搜索社区", { exact: true }).fill("不存在的主题"); await page.getByRole("button", { name: "搜索", exact: true }).click(); await page.getByText("这里还没有帖子", { exact: true }).waitFor(); await page.getByRole("button", { name: "查看全部内容", exact: true }).click();
  await page.getByRole("button", { name: "发布内容", exact: true }).click(); await page.getByRole("dialog").waitFor(); assert.match(await page.getByRole("dialog").innerText(), /登录/); await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.evaluate((token) => localStorage.setItem("alum4k_token", token), member); await page.reload(); await page.getByText("chip_ui_member", { exact: true }).waitFor();
  await page.getByRole("button", { name: "发布内容", exact: true }).click(); await page.getByLabel("标题", { exact: true }).fill("UI半导体问答测试"); await page.getByRole("dialog").getByLabel("内容类型", { exact: true }).selectOption("问答"); await page.getByLabel("正文", { exact: true }).fill("这是可审核的社区投稿。<script>window.testXSS=true</script>");
  await page.getByRole("button", { name: "提交帖子", exact: true }).click(); await page.getByRole("status").filter({ hasText: "等待管理员审核" }).waitFor();
  await page.getByRole("button", { name: "我的发布", exact: true }).click(); await page.locator(".chip-post").filter({ hasText: "UI半导体问答测试" }).waitFor(); assert.match(await page.locator(".chip-post").innerText(), /待审核/);
  const adminPage = await context.newPage(); adminPage.on("pageerror", (error) => errors.push(error.message)); adminPage.on("dialog", (dialog) => dialog.accept());
  await adminPage.goto(origin + "/xinsj/admin"); await adminPage.getByRole("heading", { name: "管理员登录", exact: true }).waitFor();
  await adminPage.getByLabel("密码", { exact: true }).fill(adminPassword); await adminPage.getByRole("button", { name: "登录后台", exact: true }).click(); await adminPage.getByRole("heading", { name: "帖子管理", exact: true }).waitFor();
  await adminPage.getByRole("button", { name: "编辑 UI半导体问答测试", exact: true }).click(); await adminPage.getByLabel("发布状态", { exact: true }).selectOption("published"); await adminPage.getByLabel("精华", { exact: true }).check(); await adminPage.getByRole("button", { name: "提交帖子", exact: true }).click(); await adminPage.getByRole("status").filter({ hasText: "帖子已保存" }).waitFor(); await shot(adminPage, "xinsj-admin-desktop.png");
  await page.evaluate((token) => localStorage.setItem("alum4k_token", token), member); await page.reload(); await page.locator(".chip-post").first().waitFor();
  await page.locator(".chip-post-heading a").filter({ hasText: "UI半导体问答测试" }).click(); await page.locator(".chip-body").waitFor(); assert.ok((await page.locator(".chip-body").innerText()).includes("<script>")); assert.equal(await page.evaluate(() => (window as unknown as Record<string, unknown>).testXSS), undefined);
  await page.getByRole("button", { name: "赞同 0", exact: true }).click(); await page.getByRole("button", { name: "赞同 1", exact: true }).waitFor(); await page.getByRole("button", { name: "收藏", exact: true }).last().click(); await page.getByRole("button", { name: "已收藏", exact: true }).waitFor();
  await page.getByLabel("参与讨论", { exact: true }).fill("这是一条待审核评论"); await page.getByRole("button", { name: "提交评论", exact: true }).click(); await page.getByRole("status").filter({ hasText: "等待审核" }).waitFor(); await shot(page, "xinsj-detail.png");
  await adminPage.evaluate((token) => localStorage.setItem("alum4k_token", token), admin); await adminPage.reload(); await adminPage.getByRole("heading", { name: "帖子管理", exact: true }).waitFor(); await adminPage.getByRole("button", { name: "评论审核", exact: true }).click(); await adminPage.getByRole("button", { name: "通过评论", exact: true }).click(); await adminPage.getByRole("status").filter({ hasText: "评论已通过" }).waitFor();
  await adminPage.getByRole("button", { name: "社区设置", exact: true }).click(); await adminPage.getByLabel("社区公告", { exact: true }).fill("芯世界测试公告"); await adminPage.getByRole("button", { name: "保存社区设置", exact: true }).click(); await adminPage.getByRole("status").filter({ hasText: "社区设置已保存" }).waitFor();
  await page.reload(); await page.locator(".chip-comments article").waitFor(); assert.match(await page.locator(".chip-comments h3").innerText(), /1/); await page.getByText("芯世界测试公告", { exact: true }).waitFor();
  const guest = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage(); guest.on("pageerror", (error) => errors.push(error.message)); await guest.goto(origin + "/xinsj"); await guest.locator(".chip-post").first().waitFor();
  for (const width of [390, 320]) { await guest.setViewportSize({ width, height: 844 }); await shot(guest, `xinsj-mobile-${width}.png`); }
  await adminPage.setViewportSize({ width: 390, height: 844 }); await shot(adminPage, "xinsj-admin-mobile.png");
  assert.deepEqual(errors, []); console.log("芯世界 UI passed: responsive layouts, themes, search, login, moderated posts/comments, safe text, likes/saves, settings and admin.");
} catch (error) { const page = browser?.contexts()[0]?.pages()[0]; if (page) await page.screenshot({ path: path.join(output, "xinsj-failure.png"), fullPage: true }); throw error; }
finally { await browser?.close(); web.kill(); if (web.exitCode === null) await new Promise((resolve) => web.once("exit", resolve)); await api.close(); }
