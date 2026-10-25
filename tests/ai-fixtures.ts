import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer } from "ws";
import type { AddressInfo } from "node:net";

// A deterministic test desktop, never used by the application or advertised as ChatGPT.
export async function startAiFixture(options: { cdpPort?: number } = {}) {
  const token = "isolated-ai-runtime-token-" + "x".repeat(32); const requests: Array<{ path: string; body: any }> = []; const connections: Array<{ cookies: unknown; authorization: unknown }> = []; const keys: number[] = [];
  const desktop = createServer((_request, response) => response.end("Test desktop only")); const ws = new WebSocketServer({ server: desktop, path: "/websockify" });
  ws.on("connection", (socket, request) => {
    socket.on("error", () => undefined);
    connections.push({ cookies: request.headers.cookie, authorization: request.headers.authorization });
    let stage = 0; let pending = Buffer.alloc(0); let sent = false; let shift = [16, 8, 0];
    socket.send(Buffer.from("RFB 003.008\n"));
    socket.on("message", (chunk) => {
      pending = Buffer.concat([pending, Buffer.from(chunk as Buffer)]);
      while (pending.length) {
        if (stage === 0) { if (pending.length < 12) return; pending = pending.subarray(12); socket.send(Buffer.from([1, 1])); stage = 1; }
        else if (stage === 1) { pending = pending.subarray(1); socket.send(Buffer.alloc(4)); stage = 2; }
        else if (stage === 2) { pending = pending.subarray(1); const name = Buffer.from("AlumAI test desktop"); const init = Buffer.alloc(24 + name.length); init.writeUInt16BE(960, 0); init.writeUInt16BE(600, 2); init.set([32,24,0,1],4); [8,10,12].forEach((offset) => init.writeUInt16BE(255, offset)); init.set([16,8,0],14); init.writeUInt32BE(name.length,20); name.copy(init,24); socket.send(init); stage = 3; }
        else {
          const type = pending[0]; const length = type === 0 ? 20 : type === 2 ? pending.length >= 4 ? 4 + pending.readUInt16BE(2) * 4 : 0 : type === 3 ? 10 : type === 4 ? 8 : type === 5 ? 6 : type === 6 ? pending.length >= 8 ? 8 + pending.readUInt32BE(4) : 0 : 0;
          if (!length || pending.length < length) return;
          if (type === 0) shift = [pending[14],pending[15],pending[16]];
          if (type === 4 && pending[1]) keys.push(pending.readUInt32BE(4));
          if (type === 3 && !sent) {
            sent = true; const frame = Buffer.alloc(16 + 960 * 600 * 4); frame.writeUInt16BE(1,2); frame.writeUInt16BE(960,8); frame.writeUInt16BE(600,10);
            for (let y=0;y<600;y++) for (let x=0;x<960;x++) { const color = ((Math.floor(x/80)+Math.floor(y/80))%2 ? 0x273c47 : 0x456e78); const red=(color>>16)&255, green=(color>>8)&255, blue=color&255; frame.writeUInt32LE(((red<<shift[0])|(green<<shift[1])|(blue<<shift[2]))>>>0,16+(y*960+x)*4); }
            socket.send(frame);
          }
          pending = pending.subarray(length);
        }
      }
    });
  });
  await new Promise<void>((resolve) => desktop.listen(0,"127.0.0.1",resolve)); const desktopPort = (desktop.address() as AddressInfo).port;
  const sessions = new Map<string,{id:string;port:number}>();
  const clipboards = new Map<string,string>();
  const runtime = createServer(async (request, response) => {
    response.setHeader("content-type","application/json"); if (request.headers.authorization !== "Bearer " + token) { response.writeHead(401).end("{}"); return; }
    if (request.url === "/health") { response.end(JSON.stringify({ready:true,relayVersion:1,active:sessions.size,maximum:2})); return; }
    let raw=""; for await (const chunk of request) raw+=chunk; const body=JSON.parse(raw); requests.push({path:request.url!,body});
    if (request.url === "/start" || request.url === "/ensure") { const value=sessions.get(body.owner)||{id:randomUUID(),port:desktopPort,...(options.cdpPort ? { cdpPort: options.cdpPort } : {})}; sessions.set(body.owner,value); response.end(JSON.stringify(value)); }
    else if (request.url === "/touch") { const value=sessions.get(body.owner); if (!value || body.id!==value.id) response.writeHead(404).end(JSON.stringify({message:"Session expired"})); else response.end(JSON.stringify(value)); }
    else if (request.url === "/clipboard") { clipboards.set(body.owner,body.text); response.end('{"ok":true}'); }
    else if (request.url === "/clipboard/read") { response.end(JSON.stringify({text:clipboards.get(body.owner)||""})); }
    else if (["/stop","/clear"].includes(request.url!)) { sessions.delete(body.owner); clipboards.delete(body.owner); response.end('{"ok":true}'); }
    else response.writeHead(404).end("{}");
  });
  await new Promise<void>((resolve)=>runtime.listen(0,"127.0.0.1",resolve));
  return { environment:{AI_RUNTIME_URL:`http://127.0.0.1:${(runtime.address() as AddressInfo).port}`,AI_RUNTIME_TOKEN:token}, requests,connections,keys,sessions, async close(){ ws.clients.forEach((client)=>client.terminate()); await new Promise<void>((resolve)=>ws.close(()=>resolve())); await Promise.all([new Promise<void>((resolve)=>runtime.close(()=>resolve())),new Promise<void>((resolve)=>desktop.close(()=>resolve()))]); } };
}
