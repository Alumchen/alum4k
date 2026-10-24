import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Page } from "playwright";
import { adminPassword, freePort, projectRoot, startTestApi } from "./fixtures";

const api = await startTestApi(); const port = await freePort();
const web = spawn(process.execPath, [path.join(projectRoot, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: projectRoot, env: { ...process.env, API_ORIGIN: api.base }, windowsHide: true, stdio: "ignore" });
const origin = `http://127.0.0.1:${port}`; const output = path.join(projectRoot, "artifacts/ui");
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined; const errors: string[] = [];
async function overflow(page: Page) { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false); }
async function screenshot(page: Page, name: string) { await overflow(page); await page.screenshot({ path: path.join(output, name), fullPage: true }); }
try {
  await mkdir(output, { recursive: true });
  for (let attempt = 0; attempt < 100; attempt++) { try { if ((await fetch(origin)).ok) break; } catch { /* Wait for Vite. */ } await new Promise((resolve) => setTimeout(resolve, 100)); }
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin); await page.locator(".wb-app").waitFor();
  assert.equal(await page.title(), "Alum 工作台"); assert.equal(await page.locator(".blog-app, .blog-post-row").count(), 0);
  assert.equal(await page.locator(".wb-app-logo").evaluate((image) => (image as HTMLImageElement).naturalWidth > 0), true);
  await screenshot(page, "workbench-desktop.png");
  await page.getByRole("button", { name: "切换深色", exact: true }).click();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
  await screenshot(page, "workbench-dark.png"); await page.reload(); await page.locator(".wb-app").waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
  await page.getByRole("button", { name: "切换浅色", exact: true }).click();
  await page.getByRole("button", { name: "取消常用 Alum4K", exact: true }).click();
  await page.getByRole("button", { name: "我的常用" }).click(); await page.getByText("还没有常用应用。", { exact: true }).waitFor();
  await page.getByRole("button", { name: "查看全部应用" }).click();
  await page.getByRole("button", { name: "设为常用 Alum4K", exact: true }).click();
  await page.getByLabel("搜索应用", { exact: true }).fill("no-matching-module"); await page.getByText("没有找到匹配的应用。", { exact: true }).waitFor();
  await page.getByRole("button", { name: "清除搜索", exact: true }).click();
  await page.getByRole("link", { name: "打开应用", exact: true }).click();
  assert.equal(new URL(page.url()).pathname, "/yingshi"); await page.locator(".media-card").first().waitFor();
  await page.getByRole("link", { name: "返回工作台", exact: true }).click();
  await page.getByRole("heading", { name: "最近访问", exact: true }).waitFor();
  await page.getByRole("button", { name: "清空", exact: true }).click(); assert.equal(await page.locator(".wb-recent").count(), 0);
  for (const width of [390, 320]) { await page.setViewportSize({ width, height: 844 }); await screenshot(page, `workbench-mobile-${width}.png`); }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin + "/admin"); await page.getByRole("heading", { name: "管理员登录", exact: true }).waitFor();
  assert.match(await page.locator('meta[name="robots"]').getAttribute("content") || "", /noindex/);
  await page.getByLabel("密码", { exact: true }).fill(adminPassword); await page.getByRole("button", { name: "登录后台", exact: true }).click();
  await page.getByRole("heading", { name: "模块管理", exact: true }).waitFor();
  await page.getByLabel("模块名称", { exact: true }).fill("Alum4K 影视"); await page.getByLabel("显示顺序", { exact: true }).fill("3");
  await page.getByRole("button", { name: "保存修改", exact: true }).click(); await page.getByRole("status").filter({ hasText: "设置已保存" }).waitFor();
  await screenshot(page, "workbench-admin-desktop.png");
  await page.getByRole("button", { name: "工作台设置", exact: true }).click(); await page.getByLabel("工作台名称", { exact: true }).fill("Alum 工作空间");
  await page.getByRole("button", { name: "保存修改", exact: true }).click(); await page.getByRole("status").filter({ hasText: "设置已保存" }).waitFor();
  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } }); const guest = await guestContext.newPage();
  guest.on("pageerror", (error) => errors.push(error.message));
  await guest.goto(origin); await guest.locator(".wb-app").waitFor(); assert.equal(await guest.title(), "Alum 工作空间");
  assert.equal(await guest.locator(".wb-app h3").innerText(), "Alum4K 影视");
  await page.getByRole("button", { name: "模块管理", exact: true }).click(); await page.getByRole("switch", { name: "启用模块", exact: true }).uncheck();
  await page.getByRole("button", { name: "保存修改", exact: true }).click(); await page.getByRole("status").filter({ hasText: "设置已保存" }).waitFor();
  await guest.reload(); await guest.getByText("暂无已启用的应用。", { exact: true }).waitFor();
  assert.equal((await fetch(api.base + "/yingshi")).status, 503);
  await screenshot(guest, "workbench-disabled-mobile.png");
  await page.getByRole("switch", { name: "启用模块", exact: true }).check();
  await page.getByRole("button", { name: "保存修改", exact: true }).click(); await page.getByRole("status").filter({ hasText: "设置已保存" }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 }); await screenshot(page, "workbench-admin-mobile.png");
  await page.getByRole("link", { name: "模块后台", exact: true }).click(); await page.getByRole("button", { name: "站点设置", exact: true }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/yingshi/admin"); assert.equal(await page.getByRole("heading", { name: "模块管理", exact: true }).count(), 0);
  await page.getByRole("link", { name: "返回工作台管理", exact: true }).click(); await page.getByRole("heading", { name: "模块管理", exact: true }).waitFor();
  await guest.goto(origin + "/yingshi/movie/test-movie"); await guest.getByRole("heading", { name: "验证电影", exact: true }).waitFor();
  assert.equal(await guest.getByText("登录后可查看此链接", { exact: true }).count() > 0, true);
  await guestContext.close(); assert.deepEqual(errors, []);
  console.log("Workbench UI passed: application entry, search/favorites/recent, theme persistence, desktop/320/390 layouts, settings, module disable/enable and both admin entries.");
} catch (error) { const page = browser?.contexts()[0]?.pages()[0]; if (page) await page.screenshot({ path: path.join(output, "workbench-failure.png"), fullPage: true }); throw error; }
finally { await browser?.close(); if (web.exitCode === null) { const ended = new Promise<void>((resolve) => web.once("exit", () => resolve())); web.kill(); await ended; } await api.close(); }
