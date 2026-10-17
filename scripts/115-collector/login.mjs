import { createInterface } from "node:readline/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { atomicJson, siteOrigin, siteRequest } from "./site.mjs";

function hiddenPassword() {
  if (!process.stdin.isTTY) throw new Error("请在交互终端输入管理员密码，不要把密码放在命令或聊天里。");
  return new Promise((resolve, reject) => {
    let password = "";
    process.stdout.write("管理员密码（不回显）: ");
    const wasRaw = process.stdin.isRaw;
    process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding("utf8");
    const finish = (error) => { process.stdin.off("data", input); process.stdin.setRawMode(wasRaw); process.stdin.pause(); process.stdout.write("\n"); error ? reject(error) : resolve(password); };
    const input = (chunk) => {
      for (const character of chunk) {
        if (character === "\u0003") { finish(new Error("登录已取消。")); return; }
        if (character === "\r" || character === "\n") { finish(); return; }
        if (character === "\u007f" || character === "\b") password = password.slice(0, -1);
        else if (!/[\x00-\x1f]/.test(character) && password.length < 1024) password += character;
      }
    };
    process.stdin.on("data", input);
  });
}
export async function login(args = process.argv.slice(2)) {
  let directory = fileURLToPath(new URL("../../data/115-collector/", import.meta.url));
  let site = "https://www.alum4k.com"; let username = "admin";
  for (let index = 0; index < args.length; index++) {
    const flag = args[index]; const value = args[++index];
    if (!["--site", "--output", "--username"].includes(flag) || !value) throw new Error("可用参数：--site 网站域名 --output 保存目录 --username 管理员名。");
    if (flag === "--site") site = value; else if (flag === "--output") directory = path.resolve(value); else username = value;
  }
  site = siteOrigin(site);
  if (!process.stdin.isTTY) throw new Error("需要交互终端，密码不会保存或上传到 GitHub。");
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try { username = (await prompt.question(`管理员用户名 [${username}]: `)).trim() || username; }
  finally { prompt.close(); }
  const password = await hiddenPassword();
  const result = await siteRequest(site, "/api/auth/login", { body: { username, password } });
  if (result.user?.role !== "admin" || typeof result.token !== "string" || !result.token) throw new Error("不是有效管理员账号，未保存会话。");
  await atomicJson(path.join(directory, "site-session.json"), { site, token: result.token });
  console.log(`已保存 ${site} 的本地管理员会话。仅保存在收集器目录，不保存密码。退出会话可删除 site-session.json。`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) login().catch((error) => { console.error(error.message); process.exitCode = 1; });
