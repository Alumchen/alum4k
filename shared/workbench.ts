import alum4k from "../plugins/alum4k/manifest";
import alumwindows from "../plugins/alumwindows/manifest";
import type { InstalledPlugin, PluginPreferences } from "./plugins";

// Route and code ownership stay in the checked-in manifest, never in editable settings.
export const pluginRegistry = [alum4k, alumwindows];
export interface WorkbenchSettings { name: string; description: string; }
export interface WorkbenchStore { settings: WorkbenchSettings; plugins: PluginPreferences[]; }
export interface WorkbenchData { settings: WorkbenchSettings; plugins: InstalledPlugin[]; }
export const defaultWorkbench: WorkbenchStore = {
  settings: { name: "Alum 工作台", description: "常用应用与项目，集中在这里。" },
  plugins: pluginRegistry.map((plugin, order) => ({ id: plugin.id, name: plugin.name, description: plugin.description, enabled: true, order }))
};
export function installedPlugins(store: WorkbenchStore): InstalledPlugin[] {
  return pluginRegistry.map((manifest, order) => {
    const preference = store.plugins.find((plugin) => plugin.id === manifest.id);
    return { ...manifest, name: preference?.name ?? manifest.name, description: preference?.description ?? manifest.description, enabled: preference?.enabled ?? true, order: preference?.order ?? order };
  }).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}
