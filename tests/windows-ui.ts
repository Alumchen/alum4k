import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Page } from "playwright";
import { startTestApi, freePort, projectRoot, adminPassword } from "./fixtures";

const api = await startTestApi(); const port = await freePort(); const origin = `http://127.0.0.1:${port}`; const output = path.join(projectRoot, "artifacts/ui");
const web = spawn(process.execPath, [path.join(projectRoot, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: projectRoot, env: { ...process.env, API_ORIGIN: api.base }, windowsHide: true, stdio: "ignore" });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined; const errors: string[] = [];
async function shot(page: Page, name: string, fullPage = true) { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, name + " overflows"); await page.screenshot({ path: path.join(output, name), fullPage }); }
try {
  await mkdir(output, { recursive: true }); for (let i = 0; i < 100; i++) { try { if ((await fetch(origin)).ok) break; } catch { /* Wait for Vite. */ } await new Promise((resolve) => setTimeout(resolve, 100)); }
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ["clipboard-read", "clipboard-write"] }); const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message)); page.on("dialog", (dialog) => dialog.accept());
  await page.goto(origin + "/windows"); await page.locator(".win-release").first().waitFor(); assert.match(await page.title(), /AlumWindows/);
  assert.equal(await page.locator(".win-brand img").evaluate((element) => (element as HTMLImageElement).naturalWidth > 0), true);
  assert.equal(await page.locator(".win-categories nav button").count(), 33);
  await page.locator(".win-release summary").first().click(); const first = page.locator(".win-release").first();
  const originalUrl = await first.locator(".win-download").first().getAttribute("href"); assert.ok(originalUrl?.startsWith("https://hellowindows.cn/link?"));
  await first.getByRole("button", { name: /^复制链接 / }).first().click(); assert.equal(await page.evaluate(() => navigator.clipboard.readText()), originalUrl);
  assert.ok((await first.locator(".win-file-info pre").innerText()).includes("SHA"));
  await shot(page, "windows-desktop.png");
  await page.getByRole("button", { name: "切换深色", exact: true }).click(); await shot(page, "windows-dark.png"); await page.reload(); await page.locator(".win-release").first().waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark"); await page.getByRole("button", { name: "切换浅色", exact: true }).click();
  await page.getByRole("button", { name: "Windows 7", exact: true }).click(); await page.getByRole("heading", { name: "Windows 7", exact: true }).waitFor(); assert.equal(await page.locator(".win-release").count(), 12);
  await page.getByLabel("筛选系统架构", { exact: true }).selectOption("64位"); assert.ok(await page.locator(".win-release").count() < 12);
  await page.getByLabel("搜索系统资源", { exact: true }).fill("not-a-real-resource"); await page.getByText("没有找到匹配的资源", { exact: true }).waitFor();
  await page.getByRole("button", { name: "清除搜索", exact: true }).click(); await page.getByRole("button", { name: "Windows11 version 26H2", exact: true }).click();
  await page.getByRole("button", { name: "全部展开", exact: true }).click(); assert.equal(await page.locator(".win-release[open]").count(), await page.locator(".win-release").count());
  for (const width of [390, 320]) { await page.setViewportSize({ width, height: 844 }); await shot(page, `windows-mobile-${width}.png`); }
  await page.goto(origin + "/windows/faq"); await page.getByRole("heading", { name: "常见问题", exact: true }).waitFor(); await shot(page, "windows-faq-mobile.png");
  await page.goto(origin + "/windows/admin"); await page.getByRole("heading", { name: "管理员登录", exact: true }).waitFor(); await page.getByLabel("密码", { exact: true }).fill(adminPassword); await page.getByRole("button", { name: "登录后台", exact: true }).click();
  await page.getByRole("heading", { name: "资源管理", exact: true }).waitFor(); await page.setViewportSize({ width: 1440, height: 1000 }); await shot(page, "windows-admin-desktop.png");
  await page.getByRole("button", { name: "新增资源", exact: true }).click(); await page.getByLabel("资源名称", { exact: true }).fill("Windows UI 测试资源");
  await page.getByLabel("系统架构", { exact: true }).fill("64位"); await page.getByLabel("文件信息与校验值", { exact: true }).fill("文件：test.iso\n大小：4 GB\nSHA256：ABC");
  await page.getByRole("button", { name: "添加下载链接", exact: true }).click(); await page.getByLabel("链接名称", { exact: true }).fill("测试入口"); await page.getByLabel("链接内容", { exact: true }).fill("https://example.com/test.iso?original=unchanged");
  await page.getByRole("button", { name: "保存资源", exact: true }).click(); await page.getByRole("status").filter({ hasText: "资源已保存" }).waitFor();
  await page.getByLabel("搜索资源", { exact: true }).fill("Windows UI 测试资源"); await page.getByRole("button", { name: "编辑 Windows UI 测试资源", exact: true }).click();
  await page.getByRole("switch", { name: "发布到前台", exact: true }).uncheck(); await page.getByRole("button", { name: "保存资源", exact: true }).click(); await page.getByRole("status").filter({ hasText: "资源已保存" }).waitFor();
  assert.equal((await (await fetch(api.base + "/api/windows")).json()).items.some((item: { title: string }) => item.title === "Windows UI 测试资源"), false);
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "导出", exact: true }).click(); assert.match((await download).suggestedFilename(), /AlumWindows/);
  const token = await page.evaluate(() => localStorage.getItem("alum4k_token")); const current = await (await fetch(api.base + "/api/admin/windows", { headers: { authorization: `Bearer ${token}` } })).json();
  const importPath = path.join(output, "windows-import-test.json"); await writeFile(importPath, JSON.stringify(current)); await page.locator('input[type="file"]').setInputFiles(importPath); await page.getByRole("dialog").getByRole("button", { name: "确认导入", exact: true }).click(); await page.getByRole("status").filter({ hasText: "资源已导入" }).waitFor();
  await page.getByRole("button", { name: "分类管理", exact: true }).click(); await page.getByLabel("分类列表（每行一个）", { exact: true }).fill(current.categories.join("\n") + "\n自定义分类"); await page.getByRole("button", { name: "保存分类", exact: true }).click(); await page.getByRole("status").filter({ hasText: "分类已保存" }).waitFor();
  await page.getByRole("button", { name: "站点设置", exact: true }).click(); await page.getByLabel("站点介绍", { exact: true }).fill("系统软件资料测试"); await page.getByRole("button", { name: "保存站点设置", exact: true }).click(); await page.getByRole("status").filter({ hasText: "站点设置已保存" }).waitFor();
  await page.getByRole("button", { name: "资源管理", exact: true }).click(); await page.getByLabel("搜索资源", { exact: true }).fill("Windows UI 测试资源"); await page.getByRole("button", { name: "删除 Windows UI 测试资源", exact: true }).click(); await page.getByRole("dialog").getByRole("button", { name: "确认删除", exact: true }).click(); await page.getByRole("status").filter({ hasText: "资源已删除" }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 }); await shot(page, "windows-admin-mobile.png"); await page.getByRole("link", { name: "返回工作台管理", exact: true }).click(); await page.getByRole("heading", { name: "模块管理", exact: true }).waitFor();
  await page.goto(origin); await page.locator('.wb-app').filter({ hasText: "AlumWindows" }).getByRole("link", { name: "打开应用", exact: true }).click(); assert.equal(new URL(page.url()).pathname, "/windows");
  assert.deepEqual(errors, []); console.log("Windows UI passed: source categories and links, copy, metadata, filters, theme, responsive layouts, independent admin, CRUD, publication, categories, settings, import/export and workbench integration.");
} catch (error) { const page = browser?.contexts()[0]?.pages()[0]; if (page) { await page.screenshot({ path: path.join(output, "windows-failure.png"), fullPage: true }); console.error((await page.locator("body").innerText()).slice(-2000)); } throw error; }
finally { await browser?.close(); if (web.exitCode === null) { const ended = new Promise<void>((resolve) => web.once("exit", () => resolve())); web.kill(); await ended; } await api.close(); }
