import { readdir, readFile, mkdir, rename, copyFile, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

export async function publishBuild(source, destination) {
  source = path.resolve(source); destination = path.resolve(destination);
  if (source === destination || source.startsWith(destination + path.sep) || destination.startsWith(source + path.sep)) throw new Error("Build directories must be separate.");
  const html = await readFile(path.join(source, "index.html"), "utf8");
  if (!html.includes('type="module"') || !html.includes("/assets/")) throw new Error("Expected a built Vite entry page.");
  for (const match of html.matchAll(/(?:src|href)="\/(assets\/[^"?#]+)"/g)) {
    const asset = path.resolve(source, match[1]);
    if (!asset.startsWith(source + path.sep)) throw new Error("Invalid asset path.");
    await readFile(asset);
  }
  async function copyTree(directory, relative = "") {
    await mkdir(path.join(destination, relative), { recursive: true });
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!relative && entry.name === "index.html") continue;
      if (entry.isSymbolicLink()) throw new Error("Build output must not contain symlinks.");
      const next = path.join(relative, entry.name);
      if (entry.isDirectory()) await copyTree(path.join(source, next), next);
      else if (entry.isFile()) await copyFile(path.join(source, next), path.join(destination, next));
    }
  }
  // Publish referenced files first; retain old hashed chunks for already-open pages.
  await copyTree(source);
  const temporary = path.join(destination, `.index-${crypto.randomUUID()}.tmp`);
  await writeFile(temporary, html, { mode: 0o644 });
  await rename(temporary, path.join(destination, "index.html"));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2] || !process.argv[3]) throw new Error("Build source and destination are required.");
  await publishBuild(process.argv[2], process.argv[3]);
  console.log("Frontend published atomically; previous hashed assets retained.");
}
