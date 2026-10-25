import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { startTestApi, freePort, projectRoot, adminPassword } from "./fixtures";
import { startAiFixture } from "./ai-fixtures";
import { relayFixture } from "./ai-relay-fixture";

const profile = await mkdtemp(path.join(tmpdir(), "alumai-relay-test-")); const cdpPort = await freePort();
const remote = await chromium.launchPersistentContext(profile, { headless: true, args: [`--remote-debugging-port=${cdpPort}`], ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
await remote.route("https://chatgpt.com/**", (route) => route.fulfill({ contentType: "text/html; charset=utf-8", body: relayFixture }));
const control = remote.pages()[0]; await control.goto("https://chatgpt.com/");
const fixture = await startAiFixture({ cdpPort }); const api = await startTestApi(fixture.environment);
const port = await freePort(); const origin = `http://127.0.0.1:${port}`; const output = path.join(projectRoot, "artifacts/ui");
const web = spawn(process.execPath, [path.join(projectRoot,"node_modules/vite/bin/vite.js"),"--host","127.0.0.1","--port",String(port),"--strictPort"], { cwd: projectRoot, env: { ...process.env, API_ORIGIN: api.base }, windowsHide: true, stdio: "ignore" });
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
const page = await browser.newPage({ viewport: { width:1440,height:1000 } }); const errors:string[]=[]; page.on("pageerror",(error)=>errors.push(error.message));page.on("dialog",(dialog)=>dialog.accept());
async function req(url:string,method="GET",body?:unknown,auth?:string) { const response=await fetch(api.base+url,{method,headers:{...(body?{"content-type":"application/json"}:{}),...(auth?{authorization:`Bearer ${auth}`}:{})},body:body?JSON.stringify(body):undefined});return{status:response.status,body:await response.json()}; }
async function waitDone(id:string,auth:string) { for(let n=0;n<80;n++){const chat=(await req("/api/ai/chats/"+id,"GET",undefined,auth)).body.item;if(!chat.messages.some((m:{status:string})=>m.status==="pending"))return chat;await new Promise(r=>setTimeout(r,200));}throw Error("Relay test timed out"); }
async function shot(name:string){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:path.join(output,name),fullPage:false});}
try {
  await mkdir(output,{recursive:true});for(let n=0;n<100;n++){try{if((await fetch(origin)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  const admin=(await req("/api/auth/login","POST",{username:"admin",password:adminPassword})).body.token;
  assert.equal((await req("/api/ai/chats")).status,401);
  await page.goto(origin+"/ai");await page.getByRole("button",{name:"登录后提问",exact:true}).click();await page.getByRole("dialog").getByLabel("用户名",{exact:true}).fill("admin");await page.getByRole("dialog").getByLabel("密码",{exact:true}).fill(adminPassword);await page.getByRole("dialog").getByRole("button",{name:"登录",exact:true}).click();
  await page.getByRole("button",{name:"检查网页连接",exact:true}).click();await page.getByRole("status").filter({hasText:"网页账号可用"}).waitFor();
  await page.getByLabel("输入问题",{exact:true}).fill("光刻工艺交流测试");await page.getByRole("button",{name:"发送问题",exact:true}).click();
  await page.locator(".ai-message-row.assistant").getByText("测试网页回复：光刻工艺交流测试",{exact:false}).waitFor();await page.getByRole("button",{name:"发送问题",exact:true}).waitFor();
  assert.equal(await page.locator(".ai-remote-surface").count(),0);
  const summaries=(await req("/api/ai/chats","GET",undefined,admin)).body.items;const id=summaries[0].id;const chat=await waitDone(id,admin);assert.equal(chat.messages.at(-1).status,"complete", JSON.stringify(chat.messages.at(-1)));assert.ok(!JSON.stringify(chat).includes("remoteUrl"));
  assert.ok(chat.messages.at(-1).presentation.snapshot);assert.equal(chat.messages.at(-1).presentation.images.length,1);
  await page.locator('.ai-private-image.snapshot img').waitFor();await page.waitForFunction(()=>{const img=document.querySelector<HTMLImageElement>('.ai-private-image.snapshot img');return !!img&&img.naturalWidth>100;});await shot("ai-relay-chat-desktop.png");
  await page.getByRole("button",{name:"排版",exact:true}).click();assert.equal(await page.locator('.ai-rich-document table').count(),1);assert.equal(await page.locator('.ai-rich-document pre code').count(),1);await page.locator('.ai-rich-document img').waitFor();await shot("ai-relay-rich-desktop.png");
  const first=chat.messages[0];const before=await control.evaluate(()=>Number(localStorage.getItem("fixture-sends")));
  assert.equal((await req(`/api/ai/chats/${id}/messages`,"POST",{text:first.text,requestId:first.requestId},admin)).status,200);assert.equal(await control.evaluate(()=>Number(localStorage.getItem("fixture-sends"))),before);
  await page.getByLabel("输入问题",{exact:true}).fill("继续这个对话");await page.getByRole("button",{name:"发送问题",exact:true}).click();await page.locator(".ai-message-row.assistant").last().getByText("测试网页回复：继续这个对话",{exact:false}).waitFor();await waitDone(id,admin);
  await page.reload();await page.getByRole("button",{name:"光刻工艺交流测试",exact:true}).click();await page.locator(".ai-message-row.assistant").last().getByRole("button",{name:"文字",exact:true}).click();await page.locator(".ai-message-row.assistant").last().getByText("测试网页回复：继续这个对话",{exact:false}).waitFor();
  await page.locator(".ai-message-row.assistant").last().getByRole("button",{name:"原貌",exact:true}).click();
  for(const width of [390,320]){await page.setViewportSize({width,height:844});await shot(`ai-relay-chat-mobile-${width}.png`);}
  const code=(await req("/api/admin/invitations","POST",undefined,admin)).body.item.code;const user=(await req("/api/auth/register","POST",{username:"relay_other",password:"test-password",invitationCode:code})).body.token;
  assert.equal((await req("/api/ai/chats/"+id,"GET",undefined,user)).status,403);
  let settings=(await req("/api/admin/ai","GET",undefined,admin)).body;await req("/api/admin/ai/settings","PUT",{settings:{...settings.settings,allowedUsers:["relay_other"]},revision:settings.revision},admin);
  assert.equal((await req("/api/ai/chats/"+id,"GET",undefined,user)).status,404);assert.equal((await req("/api/ai/chats","GET",undefined,user)).body.items.length,0);
  const imagePath=`/api/ai/chats/${id}/images/${chat.messages.at(-1).presentation.snapshot.id}`;
  assert.equal((await fetch(api.base+imagePath)).status,401);assert.equal((await fetch(api.base+imagePath,{headers:{authorization:`Bearer ${user}`}})).status,404);const imageResponse=await fetch(api.base+imagePath,{headers:{authorization:`Bearer ${admin}`}});assert.equal(imageResponse.status,200);assert.equal(imageResponse.headers.get('content-type'),'image/png');const png=Buffer.from(await imageResponse.arrayBuffer());
  await page.getByRole('button',{name:'新建对话',exact:true}).click();await page.getByLabel('选择提问图片',{exact:true}).setInputFiles({name:'测试截图.png',mimeType:'image/png',buffer:png});await page.getByLabel('输入问题',{exact:true}).fill('分析上传图片');await page.getByRole('button',{name:'发送问题',exact:true}).click();await page.locator('.ai-message-row.assistant').getByText('测试网页回复：分析上传图片',{exact:false}).waitFor();const imageChat=(await req('/api/ai/chats','GET',undefined,admin)).body.items[0];const imageDone=await waitDone(imageChat.id,admin);assert.equal(imageDone.messages[0].images.length,1);assert.equal(await control.evaluate(()=>localStorage.getItem('fixture-upload-count')),'1');
  const invalid=await req(`/api/ai/chats/${imageChat.id}/messages`,'POST',{text:'bad',requestId:crypto.randomUUID(),images:[{name:'bad.png',mime:'image/png',base64:Buffer.from('<svg onload="alert(1)"></svg>').toString('base64')}]},admin);assert.equal(invalid.status,400);
  assert.equal((await req(`/api/ai/chats/${imageChat.id}/messages`,'POST',{text:imageDone.messages[0].text,requestId:imageDone.messages[0].requestId,images:[{name:'不同的图片.png',mime:'image/png',base64:png.toString('base64')}]},admin)).status,409);
  const imageOnly=(await req('/api/ai/chats','POST',{toolId:'chatgpt'},admin)).body.item;await req(`/api/ai/chats/${imageOnly.id}/messages`,'POST',{text:'只返回图片',requestId:crypto.randomUUID()},admin);const imageOnlyDone=await waitDone(imageOnly.id,admin);assert.equal(imageOnlyDone.messages.at(-1).status,'complete');assert.equal(imageOnlyDone.messages.at(-1).presentation.images.length,1);assert.ok(imageOnlyDone.messages.at(-1).presentation.snapshot);
  for(const state of ["login","verify","old"]){await control.evaluate(state=>localStorage.setItem("fixture-state",state),state);const created=(await req("/api/ai/chats","POST",{toolId:"chatgpt"},admin)).body.item;const sent=await req(`/api/ai/chats/${created.id}/messages`,"POST",{text:"不得误取旧回复",requestId:crypto.randomUUID()},admin);assert.equal(sent.status,202);const failed=await waitDone(created.id,admin);assert.equal(failed.messages.at(-1).status,"error");assert.equal(failed.messages.at(-1).text,"");assert.ok(["LOGIN_REQUIRED","VERIFY_REQUIRED","PAGE_CHANGED"].includes(failed.messages.at(-1).code));}
  await control.evaluate(()=>localStorage.setItem("fixture-state","ready"));const limited=(await req("/api/ai/chats","POST",{toolId:"chatgpt"},admin)).body.item;await req(`/api/ai/chats/${limited.id}/messages`,"POST",{text:"限流测试",requestId:crypto.randomUUID()},admin);assert.equal((await waitDone(limited.id,admin)).messages.at(-1).code,"WEBSITE_LIMITED");
  await control.evaluate(()=>localStorage.setItem("fixture-state","ready"));const slow=(await req("/api/ai/chats","POST",{toolId:"chatgpt"},admin)).body.item;await req(`/api/ai/chats/${slow.id}/messages`,"POST",{text:"长时间任务",requestId:crypto.randomUUID()},admin);await new Promise(r=>setTimeout(r,500));assert.equal((await req(`/api/ai/chats/${slow.id}/messages`,"POST",{text:"不能并发",requestId:crypto.randomUUID()},admin)).status,409);await req(`/api/ai/chats/${slow.id}/cancel`,"POST",undefined,admin);assert.equal((await waitDone(slow.id,admin)).messages.at(-1).status,"cancelled");
  assert.deepEqual(errors,[]);console.log("Web relay passed against local contract pages through real CDP: question submission, new-response extraction, private history, follow-up context, idempotency, cancellation, login/verification/layout failures, and text-only desktop/mobile UI. No real ChatGPT login or reply was used.");
} catch(error){await page.screenshot({path:path.join(output,"ai-relay-failure.png"),fullPage:true});throw error;}
finally{await browser.close();web.kill();if(web.exitCode===null)await new Promise(r=>web.once("exit",r));await api.close();await fixture.close();await remote.close();if(!path.resolve(profile).startsWith(path.resolve(tmpdir())+path.sep+"alumai-relay-test-"))throw Error("Invalid test profile");await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
