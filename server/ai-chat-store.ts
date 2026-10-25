import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { aiOwner, AiError } from "./ai";
import type { StoredAiChat } from "../shared/ai-chat";

const directory = path.resolve(process.cwd(), "data/ai/chats");
let pending: Promise<unknown> = Promise.resolve();
export async function loadChats(username: string): Promise<StoredAiChat[]> {
  try { const result = JSON.parse(await readFile(path.join(directory, aiOwner(username) + ".json"), "utf8")); if (!Array.isArray(result) || result.length > 100 || result.some((chat) => !chat || !Array.isArray(chat.messages))) throw new Error("对话数据损坏，请联系管理员恢复备份。"); return result; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}
export function changeChats<T>(username: string, update: (chats: StoredAiChat[]) => T) {
  const next = pending.then(async () => {
    const chats = await loadChats(username); const result = update(chats);
    await mkdir(directory, { recursive: true }); const file = path.join(directory, aiOwner(username) + ".json"); const temporary = file + "." + crypto.randomUUID() + ".tmp";
    await writeFile(temporary, JSON.stringify(chats, null, 2) + "\n", { mode: 0o600 }); await rename(temporary, file); return result;
  }); pending = next.catch(() => undefined); return next;
}
export function findChat(chats: StoredAiChat[], id: string) { const chat = chats.find((chat) => chat.id === id); if (!chat) throw new AiError("对话不存在。", 404); return chat; }
