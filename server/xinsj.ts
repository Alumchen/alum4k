import { mkdir, readFile, writeFile, rename, copyFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { chipHref, postKinds, type ChipStore, type ChipPost, type ChipSettings, type PublicChipPost } from "../shared/xinsj";
import type { PublicUser } from "./auth";

const file = path.resolve(process.cwd(), "data/xinsj/forum.json");
let pending: Promise<unknown> = Promise.resolve();
export class ChipError extends Error { constructor(message: string, public status = 400) { super(message); } }
const categories = ["光刻工艺", "刻蚀工艺", "薄膜沉积", "清洗与湿法", "离子注入与热处理", "CMP平坦化", "工艺整合", "缺陷检测与良率", "设备与厂务", "先进封装"];
const initialSettings: ChipSettings = { name: "Alum芯世界", description: "聚焦晶圆制造、工艺整合与良率提升的技术交流社区", announcement: "欢迎工艺、设备、整合和良率工程师交流经验。发布前请脱敏，勿分享未获授权的配方、产线数据或客户信息。", guidelines: "尊重原创，注明来源；禁止发布商业机密、工艺配方和未经授权的产线数据。提问请说明工艺环节、异常现象、可公开的测量结果和已尝试的排查方法。", categories, reviewPosts: true, reviewComments: true };
function seed(): ChipStore {
  const welcome: ChipPost = { id: "welcome", title: "欢迎来到 Alum芯世界：从一个工程问题开始交流", content: "这里是面向半导体工艺制造从业者与学习者的技术交流空间。\n\n这里聚焦光刻、刻蚀、薄膜沉积、清洗湿法、离子注入与热处理、CMP、工艺整合、良率分析、设备厂务和先进封装。欢迎分享脱敏的工艺经验与排查思路。\n\n提问建议\n1. 描述应用背景与预期结果。\n2. 说明工具版本、关键参数及复现条件。\n3. 写出已经尝试过的方法。\n\n发布的帖子和评论默认需要管理员审核。请勿上传未获授权的资料或商业机密。", category: "工艺整合", kind: "文章", tags: ["社区指南", "新手入门"], cover: "", link: "", author: "system", authorName: "Alum芯世界", createdAt: "2026-10-24T00:00:00.000Z", updatedAt: "2026-10-24T00:00:00.000Z", status: "published", reviewNote: "", pinned: true, featured: false, locked: false, likes: [], saves: [] };
  // Original starter guides, not copied articles or fabricated community activity.
  const guides: Partial<ChipPost>[] = [
    { id: "design-notes", title: "工艺实验记录怎么写？一份可复用的工程笔记提纲", category: "工艺整合", tags: ["工程笔记", "社区导读"], content: "一份便于交流的工艺实验记录，可以从实验目的、公开条件、观察结果和后续验证四部分开始。\n\n建议保留的问题\n• 本次实验要回答什么问题？\n• 哪些条件可以公开，哪些信息需要脱敏？\n• 对比组与实验组有哪些已知差异？\n• 如何验证结果，哪些问题仍未解决？\n\n欢迎分享记录方法与分析思路。涉及工艺配方、客户产品或实际产线数据时，请勿直接公开。" },
    { id: "simulation-question", title: "工艺异常求助模板：怎样把问题描述清楚", category: "刻蚀工艺", kind: "资料", tags: ["工艺异常", "提问模板"], content: "请复制这份提纲，替换为你自己的实际情况。\n\n【目标】希望得到什么结果？\n【环节】工艺步骤、设备类型与问题发生的阶段。\n【条件】允许公开的实验背景、测量方法和对比条件。\n【现象】异常表现、发生范围、重复性与预期的差异。\n【证据】脱敏的测量结果、缺陷图片或趋势记录。\n【尝试】已经验证过的假设和排除的方法。\n\n请勿公开工艺配方、厂内设备编号、客户信息或任何未获授权的生产数据。" },
    { id: "packaging-notebook", title: "缺陷与良率交流：先整理你的问题边界", category: "缺陷检测与良率", tags: ["缺陷分析", "社区导读"], content: "讨论缺陷、量测或良率异常前，可以先把信息整理成一张问题清单。\n\n对象：工艺环节与样品的可公开背景。\n条件：量测方法、对照条件与适用范围。\n现象：问题发生的时机、频率和可观察的表现。\n证据：测量记录、图片、批次对比与已做的排查。\n目标：希望讨论定位思路、验证方法还是经验复盘？\n\n本帖是社区交流提纲，不是具体产品的工程判定。欢迎带着真实案例开启新讨论。" },
    { id: "resource-sharing", title: "资料分享公约：把来源和适用范围一起留下", category: "工艺整合", kind: "资料", tags: ["资料分享", "社区公约"], content: "分享技术资料时，除了标题和链接，也请写下：\n\n1. 原始作者或发布机构。\n2. 资料主题、语言及版本。\n3. 适合什么背景的读者。\n4. 你认为值得阅读的部分。\n5. 是否有公开的使用或转载说明。\n\n优先链接到原作者公开的文档页面。请勿分享破解软件、泄密资料或未经授权的付费内容。" }
  ];
  return { revision: 0, settings: structuredClone(initialSettings), comments: [], posts: [welcome, ...guides.map((guide) => ({ ...welcome, pinned: false, ...guide }))] };
}
function text(raw: unknown, max: number, required = false): string { if (typeof raw !== "string" || raw.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(raw) || required && !raw.trim()) throw new ChipError("内容为空、超出长度限制或格式不正确。"); return raw.trim(); }
function settings(raw: ChipSettings): ChipSettings {
  if (!raw || !Array.isArray(raw.categories) || raw.categories.length < 1 || raw.categories.length > 30 || typeof raw.reviewPosts !== "boolean" || typeof raw.reviewComments !== "boolean") throw new ChipError("社区设置不正确。");
  const values = raw.categories.map((name) => text(name, 30, true)); if (new Set(values).size !== values.length) throw new ChipError("分类不能重复。");
  return { name: text(raw.name, 40, true), description: text(raw.description, 240), announcement: text(raw.announcement, 2000), guidelines: text(raw.guidelines, 3000), categories: values, reviewPosts: raw.reviewPosts, reviewComments: raw.reviewComments };
}
export async function loadChip(): Promise<ChipStore> {
  try { const store = JSON.parse(await readFile(file, "utf8")); if (!store || !Number.isSafeInteger(store.revision) || !Array.isArray(store.posts) || !Array.isArray(store.comments)) throw new Error("社区数据损坏，请从备份恢复。"); settings(store.settings); return store; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return seed(); throw error; }
}
// All writes share one queue, including reactions and moderation, to avoid lost updates.
export function mutateChip(change: (store: ChipStore) => void) {
  const next = pending.then(async () => { const store = await loadChip(); change(store); store.revision++; await mkdir(path.dirname(file), { recursive: true }); try { await copyFile(file, file + ".bak"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } const tmp = `${file}.${crypto.randomUUID()}.tmp`; await writeFile(tmp, JSON.stringify(store, null, 2) + "\n", { mode: 0o600 }); await rename(tmp, file); return store; }); pending = next.catch(() => undefined); return next;
}
export function publicPost(store: ChipStore, post: ChipPost, user?: PublicUser | null): PublicChipPost {
  const { likes, saves, reviewNote, ...safe } = post;
  return { ...safe, likeCount: likes.length, liked: !!user && likes.includes(user.username), saved: !!user && saves.includes(user.username), commentCount: store.comments.filter((comment) => comment.postId === post.id && comment.status === "published").length, ...(user && (user.role === "admin" || user.username === post.author) ? { reviewNote } : {}) };
}
function postFields(raw: ChipPost, store: ChipStore) {
  if (!raw || !store.settings.categories.includes(raw.category) || !postKinds.includes(raw.kind) || !Array.isArray(raw.tags) || raw.tags.length > 6) throw new ChipError("请选择有效的分类、内容类型和标签。");
  const cover = text(raw.cover ?? "", 2000); const link = text(raw.link ?? "", 2000);
  if (cover && !chipHref(cover) || link && !chipHref(link)) throw new ChipError("图片和资料地址需为 http 或 https 链接。");
  return { title: text(raw.title, 160, true), content: text(raw.content, 40000, true), category: raw.category, kind: raw.kind, tags: [...new Set(raw.tags.map((tag) => text(tag, 24, true)))], cover, link };
}
function revision(store: ChipStore, value: unknown) { if (value !== store.revision) throw new ChipError("内容已更新，请刷新后重试。当前编辑内容仍保留。", 409); }
export function saveChipSettings(raw: ChipSettings, version: unknown) { return mutateChip((store) => { revision(store, version); const next = settings(raw); if (store.posts.some((post) => !next.categories.includes(post.category))) throw new ChipError("请先调整已有帖子的分类，再删除此分类。"); store.settings = next; }); }
export function saveChipPost(raw: ChipPost, user: PublicUser, id?: string, version?: unknown) {
  return mutateChip((store) => {
    const old = id ? store.posts.find((post) => post.id === id) : undefined; const admin = user.role === "admin";
    if (id && !old) throw new ChipError("帖子不存在。", 404);
    if (old && !admin && old.author !== user.username) throw new ChipError("不能修改他人的帖子。", 403);
    if (old) { if (admin && typeof version !== "string") revision(store, version); else if (version !== old.updatedAt) throw new ChipError("帖子已更新，请重新打开后编辑。", 409); if (old.locked && !admin) throw new ChipError("该帖子已锁定。", 403); }
    if (!old && store.posts.length >= 10000) throw new ChipError("帖子数量达到上限。");
    if (!old && !admin && store.posts.some((post) => post.author === user.username && Date.now() - Date.parse(post.createdAt) < 10000)) throw new ChipError("发帖过于频繁，请稍后再试。", 429);
    const fields = postFields(raw, store); const now = new Date(Math.max(Date.now(), old ? Date.parse(old.updatedAt) + 1 : 0)).toISOString();
    const status = admin ? raw.status ?? "published" : store.settings.reviewPosts ? "pending" : "published";
    if (!["pending", "published", "rejected"].includes(status)) throw new ChipError("审核状态不正确。");
    const post: ChipPost = { ...fields, id: old?.id || crypto.randomUUID(), author: old?.author || user.username, authorName: old?.authorName || user.displayName || user.username, createdAt: old?.createdAt || now, updatedAt: now, status, reviewNote: admin ? text(raw.reviewNote ?? "", 1000) : "", pinned: admin ? raw.pinned === true : old?.pinned ?? false, featured: admin ? raw.featured === true : old?.featured ?? false, locked: admin ? raw.locked === true : old?.locked ?? false, likes: old?.likes || [], saves: old?.saves || [] };
    if (old) store.posts[store.posts.indexOf(old)] = post; else store.posts.unshift(post);
  });
}
export function deleteChipPost(id: string, user: PublicUser, version: unknown) { return mutateChip((store) => { revision(store, version); if (user.role !== "admin") throw new ChipError("需要管理员权限。", 403); if (!store.posts.some((post) => post.id === id)) throw new ChipError("帖子不存在。", 404); store.posts = store.posts.filter((post) => post.id !== id); store.comments = store.comments.filter((comment) => comment.postId !== id); }); }
export function chipReaction(id: string, user: PublicUser, action: string) { return mutateChip((store) => { if (!["like", "save"].includes(action)) throw new ChipError("操作不正确。"); const post = store.posts.find((post) => post.id === id && post.status === "published"); if (!post) throw new ChipError("帖子不存在。", 404); const key = action === "like" ? "likes" : "saves"; post[key] = post[key].includes(user.username) ? post[key].filter((name) => name !== user.username) : [...post[key], user.username]; }); }
export function addChipComment(id: string, raw: unknown, user: PublicUser) { return mutateChip((store) => { const post = store.posts.find((post) => post.id === id && post.status === "published"); if (!post) throw new ChipError("帖子不存在。", 404); if (post.locked) throw new ChipError("该帖子已关闭评论。", 403); if (store.comments.length >= 50000) throw new ChipError("评论数量达到上限。"); if (user.role !== "admin" && store.comments.some((comment) => comment.author === user.username && Date.now() - Date.parse(comment.createdAt) < 3000)) throw new ChipError("评论过于频繁。", 429); store.comments.push({ id: crypto.randomUUID(), postId: id, author: user.username, authorName: user.displayName || user.username, content: text(raw, 4000, true), createdAt: new Date().toISOString(), status: store.settings.reviewComments && user.role !== "admin" ? "pending" : "published" }); }); }
export function moderateChipComment(id: string, status: unknown, version: unknown, remove = false) { return mutateChip((store) => { revision(store, version); const comment = store.comments.find((comment) => comment.id === id); if (!comment) throw new ChipError("评论不存在。", 404); if (remove) store.comments = store.comments.filter((entry) => entry.id !== id); else { if (!["published", "rejected", "pending"].includes(String(status))) throw new ChipError("审核状态不正确。"); comment.status = status as typeof comment.status; } }); }
