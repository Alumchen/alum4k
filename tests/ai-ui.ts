import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Page } from "playwright";
import { startTestApi, freePort, projectRoot, adminPassword } from "./fixtures";
import { startAiFixture } from "./ai-fixtures";

const fixture = await startAiFixture(); const api = await startTestApi(fixture.environment); const port = await freePort(); const origin = `http://127.0.0.1:${port}`; const output = path.join(projectRoot,"artifacts/ui");
const web = spawn(process.execPath,[path.join(projectRoot,"node_modules/vite/bin/vite.js"),"--host","127.0.0.1","--port",String(port),"--strictPort"],{cwd:projectRoot,env:{...process.env,API_ORIGIN:api.base},windowsHide:true,stdio:"ignore"});
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;const errors:string[]=[];
async function shot(page:Page,name:string){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,name+" overflows");await page.screenshot({path:path.join(output,name),fullPage:false});}
try{
  await mkdir(output,{recursive:true});for(let i=0;i<100;i++){try{if((await fetch(origin)).ok)break;}catch{}await new Promise((resolve)=>setTimeout(resolve,100));}
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();page.on("pageerror",error=>errors.push(error.message));page.on("dialog",dialog=>dialog.accept());
  await page.goto(origin+"/ai");await page.getByRole("heading",{name:"ChatGPT",exact:true}).waitFor();assert.match(await page.title(),/AlumAI/);assert.equal(await page.locator(".ai-brand img").evaluate(image=>(image as HTMLImageElement).naturalWidth>0),true);await shot(page,"ai-desktop.png");
  for(const width of [390,320]){await page.setViewportSize({width,height:844});await shot(page,`ai-mobile-${width}.png`);}await page.setViewportSize({width:1440,height:1000});
  await page.getByRole("button",{name:"切换深色",exact:true}).click();await shot(page,"ai-dark.png");await page.getByRole("button",{name:"切换浅色",exact:true}).click();
  await page.getByRole("button",{name:"登录后提问",exact:true}).click();await page.getByRole("dialog").getByLabel("用户名",{exact:true}).fill("admin");await page.getByRole("dialog").getByLabel("密码",{exact:true}).fill(adminPassword);await page.getByRole("dialog").getByRole("button",{name:"登录",exact:true}).click();await page.getByRole("button",{name:"账号登录 / 验证",exact:true}).click();
  await page.getByRole("status").filter({hasText:"已连接"}).waitFor();
  await page.waitForFunction(()=>{const canvas=document.querySelector<HTMLCanvasElement>(".ai-remote-surface canvas");if(!canvas||canvas.width<100)return false;const pixel=canvas.getContext("2d")!.getImageData(50,50,1,1).data;return pixel[0]>0&&pixel[1]>0&&pixel[3]>0;});
  await shot(page,"ai-test-remote-desktop.png");await page.getByRole("button",{name:"发送回车",exact:true}).click();for(let n=0;n<30&&!fixture.keys.includes(0xff0d);n++)await new Promise(resolve=>setTimeout(resolve,50));assert.ok(fixture.keys.includes(0xff0d));
  await page.getByRole("button",{name:"远程剪贴板",exact:true}).click();await page.getByLabel("发送文本",{exact:true}).fill("AlumAI 中文剪贴板测试");await page.getByRole("button",{name:"粘贴到远程窗口",exact:true}).click();await page.getByLabel("发送文本",{exact:true}).waitFor({state:"hidden"});assert.equal(fixture.requests.find(request=>request.path==="/clipboard")!.body.text,"AlumAI 中文剪贴板测试");
  await page.getByRole("button",{name:"远程剪贴板",exact:true}).click();await page.getByRole("button",{name:"读取远程剪贴板",exact:true}).click();await page.getByLabel("远程复制的文本",{exact:true}).waitFor();assert.equal(await page.getByLabel("远程复制的文本",{exact:true}).inputValue(),"AlumAI 中文剪贴板测试");await page.keyboard.press("Escape");await page.getByRole("dialog",{name:"远程剪贴板",exact:true}).waitFor({state:"hidden"});assert.equal(await page.getByRole("dialog",{name:"ChatGPT 账号登录 / 验证",exact:true}).count(),1);
  await page.getByRole("button",{name:"关闭账号窗口",exact:true}).click();await page.getByRole("button",{name:"账号登录 / 验证",exact:true}).waitFor();
  await page.goto(origin+"/ai/admin");await page.getByRole("heading",{name:"AI工具管理",exact:true}).waitFor();await shot(page,"ai-admin-desktop.png");
  await page.getByRole("button",{name:"添加工具",exact:true}).click();await page.getByLabel("工具名称",{exact:true}).fill("AI测试工具");await page.getByLabel("工具介绍",{exact:true}).fill("独立工具入口");await page.getByLabel("AI网站地址",{exact:true}).fill("https://example.com/ai");await page.getByRole("button",{name:"保存工具",exact:true}).click();await page.getByRole("status").filter({hasText:"设置已保存"}).waitFor();await page.getByRole("button",{name:"编辑 AI测试工具",exact:true}).click();await page.getByRole("switch",{name:"启用工具",exact:true}).uncheck();await page.getByRole("button",{name:"保存工具",exact:true}).click();await page.getByRole("status").filter({hasText:"设置已保存"}).waitFor();
  assert.equal((await(await fetch(api.base+"/api/ai")).json()).tools.some((tool:{name:string})=>tool.name==="AI测试工具"),false);
  await page.getByRole("button",{name:"访问设置",exact:true}).click();await page.getByLabel("使用说明",{exact:true}).fill("只供本人使用，退出时关闭浏览器。");await page.getByRole("button",{name:"保存访问设置",exact:true}).click();await page.getByRole("status").filter({hasText:"设置已保存"}).waitFor();await page.setViewportSize({width:390,height:844});await shot(page,"ai-admin-mobile.png");
  await page.getByRole("button",{name:"AI工具管理",exact:true}).click();await page.getByRole("button",{name:"删除 AI测试工具",exact:true}).click();await page.getByRole("status").filter({hasText:"设置已保存"}).waitFor();
  await page.goto(origin);await page.locator(".wb-app").filter({hasText:"AlumAI"}).getByRole("link",{name:"打开应用",exact:true}).click();assert.equal(new URL(page.url()).pathname,"/ai");
  assert.deepEqual(errors,[]);console.log("AlumAI UI passed: desktop/mobile, themes, login, authenticated noVNC test frame, nonblank canvas, remote key input, clipboard controls, tools CRUD, visibility, settings and workbench entry. Real Docker/ChatGPT login is not part of this fixture.");
}catch(error){const page=browser?.contexts()[0]?.pages()[0];if(page)await page.screenshot({path:path.join(output,"ai-failure.png"),fullPage:true});throw error;}
finally{await browser?.close();web.kill();if(web.exitCode===null)await new Promise(resolve=>web.once("exit",resolve));await api.close();await fixture.close();}
