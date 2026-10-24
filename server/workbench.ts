import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { defaultWorkbench, pluginRegistry, installedPlugins, type WorkbenchStore } from "../shared/workbench";

const file = path.resolve(process.cwd(), "data/workbench.json");
let pending: Promise<unknown> = Promise.resolve();
function text(value: unknown, max: number, required = false) {
  if (typeof value !== "string" || value.length > max || /[\x00-\x1f\x7f]/.test(value) || required && !value.trim()) throw new Error("内容为空、格式不正确或超出长度限制。");
  return value.trim();
}
function validate(value: WorkbenchStore): WorkbenchStore {
  if (!value || !value.settings || !Array.isArray(value.plugins) || value.plugins.length !== pluginRegistry.length) throw new Error("工作台配置不正确。");
  const settings = { name: text(value.settings.name, 40, true), description: text(value.settings.description, 240) };
  const ids = new Set<string>();
  const plugins = value.plugins.map((plugin) => {
    if (!plugin || !pluginRegistry.some((manifest) => manifest.id === plugin.id) || ids.has(plugin.id) || typeof plugin.enabled !== "boolean" || !Number.isInteger(plugin.order) || plugin.order < 0 || plugin.order > 999) throw new Error("插件配置不正确。");
    ids.add(plugin.id);
    return { id: plugin.id, name: text(plugin.name, 40, true), description: text(plugin.description, 240), enabled: plugin.enabled, order: plugin.order };
  });
  return { settings, plugins };
}
export async function loadWorkbench(): Promise<WorkbenchStore> {
  try {
    const value = JSON.parse(await readFile(file, "utf8"));
    // New built-in manifests receive defaults without rewriting existing preferences.
    if (Array.isArray(value.plugins)) for (const plugin of defaultWorkbench.plugins) if (!value.plugins.some((entry: { id: string }) => entry?.id === plugin.id)) value.plugins.push(plugin);
    return validate(value);
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(defaultWorkbench); throw error; }
}
export function saveWorkbench(input: WorkbenchStore) {
  const next = pending.then(async () => {
    const value = validate(input);
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 }); await rename(temporary, file);
    return value;
  }); pending = next.catch(() => undefined); return next;
}
export async function mediaPluginEnabled() { return installedPlugins(await loadWorkbench()).some((plugin) => plugin.id === "alum4k" && plugin.enabled); }
export async function pluginEnabled(id: string) { return installedPlugins(await loadWorkbench()).some((plugin) => plugin.id === id && plugin.enabled); }
