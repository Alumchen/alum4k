import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Page } from "playwright";
import { adminPassword, freePort, magnetUrl, panUrl, projectRoot, startTestApi } from "./fixtures";

const api = await startTestApi();
const port = await freePort();
const web = spawn(process.execPath, [path.join(projectRoot, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  cwd: projectRoot, env: { ...process.env, API_ORIGIN: api.base }, windowsHide: true, stdio: "ignore"
});
const base = `http://127.0.0.1:${port}`;
const output = path.join(projectRoot, "artifacts/ui");
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const errors: string[] = [];
async function checkOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert.equal(overflow, false, `${label}: page overflows the viewport`);
}
try {
  await mkdir(output, { recursive: true });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(base)).ok) break; } catch { /* Wait for Vite. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(base);
  await page.locator(".media-card").first().waitFor();
  assert.equal(await page.getByPlaceholder("搜索影视名", { exact: true }).count(), 1);
  assert.equal(await page.locator(".nav-item").filter({ hasText: "VIP会员" }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "后台管理" }).count(), 0);
  assert.equal(await page.locator("video").count(), 0);
  await page.screenshot({ path: path.join(output, "home-desktop.png"), fullPage: true });
  await page.locator(".media-card").filter({ hasText: "验证电影" }).click();
  assert.equal(await page.getByRole("tab").count(), 2);
  assert.equal(await page.locator(".resource-url-line").count(), 0);
  await page.goto(base + "/admin");
  await page.getByRole("heading", { name: "管理员登录" }).waitFor();
  await page.getByLabel("用户名", { exact: true }).fill("admin");
  await page.getByLabel("密码", { exact: true }).fill(adminPassword);
  await page.getByRole("button", { name: "登录后台" }).click();
  await page.getByRole("heading", { name: "媒体库", exact: true }).waitFor();
  await page.locator(".admin-table tbody tr").first().waitFor();
  await checkOverflow(page, "admin desktop");
  await page.screenshot({ path: path.join(output, "admin-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "编辑验证电影", exact: true }).click();
  await page.getByRole("heading", { name: "编辑影视", exact: true }).waitFor();
  assert.equal(await page.getByLabel("115 网盘链接", { exact: true }).count(), 1);
  assert.equal(await page.getByLabel("磁力链接", { exact: true }).count(), 1);
  assert.equal(await page.getByText("AList", { exact: true }).count(), 0);
  await page.getByLabel("类型标签", { exact: true }).fill("动画");
  await page.getByRole("button", { name: "保存影视", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "已保存" }).waitFor();
  assert.equal(await page.getByLabel("分类", { exact: true }).inputValue(), "动漫");
  await page.getByRole("button", { name: "站点设置", exact: true }).click();
  await page.getByLabel("启用首页弹窗", { exact: true }).check();
  await page.getByLabel("公告标题", { exact: true }).fill("欢迎来到 Alum4K");
  await page.getByLabel("公告正文", { exact: true }).fill("这里是公告正文。\n管理员可以随时更新。<script>不会执行</script>");
  await page.getByRole("button", { name: "预览", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  assert.equal(await page.locator(".announcement-content script").count(), 0);
  await page.getByRole("button", { name: "我知道了" }).click();
  await page.getByRole("button", { name: "保存公告", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "公告已保存" }).waitFor();
  await page.goto(base);
  await page.getByRole("dialog").waitFor();
  await page.screenshot({ path: path.join(output, "announcement-desktop.png") });
  await page.getByRole("button", { name: "我知道了" }).click();
  await page.reload();
  await page.locator(".media-card").first().waitFor();
  assert.equal(await page.getByRole("dialog").count(), 0);
  await page.locator(".media-card").filter({ hasText: "验证电影" }).click();
  await page.getByRole("button", { name: "复制链接", exact: true }).click();
  await page.getByRole("button", { name: "已复制链接", exact: true }).waitFor();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), panUrl);
  await page.getByRole("tab", { name: /磁力链接/ }).click();
  await page.getByRole("button", { name: "复制链接", exact: true }).click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), magnetUrl);
  assert.equal(await page.locator("video").count(), 0);
  await page.screenshot({ path: path.join(output, "detail-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await checkOverflow(page, "detail mobile");
  await page.screenshot({ path: path.join(output, "detail-mobile.png"), fullPage: true });
  await page.goto(base + "/admin");
  await page.getByRole("heading", { name: "媒体库", exact: true }).waitFor();
  await checkOverflow(page, "admin mobile");
  await page.screenshot({ path: path.join(output, "admin-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "影视采集", exact: true }).click();
  await checkOverflow(page, "editor mobile");
  await page.screenshot({ path: path.join(output, "editor-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "用户 / VIP", exact: true }).click();
  await checkOverflow(page, "users mobile");
  await page.getByRole("button", { name: "站点设置", exact: true }).click();
  await checkOverflow(page, "settings mobile");
  await page.screenshot({ path: path.join(output, "settings-mobile.png"), fullPage: true });
  assert.deepEqual(errors, []);
  console.log("UI checks passed: admin login, resource tabs/copy, classification, announcement, desktop/mobile layout.");
  console.log(`Screenshots: ${output}`);
} finally {
  await browser?.close();
  if (web.exitCode === null) { const ended = new Promise<void>((resolve) => web.once("exit", () => resolve())); web.kill(); await ended; }
  await api.close();
}
