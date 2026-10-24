import { writeFile } from "node:fs/promises";
import { collectWindowsSource } from "../server/windows-source";
const store = await collectWindowsSource();
await writeFile(new URL("../plugins/alumwindows/catalog.seed.json", import.meta.url), JSON.stringify(store, null, 2) + "\n", "utf8");
console.log(`Collected ${store.categories.length} categories, ${store.items.length} resources, ${store.items.reduce((count, item) => count + item.links.length, 0)} visible download links. Source: ${store.source}`);
