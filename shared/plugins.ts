export interface PluginManifest {
  schemaVersion: 1;
  id: string;
  version: string;
  name: string;
  description: string;
  category: string;
  entry: string;
  adminEntry: string;
  icon: "film" | "monitor" | "cpu" | "bot";
  logo: string;
}
export interface PluginPreferences { id: string; name: string; description: string; enabled: boolean; order: number; }
export type InstalledPlugin = PluginManifest & Pick<PluginPreferences, "enabled" | "order">;
