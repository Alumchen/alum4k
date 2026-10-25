import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import WebSocket from "ws";
import { startTestApi, adminPassword } from "./fixtures";
import { startAiFixture } from "./ai-fixtures";
import { aiTarget } from "../shared/ai";
import { browserArgs, validOwner, publicTarget, BrowserRuntime, createRuntimeServer } from "../scripts/ai-runtime.mjs";
import { addPublicPageLocations } from "../scripts/public-pages.mjs";

let fixture: Awaited<ReturnType<typeof startAiFixture>>; let api: Awaited<ReturnType<typeof startTestApi>>; let admin:string; let user:string; let other:string;
async function req(url:string,method="GET",body?:unknown,token?:string){const response=await fetch(api.base+url,{method,headers:{...(body?{"content-type":"application/json"}:{}),...(token?{authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});return{status:response.status,body:await response.json(),cookie:response.headers.get("set-cookie")};}
before(async()=>{fixture=await startAiFixture();api=await startTestApi(fixture.environment);admin=(await req("/api/auth/login","POST",{username:"admin",password:adminPassword})).body.token;for(const name of ["ai_member","ai_other"]){const code=(await req("/api/admin/invitations","POST",undefined,admin)).body.item.code;const result=await req("/api/auth/register","POST",{username:name,password:"test-password",invitationCode:code});if(name==="ai_member")user=result.body.token;else other=result.body.token;}});
after(async()=>{await api.close();await fixture.close();});
function socket(pathname:string,cookie?:string,origin=api.base){return new Promise<number>((resolve,reject)=>{const ws=new WebSocket(api.base.replace("http:","ws:")+pathname,{origin,headers:cookie?{cookie}:undefined});ws.once("open",()=>{ws.close();resolve(101);});ws.once("unexpected-response",(_request,response)=>{response.resume();resolve(response.statusCode!);});ws.once("error",reject);});}

test("AlumAI has independent entries, requires authentication and does not grant registered users remote access",async()=>{
  for(const target of ["/ai","/ai/admin"]){const result=await fetch(api.base+target);const html=await result.text();assert.equal(result.status,200);assert.match(html,/AlumAI/);assert.match(html,/noindex, nofollow/);}
  const catalog=await req("/api/ai");assert.equal(catalog.body.tools[0].name,"ChatGPT");assert.equal(catalog.body.canUse,false);assert.equal(catalog.body.settings.allowedUsers,undefined);assert.ok(!JSON.stringify(catalog.body).includes(fixture.environment.AI_RUNTIME_TOKEN));
  assert.equal((await req("/api/admin/ai")).status,401);assert.equal((await req("/api/admin/ai","GET",undefined,user)).status,403);
  assert.equal((await req("/api/ai/sessions","POST",{toolId:"chatgpt"})).status,401);assert.equal((await req("/api/ai/sessions","POST",{toolId:"chatgpt"},user)).status,403);
  assert.equal((await req("/api/ai","GET",undefined,admin)).body.runtime.ready,true);
  assert.equal((await req("/api/workbench")).body.plugins.find((plugin:{id:string})=>plugin.id==="alumai").adminEntry,"/ai/admin");
});

test("AI tools CRUD, safe destinations, optimistic revisions and only existing trusted accounts",async()=>{
  for(const url of ["javascript:alert(1)","http://example.com","https://127.0.0.1","https://[::1]","https://localhost","https://a.internal","https://user:pass@example.com","https://example.com:5188"] )assert.throws(()=>aiTarget(url));
  let store=(await req("/api/admin/ai","GET",undefined,admin)).body;
  const tool={name:"AI测试",description:"自定义工具",url:"https://example.com/ai",enabled:false,order:8};
  for(const url of ["javascript:alert(1)","https://127.0.0.1"] )assert.equal((await req("/api/admin/ai/tools","POST",{item:{...tool,url},revision:store.revision},admin)).status,400);
  store=(await req("/api/admin/ai/tools","POST",{item:tool,revision:store.revision},admin)).body;const item=store.tools.find((tool: {name:string})=>tool.name==="AI测试");assert.ok(item.id);
  assert.equal((await req("/api/ai")).body.tools.some((tool:{id:string})=>tool.id===item.id),false);
  assert.equal((await req("/api/admin/ai/tools/"+item.id,"PUT",{item,revision:0},admin)).status,409);
  store=(await req("/api/admin/ai/tools/"+item.id,"DELETE",{revision:store.revision},admin)).body;
  assert.equal((await req("/api/admin/ai/settings","PUT",{settings:{...store.settings,allowedUsers:["not_registered"]},revision:store.revision},admin)).status,400);
  store=(await req("/api/admin/ai/settings","PUT",{settings:{...store.settings,allowedUsers:["ai_member"]},revision:store.revision},admin)).body;assert.equal((await req("/api/ai","GET",undefined,user)).body.canUse,true);
  assert.ok(await readFile(path.join(api.directory,"data/ai/settings.json.bak")));assert.equal(JSON.parse(await readFile(path.join(api.directory,"data/ai/settings.json"),"utf8")).revision,store.revision);
});

test("Remote WebSockets require owner cookie, live permissions and same origin; upstream receives no website credentials",async()=>{
  const a=await req("/api/ai/sessions","POST",{toolId:"chatgpt"},admin);assert.equal(a.status,201);assert.match(a.cookie!,/HttpOnly/);assert.match(a.cookie!,/SameSite=Strict/);assert.equal(a.body.port,undefined);assert.ok(!JSON.stringify(a.body).includes(admin));
  const cookieA=a.cookie!.split(";")[0];const b=await req("/api/ai/sessions","POST",{toolId:"claude"},user);assert.equal(b.status,201);const cookieB=b.cookie!.split(";")[0];
  assert.notEqual(fixture.requests.filter((request)=>request.path==="/start").at(-1)!.body.owner,fixture.requests.filter((request)=>request.path==="/start").at(-2)!.body.owner);
  assert.equal(await socket(a.body.websocketPath),403);assert.equal(await socket(a.body.websocketPath,cookieB),403);assert.equal(await socket(a.body.websocketPath,cookieA,"https://evil.example"),403);
  assert.equal((await req("/api/ai/sessions/"+a.body.id+"/lease","POST",undefined,user)).status,404);
  assert.equal((await req("/api/ai/sessions/"+a.body.id+"/clipboard","POST",{text:"拒绝越权"},user)).status,404);
  assert.equal((await req("/api/ai/sessions/"+b.body.id+"/clipboard","POST",{text:"中文工艺问题：光刻与刻蚀"},user)).status,200);
  assert.equal((await req("/api/ai/sessions/"+b.body.id+"/clipboard/read","POST",undefined,user)).body.text,"中文工艺问题：光刻与刻蚀");
  assert.equal(await socket(a.body.websocketPath,cookieA),101);assert.equal(fixture.connections.at(-1)!.cookies,undefined);assert.equal(fixture.connections.at(-1)!.authorization,undefined);
  assert.equal((await req("/api/ai/sessions/"+b.body.id+"/lease","POST",undefined,user)).status,200);
  await req("/api/ai/sessions","DELETE",undefined,admin);assert.equal(await socket(a.body.websocketPath,cookieA),403);
  assert.equal((await req("/api/ai/profile","DELETE",{confirm:"NO"},user)).status,400);assert.equal((await req("/api/ai/profile","DELETE",{confirm:"CLEAR"},user)).status,200);assert.equal(await socket(b.body.websocketPath,cookieB),403);
});

test("Runtime input validation, constrained Docker arguments and capacity are separate from website configuration",async()=>{
  assert.throws(()=>validOwner("../../etc"));const owner="a".repeat(64);const args=browserArgs(owner,"alumai-browser:1");assert.ok(args.includes("127.0.0.1::7900"));assert.ok(args.includes("--cap-drop=ALL"));assert.ok(!args.some((arg:string)=>arg.includes("docker.sock")));assert.ok(!args.includes("--privileged"));assert.throws(()=>browserArgs(owner,"--privileged"));
  assert.equal(await publicTarget("https://example.com",async()=>[{address:"8.8.8.8",family:4}]),"https://example.com/");
  for(const address of ["127.0.0.1","169.254.169.254","10.0.0.1","172.20.0.1","192.168.1.1","100.64.0.1","225.1.1.1"])await assert.rejects(publicTarget("https://example.com",async()=>[{address,family:4}]));
  const writes:Array<{args:string[];text:string}>=[];const runtime=new BrowserRuntime({maximum:1,run:async()=>({stdout:""}),input:async(args:string[],text:string)=>{writes.push({args,text});},resolve:async()=>[{address:"8.8.8.8",family:4}]});runtime.sessions.set(owner,{id:"first",owner,name:"alumai-"+owner,port:30000,touched:Date.now()});await assert.rejects(runtime.start("b".repeat(64),"https://example.com"),/名额/);assert.throws(()=>runtime.touch(owner,"wrong"));
  await runtime.clipboard(owner,"first","中文不会进入命令行");assert.equal(writes[0].text,"中文不会进入命令行");assert.ok(!writes[0].args.includes(writes[0].text));await assert.rejects(runtime.clipboard(owner,"wrong","x"));
  assert.throws(()=>createRuntimeServer(runtime,"short"));
});

test("Disabled plugin blocks new sessions and keeps the independent admin accessible",async()=>{
  const workbench=(await req("/api/admin/workbench","GET",undefined,admin)).body;await req("/api/admin/workbench","PUT",{...workbench,plugins:workbench.plugins.map((plugin:{id:string})=>({...plugin,enabled:plugin.id!=="alumai"}))},admin);
  assert.equal((await req("/api/ai")).status,503);assert.equal((await req("/api/ai/sessions","POST",{toolId:"chatgpt"},admin)).status,503);assert.equal((await fetch(api.base+"/ai")).status,503);assert.equal((await fetch(api.base+"/ai/admin")).status,200);assert.equal((await req("/api/admin/ai","GET",undefined,admin)).status,200);
});

test("Relay debugging stays on loopback and ensure reuses a browser without opening another tab",async()=>{
  const owner="c".repeat(64);const commands:string[][]=[];
  assert.ok(browserArgs(owner,"alumai-browser:1").includes("127.0.0.1::9223"));
  const runtime=new BrowserRuntime({run:async(args:string[])=>{commands.push(args);return{stdout:""};},resolve:async()=>[{address:"8.8.8.8",family:4}]});
  runtime.sessions.set(owner,{id:"test-relay",owner,name:"alumai-"+owner,port:30000,cdpPort:30001,touched:0});
  assert.equal((await runtime.start(owner,"https://chatgpt.com/",false)).cdpPort,30001);assert.equal(commands.length,0);
  await runtime.start(owner,"https://chatgpt.com/");assert.ok(commands[0].includes("--new-tab"));
  await runtime.stop(owner);assert.equal(runtime.sessions.size,0);assert.ok(commands.some(args=>args.includes("pkill")));assert.ok(commands.some(args=>args[0]==="stop"));assert.ok(!commands.some(args=>args[0]==="volume"));
});

test("AI deployment preserves the original public port and enables authenticated WebSocket forwarding",()=>{
  const source="server { listen 1023; server_name www.alum4k.com; root /opt/alum4k/dist; location /api/ { proxy_pass http://127.0.0.1:5174/api/; } }";
  const result=addPublicPageLocations(source);assert.match(result,/listen 1023;/);assert.match(result,/location \^~ \/ai\/remote\//);assert.match(result,/proxy_set_header Host \$http_host;/);assert.match(result,/proxy_set_header Upgrade \$http_upgrade;/);assert.match(result,/proxy_set_header Connection "upgrade";/);assert.match(result,/location \^~ \/api\/ai\//);
});

test("Missing browser runtime is reported honestly rather than simulating a successful login",async()=>{
  const isolated=await startTestApi();try{const response=await fetch(isolated.base+"/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({username:"admin",password:adminPassword})});const token=(await response.json()).token;
    const catalog=await(await fetch(isolated.base+"/api/ai",{headers:{authorization:`Bearer ${token}`}})).json();assert.equal(catalog.runtime.ready,false);assert.match(catalog.runtime.message,/尚未安装/);
    const session=await fetch(isolated.base+"/api/ai/sessions",{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${token}`},body:JSON.stringify({toolId:"chatgpt"})});assert.equal(session.status,503);
  }finally{await isolated.close();}
});
