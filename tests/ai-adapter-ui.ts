import assert from "node:assert/strict";
import { chromium } from "playwright";
import { inspectChatGpt, sendChatGpt, waitChatGptReady, WebRelayError } from "../server/chatgpt-web";
import { relayFixture } from "./ai-relay-fixture";

const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
const page = await browser.newPage();
await page.route("https://chatgpt.com/**", route=>route.fulfill({ contentType:"text/html; charset=utf-8", body:relayFixture }));
async function reset() { await page.goto("https://chatgpt.com/"); await page.evaluate(()=>localStorage.clear()); await page.reload(); }
try {
  await reset(); assert.equal((await inspectChatGpt(page)).ready,true);
  await page.evaluate(()=>{
    const account=document.createElement("button");account.dataset.testid="profile-button";account.hidden=true;document.body.prepend(account);
    const editor=document.createElement("textarea");editor.dataset.testid="prompt-textarea";editor.hidden=true;document.body.prepend(editor);
    const send=document.createElement("button");send.dataset.testid="send-button";send.hidden=true;document.body.prepend(send);
    const stop=document.createElement("button");stop.dataset.testid="stop-button";stop.hidden=true;document.body.prepend(stop);
  });
  assert.equal((await inspectChatGpt(page)).ready,true);
  let reply="";const answer=await sendChatGpt(page,"隐藏副本测试",{signal:new AbortController().signal,onText:text=>{reply=text;},onSubmitted:async()=>{},timeoutMs:5000,pollMs:50});
  assert.match(answer.text,/隐藏副本测试/);assert.equal(reply,answer.text);assert.equal(await page.evaluate(()=>Number(localStorage.getItem("fixture-sends"))),1);
  await reset();await page.locator('[data-testid="accounts-profile-button"]').evaluate(element=>(element as HTMLElement).hidden=true);
  const collapsed=await inspectChatGpt(page);assert.equal(collapsed.ready,true);assert.equal(collapsed.diagnostics?.accountVisible,false);assert.equal(collapsed.diagnostics?.accountMarker,true);
  await reset();await page.locator('#prompt-textarea').evaluate(element=>{element.id="";element.setAttribute("data-testid","composer-input");});assert.equal((await inspectChatGpt(page)).ready,true);
  await reset();await page.locator('#prompt-textarea').evaluate(element=>{const input=document.createElement('div');input.id='prompt-textarea';input.contentEditable='true';input.setAttribute('role','textbox');input.style.minHeight='40px';element.replaceWith(input);});assert.equal((await inspectChatGpt(page)).ready,true);
  await reset();await page.locator('[data-testid="accounts-profile-button"]').evaluate(element=>element.remove());assert.equal((await inspectChatGpt(page)).code,"ACCOUNT_UNCONFIRMED");
  await page.evaluate(()=>{const login=document.createElement('button');login.dataset.testid='login-button';login.textContent='Log in';document.body.append(login);});assert.equal((await inspectChatGpt(page)).code,"LOGIN_REQUIRED");
  await reset();await page.locator('#prompt-textarea').evaluate(element=>element.remove());assert.equal((await waitChatGptReady(page,{timeoutMs:100,pollMs:20})).code,"EDITOR_NOT_FOUND");
  await reset();await page.locator('#prompt-textarea').evaluate(element=>{(element as HTMLElement).style.display='none';setTimeout(()=>{(element as HTMLElement).style.display='';},300);});assert.equal((await waitChatGptReady(page,{timeoutMs:2000,pollMs:30})).ready,true);
  await reset();await page.locator('#prompt-textarea').evaluate(element=>{(element as HTMLTextAreaElement).disabled=true;});assert.equal((await inspectChatGpt(page)).code,"EDITOR_NOT_READY");
  await reset();await page.evaluate(()=>{const input=document.createElement('textarea');input.dataset.testid='composer-input';document.body.append(input);});assert.equal((await inspectChatGpt(page)).code,"EDITOR_AMBIGUOUS");
  const cancelled=new AbortController();cancelled.abort();await assert.rejects(waitChatGptReady(page,{signal:cancelled.signal}),error=>error instanceof WebRelayError&&error.code==='CANCELLED');
  console.log("ChatGPT adapter contract checks passed: hidden duplicate controls, collapsed account marker, alternate editors, loading delay, disabled/ambiguous editors, anonymous login protection, one submission and cancellation. No real provider login was used.");
} finally { await browser.close(); }
