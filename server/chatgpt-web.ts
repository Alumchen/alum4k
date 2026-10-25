import type { Page, Locator } from "playwright";

export class WebRelayError extends Error { constructor(public code: string, message: string) { super(message); } }
const editorSelector = 'textarea#prompt-textarea,#prompt-textarea[contenteditable="true"],#prompt-textarea [contenteditable="true"],textarea[data-testid="prompt-textarea"],[data-testid="prompt-textarea"][contenteditable="true"],textarea[data-testid="composer-input"],[data-testid="composer-input"][contenteditable="true"]';
const profileSelector = '[data-testid="accounts-profile-button"],[data-testid="profile-button"],[data-testid="profile-menu-button"],button[aria-label="Open profile menu"],button[aria-label="打开个人资料菜单"],button[aria-label="Open user menu"],button[aria-label="打开用户菜单"]';
const sendSelector = 'button[data-testid="send-button"],button[aria-label="Send prompt"],button[aria-label="发送提示"]';
const stopSelector = 'button[data-testid="stop-button"],button[aria-label="Stop streaming"],button[aria-label="停止流式传输"]';
const assistantSelector = '[data-message-author-role="assistant"]';
const userSelector = '[data-message-author-role="user"]';
export function conversationUrl(value: string) { try { const url = new URL(value); return url.origin === "https://chatgpt.com" && /^\/c\/[a-zA-Z0-9-]{1,100}$/.test(url.pathname) ? url.origin + url.pathname : ""; } catch { return ""; } }
function shown(locator: Locator) { return locator.filter({ visible: true }); }
function editors(page: Page) { return shown(page.locator(editorSelector)); }
function sendButton(page: Page) { return shown(page.locator(sendSelector)).first(); }
async function visible(locator: Locator) { return shown(locator).first().isVisible().catch(() => false); }
export interface ChatGptState { ready: boolean; code: string; message: string; diagnostics?: { editorCount: number; accountMarker: boolean; accountVisible: boolean; documentReady: string }; }
export async function inspectChatGpt(page: Page): Promise<ChatGptState> {
  const fail = (code: string, message: string): ChatGptState => ({ ready: false, code, message });
  if (!page.url().startsWith("https://chatgpt.com/")) return fail("LOGIN_REQUIRED", "请本人完成 ChatGPT 网页登录。");
  if (await visible(page.locator('iframe[src*="challenges.cloudflare.com"],iframe[title*="challenge"],iframe[title*="验证码"]')) || await visible(page.getByText(/verify you are human|checking your browser|验证您是真人|确认您是真人/i))) return fail("VERIFY_REQUIRED", "网站要求本人完成验证，程序已暂停。");
  if (await visible(page.getByRole("alert").filter({ hasText: /limit|too many|限制|上限|频繁/i }))) return fail("WEBSITE_LIMITED", "网页提示使用限制，请稍后自行重试。");
  if (await visible(page.locator('[data-testid="login-button"],a[href*="/auth/login"]')) || await visible(page.getByRole("button", { name: /^(Log in|登录)$/i }))) return fail("LOGIN_REQUIRED", "ChatGPT 网页账号未登录或登录已失效。");
  const profile = page.locator(profileSelector);
  const editorCount = await editors(page).count();
  const diagnostics = { editorCount, accountMarker: await profile.count() > 0, accountVisible: await visible(profile), documentReady: await page.evaluate(() => document.readyState) };
  if (!editorCount) return { ...fail("EDITOR_NOT_FOUND", "未找到可见的 ChatGPT 输入框。请检查服务器网页是否加载完成，或是否有弹窗遮挡。"), diagnostics };
  if (editorCount !== 1) return { ...fail("EDITOR_AMBIGUOUS", "发现多个 ChatGPT 输入框，无法确认应使用哪一个。"), diagnostics };
  if (!await editors(page).first().isEditable()) return { ...fail("EDITOR_NOT_READY", "ChatGPT 输入框尚不可编辑，请等待服务器网页加载完成。"), diagnostics };
  if (diagnostics.documentReady !== "complete") return { ...fail("PAGE_LOADING", "ChatGPT 网页仍在加载，请稍后检查连接。"), diagnostics };
  // Account controls can remain in the DOM while their sidebar is collapsed.
  // Still require an explicit account marker: an anonymous editor alone is not enough.
  if (!diagnostics.accountMarker) return { ...fail("ACCOUNT_UNCONFIRMED", "已找到 ChatGPT 输入框，但未识别到账号菜单。请在服务器账号窗口展开侧栏或账号菜单后检查连接。"), diagnostics };
  return { ready: true, code: "READY", message: "网页账号可用", diagnostics };
}
export async function waitChatGptReady(page: Page, options: { signal?: AbortSignal; timeoutMs?: number; pollMs?: number } = {}): Promise<ChatGptState> {
  const until = Date.now() + (options.timeoutMs ?? 20000);
  const transient = new Set(["PAGE_LOADING", "EDITOR_NOT_FOUND", "EDITOR_NOT_READY", "ACCOUNT_UNCONFIRMED"]);
  while (true) {
    if (options.signal?.aborted) throw new WebRelayError("CANCELLED", "已停止检查网页。");
    const state = await inspectChatGpt(page);
    if (state.ready || !transient.has(state.code) || Date.now() >= until) return state;
    await new Promise(resolve=>setTimeout(resolve, options.pollMs ?? 250));
  }
}
export async function sendChatGpt(page: Page, prompt: string, options: {
  signal: AbortSignal; onText: (text: string) => void; onSubmitted: (url: string) => Promise<void>;
  timeoutMs?: number; pollMs?: number;
  images?: Array<{ name: string; mimeType: string; buffer: Buffer }>;
}): Promise<{ text: string; remoteUrl: string }> {
  const checkAbort = () => { if (options.signal.aborted) throw new WebRelayError("CANCELLED", "已停止等待；已提交的问题不会自动重发。"); };
  checkAbort(); const state = await inspectChatGpt(page); if (!state.ready) throw new WebRelayError(state.code, state.message);
  if (await visible(page.locator(stopSelector))) throw new WebRelayError("WEBSITE_BUSY", "网页正在生成其他回复，请稍后再提问。");
  const editor = editors(page).first(); const draft = await editor.evaluate((element) => element instanceof HTMLTextAreaElement ? element.value : (element as HTMLElement).innerText);
  if (draft.trim()) throw new WebRelayError("DRAFT_PRESENT", "网页输入框中已有未发送内容，程序没有覆盖，请本人先处理。");
  const usersBefore = await page.locator(userSelector).count(); const assistantsBefore = await page.locator(assistantSelector).count();
  let submitted = false; let confirmed = false; let lastText = ""; let changedAt = Date.now(); let boundUrl = "";
  try {
    if (options.images?.length) {
      const count = await page.locator('input[type="file"]').count();
      if (count !== 1) throw new WebRelayError("UPLOAD_UNAVAILABLE", "无法唯一确认网页图片上传入口，问题未发送。");
      await page.locator('input[type="file"]').setInputFiles(options.images, { timeout: 10000 });
      await page.locator('[data-testid="attachment-preview"],[data-testid="file-thumbnail"],[data-testid="file-upload-item"],img[src^="blob:"]').first().waitFor({ state: "visible", timeout: 20000 });
      for (let n = 0; n < 60 && !await sendButton(page).isEnabled(); n++) { checkAbort(); await new Promise(resolve=>setTimeout(resolve,500)); }
      checkAbort();
    }
    await editor.fill(prompt, { timeout: 8000 }); checkAbort();
    const send = sendButton(page); if (!await send.isVisible() || !await send.isEnabled()) throw new WebRelayError("PAGE_CHANGED", "未找到可用的网页发送按钮，问题未自动提交。");
    submitted = true; await options.onSubmitted("");
    // Exactly one click. Ambiguous submissions are never retried automatically.
    await send.click({ timeout: 8000 });
    const started = Date.now(); const maximum = options.timeoutMs ?? 180000;
    while (Date.now() - started < maximum) {
      checkAbort(); const state = await inspectChatGpt(page); if (!state.ready) throw new WebRelayError(state.code, state.message);
      if (!confirmed && await page.locator(userSelector).count() > usersBefore) {
        const sentText = await page.locator(userSelector).last().innerText();
        if (sentText.replace(/\s+/g, " ").trim() !== prompt.replace(/\s+/g, " ").trim()) throw new WebRelayError("CONVERSATION_CHANGED", "网页出现了不同的问题，已停止读取以防回复串线。");
        confirmed = true; boundUrl = conversationUrl(page.url()); await options.onSubmitted(boundUrl);
      }
      if (confirmed && (await page.locator(userSelector).count() !== usersBefore + 1 || (boundUrl && conversationUrl(page.url()) !== boundUrl))) throw new WebRelayError("CONVERSATION_CHANGED", "网页会话发生变化，已停止读取以防回复串线。");
      if (confirmed && await page.locator(assistantSelector).count() > assistantsBefore) {
        const response = page.locator(assistantSelector).last(); const markdown = response.locator(".markdown"); const body = await markdown.count() ? markdown.last() : response;
        if (await body.isVisible()) {
          const hasImage = await visible(response.locator("img")); const text = (await body.innerText()) || (hasImage ? "[图片回复]" : ""); if (text.length > 60000) throw new WebRelayError("REPLY_TOO_LONG", "回复超出本地保存长度，已停止读取。");
          if (text !== lastText) { lastText = text; changedAt = Date.now(); options.onText(text); }
          const finished = await visible(response.locator('button[data-testid="copy-turn-action-button"],button[aria-label="Copy"],button[aria-label="复制"],button[data-testid="download-image-button"],button[aria-label="Download image"],button[aria-label="下载图片"]'));
          if (text.trim() && finished && !await visible(page.locator(stopSelector)) && Date.now() - changedAt >= 1000) return { text, remoteUrl: conversationUrl(page.url()) };
        }
      }
      if (!confirmed && Date.now() - started > 20000) throw new WebRelayError("SUBMISSION_UNCONFIRMED", "无法确认网页是否收到问题，请先检查网页，不要重复提交。");
      await new Promise((resolve) => setTimeout(resolve, options.pollMs ?? 500));
    }
    throw new WebRelayError("TIMEOUT", "等待网页回复超时；问题可能已提交，程序不会自动重发。");
  } catch (error) {
    if (options.signal.aborted && confirmed && await visible(page.locator(stopSelector))) await shown(page.locator(stopSelector)).first().click({ timeout: 2000 }).catch(() => undefined);
    if (error instanceof WebRelayError) throw error;
    throw new WebRelayError(submitted ? "SUBMISSION_UNCONFIRMED" : "PAGE_CHANGED", submitted ? "网页连接中断，无法确认提交结果，请先检查网页，不要重复发送。" : "网页操作未完成，请检查账号或页面结构。");
  }
}
