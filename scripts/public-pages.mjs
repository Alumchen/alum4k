import { readFile, writeFile, rename } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// Preserve the original config text; only insert locations in top-level server blocks.
function tokens(source) {
  const result = [];
  for (let i = 0; i < source.length;) {
    if (/\s/.test(source[i])) { i++; continue; }
    if (source[i] === "#") { while (i < source.length && source[i] !== "\n") i++; continue; }
    const start = i; let value = "";
    if ('"\''.includes(source[i])) {
      const quote = source[i++]; let closed = false;
      while (i < source.length) { if (source[i] === quote) { i++; closed = true; break; } if (source[i] === "\\") { value += source[i++] + (source[i++] || ""); } else value += source[i++]; }
      if (!closed) throw new Error("Unclosed Nginx string; configuration was not changed.");
    } else if ("{};".includes(source[i])) value = source[i++];
    else {
      while (i < source.length && !/[\s{};#]/.test(source[i])) {
        if (source[i] === "\\") value += source[i++] + (source[i++] || "");
        else if (source[i] === "$" && source[i + 1] === "{") { const end = source.indexOf("}", i + 2); if (end < 0) throw new Error("Invalid Nginx variable."); value += source.slice(i, end + 1); i = end + 1; }
        else value += source[i++];
      }
    }
    result.push({ value, start, end: i });
  }
  return result;
}
export function addPublicPageLocations(source, defaultPort = 5174) {
  if (!Number.isInteger(Number(defaultPort)) || Number(defaultPort) < 1 || Number(defaultPort) > 65535) throw new Error("Invalid API port.");
  const list = tokens(source); const stack = []; const servers = []; let directive = [];
  for (const token of list) {
    if (token.value === "{") {
      const block = { name: directive[0]?.value, open: token.end, depth: stack.length, start: directive[0]?.start, close: 0 };
      stack.push(block); directive = [];
    } else if (token.value === "}") {
      const block = stack.pop(); if (!block) throw new Error("Unbalanced Nginx config."); block.close = token.start;
      if (block.name === "server" && block.depth === 0) servers.push(block);
      directive = [];
    } else if (token.value === ";") directive = [];
    else directive.push(token);
  }
  if (stack.length || !servers.length) throw new Error("Expected top-level Nginx server blocks; configuration was not changed.");
  const marker = "# alum4k-public-pages:start"; const endMarker = "# alum4k-public-pages:end";
  const proxies = list.filter((token, index) => list[index - 1]?.value === "proxy_pass").map((token) => token.value);
  const api = proxies.find((value) => /^http:\/\/(127\.0\.0\.1|localhost):\d+\/api\/?$/.test(value));
  const port = api ? Number(new URL(api).port || 80) : Number(defaultPort);
  if (port < 1 || port > 65535) throw new Error("Invalid existing API proxy port.");
  const paths = ["^~ /movie/", "^~ /tv/", "= /sitemap.xml", '~ "^/sitemap-[0-9]+[.]xml$"', "= /robots.txt"];
  const locations = paths.map((path) => `    location ${path} {\n        proxy_pass http://127.0.0.1:${port};\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n        proxy_set_header X-Forwarded-Proto $scheme;\n        proxy_intercept_errors off;\n    }`).join("\n");
  let next = source;
  for (const server of servers.sort((a, b) => b.open - a.open)) {
    const body = source.slice(server.open, server.close); const existing = body.indexOf(marker);
    const end = existing >= 0 ? body.indexOf(endMarker, existing) : -1;
    if (existing >= 0 && end < 0) throw new Error("Incomplete public-pages marker; configuration was not changed.");
    const custom = existing >= 0 ? body.slice(0, existing) + body.slice(end + endMarker.length) : body;
    const customTokens = tokens(custom);
    const hasLocation = (value) => customTokens.some((token, index) => token.value === "location" && (customTokens[index + 1]?.value === value || customTokens[index + 2]?.value === value));
    const assets = hasLocation("/assets/") ? "" : `\n    location ^~ /assets/ {\n        try_files $uri =404;\n        add_header Cache-Control "public, max-age=31536000, immutable";\n        add_header X-Content-Type-Options nosniff always;\n    }`;
    const entry = hasLocation("/index.html") ? "" : `\n    location = /index.html {\n        add_header Cache-Control "no-cache, must-revalidate" always;\n    }`;
    const hasDirective = (name) => customTokens.some((token) => token.value === name);
    const compression = hasDirective("gzip") ? "" : `\n    gzip on;${hasDirective("gzip_vary") ? "" : "\n    gzip_vary on;"}${hasDirective("gzip_types") ? "" : "\n    gzip_types text/css application/javascript text/javascript application/json image/svg+xml;"}`;
    const region = `\n    ${marker}\n${locations}${assets}${entry}${compression}\n    ${endMarker}\n`;
    if (existing >= 0) {
      const startAt = server.open + existing; const endAt = server.open + end + endMarker.length;
      next = next.slice(0, startAt) + region.trim() + next.slice(endAt);
    } else {
      if (/location\s+(?:[=^~]+\s+)?(?:\/movie\/|\/tv\/|\/sitemap\.xml|\/robots\.txt)/.test(body)) throw new Error("Existing custom public-page locations found; merge them manually before updating.");
      next = next.slice(0, server.open) + region + next.slice(server.open);
    }
  }
  return next;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2]; if (!file) throw new Error("Nginx config path is required.");
  const before = await readFile(file, "utf8"); const after = addPublicPageLocations(before, Number(process.argv[3] || 5174));
  if (before !== after) { const temporary = `${file}.alum4k.tmp`; await writeFile(temporary, after, { mode: 0o644 }); await rename(temporary, file); }
  console.log("Public routes, HTML/asset caching and compression configured; existing ports and TLS preserved.");
}
