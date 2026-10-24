import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { emptyDashboard, widgetDefinitions, type Dashboard } from "../shared/dashboard";

const directory = path.resolve(process.cwd(), "data/dashboards");
let pending: Promise<unknown> = Promise.resolve();
const filename = (username: string) => path.join(directory, crypto.createHash("sha256").update(username).digest("hex") + ".json");
export class DashboardConflict extends Error {}
export async function loadDashboard(username: string): Promise<Dashboard> { try { return validate(JSON.parse(await readFile(filename(username), "utf8"))); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyDashboard(); throw error; } }
function text(value: unknown, max: number, required = false) { if (typeof value !== "string" || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value) || required && !value.trim()) throw new Error("内容为空或超出长度限制。"); return value; }
function id(value: unknown) { if (typeof value !== "string" || !/^[\w-]{1,80}$/.test(value)) throw new Error("记录 ID 不正确。"); return value; }
function list<T>(input: unknown, max: number, map: (value: any) => T): T[] { if (!Array.isArray(input) || input.length > max) throw new Error("记录数量超出限制。"); const ids = new Set(); return input.map((value) => { if (!value || typeof value !== "object" || ids.has(value.id)) throw new Error("记录不正确或 ID 重复。"); ids.add(value.id); return map(value); }); }
function date(value: unknown, time = false) {
  if (value === "" && !time) return "";
  if (typeof value !== "string" || !(time ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/ : /^\d{4}-\d{2}-\d{2}$/).test(value)) throw new Error("日期不正确。");
  const day = new Date(value.slice(0, 10) + "T00:00:00Z");
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== value.slice(0, 10) || time && (Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59)) throw new Error("日期不正确。");
  return value;
}
function validate(input: Dashboard): Dashboard {
  if (!input || !Number.isSafeInteger(input.revision) || input.revision < 0) throw new Error("工作空间版本不正确。");
  const projects = list(input.projects, 60, (project) => ({ id: id(project.id), name: text(project.name, 100, true), description: text(project.description, 2000) }));
  const tasks = list(input.tasks, 300, (task) => {
    if (typeof task.done !== "boolean" || !["high", "normal", "low"].includes(task.priority) || typeof task.projectId !== "string" || task.projectId && !projects.some((project) => project.id === task.projectId)) throw new Error("任务状态或项目不正确。");
    return { id: id(task.id), title: text(task.title, 160, true), done: task.done, priority: task.priority, projectId: task.projectId, dueDate: date(task.dueDate), notes: text(task.notes, 5000) };
  });
  const notes = list(input.notes, 100, (note) => ({ id: id(note.id), title: text(note.title, 100), content: text(note.content, 20000) }));
  const events = list(input.events, 150, (event) => ({ id: id(event.id), title: text(event.title, 160, true), start: date(event.start, true) }));
  const layout = list(input.layout, widgetDefinitions.length, (widget) => { if (!widgetDefinitions.some((item) => item.id === widget.id) || typeof widget.hidden !== "boolean" || !["small", "wide"].includes(widget.size)) throw new Error("桌面布局不正确。"); return { id: widget.id, hidden: widget.hidden, size: widget.size }; });
  if (layout.length !== widgetDefinitions.length) throw new Error("桌面模块配置不完整。");
  return { revision: input.revision, layout, tasks, projects, notes, events };
}
export function saveDashboard(username: string, input: Dashboard) {
  const next = pending.then(async () => {
    const value = validate(input); const before = await loadDashboard(username);
    if (value.revision !== before.revision) throw new DashboardConflict("其他页面已更新工作空间，请先导出当前内容，再重新载入。");
    value.revision = before.revision + 1;
    await mkdir(directory, { recursive: true }); const file = filename(username); const temporary = `${file}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 }); await rename(temporary, file); return value;
  }); pending = next.catch(() => undefined); return next;
}
