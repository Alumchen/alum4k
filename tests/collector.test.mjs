import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { magnetLinks, addMagnets, cleanContext, libraryDraft, validateCollection } from "../scripts/115-collector/core.mjs";
import { openCollection, optionsFrom, main } from "../scripts/115-collector/collect.mjs";
import { torrentFixture } from "./torrent-fixture.mjs";
import { inspectMetadata } from "../scripts/115-collector/metadata.mjs";
import { ariaArguments, verifyMagnet, runAria } from "../scripts/115-collector/verify.mjs";
import { createUploader } from "../scripts/115-collector/sync.mjs";
import { siteOrigin, siteRequest, atomicJson } from "../scripts/115-collector/site.mjs";

const magnet = (digit) => `magnet:?xt=urn:btih:${digit.repeat(40)}`;
async function temporary(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "alum4k-collector-test-"));
  t.after(async () => {
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep + "alum4k-collector-test-"));
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}
test("collector accepts standard BTIH magnets, retains query parameters and deduplicates case", () => {
  const source = `${magnet("A")}&dn=${encodeURIComponent("资源名称")}&tr=${encodeURIComponent("https://tracker.invalid/announce")}`;
  const parsed = magnetLinks(`复制的链接： ${source} \n${magnet("a")}`);
  assert.equal(parsed.length, 1); assert.equal(parsed[0].hash, "a".repeat(40));
  assert.equal(parsed[0].magnet, source);
  const first = magnetLinks(source)[0]; assert.equal(first.magnet, source); assert.equal(first.displayName, "资源名称");
  for (const invalid of ["account-token=secret", "https://example.com/file", "javascript:alert(1)", "magnet:?xt=urn:btih:short", "magnet://host/?xt=urn:btih:" + "a".repeat(40), `${magnet("a")}#fragment`, `${magnet("a")}&xt=urn:btih:${"b".repeat(40)}`, "x".repeat(32769)]) assert.deepEqual(magnetLinks(invalid), []);
});
test("collector snapshots metadata, keeps missing metadata pending and does not invent update dates", () => {
  const context = { title: "测试电影", year: 2026, category: "电影", resourceTitle: "4K版本", size: "50 GB", quality: "2160p / 4K" };
  const first = addMagnets([], magnet("a"), context, "2026-10-17T00:00:00.000Z");
  context.title = "另一部电影";
  assert.equal(first.records[0].title, "测试电影");
  const next = addMagnets(first.records, [magnet("A"), magnet("b")], {});
  assert.equal(next.added.length, 1); assert.equal(next.records.length, 2); assert.equal(first.records.length, 1);
  const draft = libraryDraft(next.records);
  assert.equal(draft.length, 1); assert.equal(draft[0].categoryMode, "manual");
  assert.equal(draft[0].resources[0].resolution, "2160p / 4K");
  assert.equal(draft[0].resources[0].access, "vip"); assert.equal(draft[0].resources[0].url, magnet("a"));
  assert.equal(draft[0].resources[0].updatedAt, undefined);
  assert.deepEqual(validateCollection({ schemaVersion: 1, records: next.records }), next.records);
  assert.throws(() => validateCollection({ schemaVersion: 1, records: [...next.records, next.records[0]] }));
  assert.throws(() => validateCollection({ schemaVersion: 1, records: [{ ...next.records[0], hash: "bad" }] }));
  assert.throws(() => validateCollection({ schemaVersion: 1, records: [{ ...next.records[0], title: { text: "bad" } }] }));
});
test("collector groups named resources by title, year and type with stable IDs", () => {
  let records = addMagnets([], `${magnet("a")}\n${magnet("b")}`, { title: "测试", year: 2020 }).records;
  records = addMagnets(records, magnet("c"), { title: "测试", year: 2021 }).records;
  records = addMagnets(records, magnet("d"), { title: "测试", year: 2020, category: "电视剧" }).records;
  const draft = libraryDraft(records); assert.equal(draft.length, 3);
  assert.equal(draft[0].resources.length, 2); assert.equal(draft[2].mediaType, "tv");
  assert.equal(libraryDraft(records.slice().reverse()).find((item) => item.mediaType === "movie" && item.year === 2020).id, draft[0].id);
  for (const context of [{ year: "wrong" }, { year: 2026.5 }, { title: "x".repeat(101) }, { title: "line\nbreak" }, { category: "unknown" }, { mediaType: "unknown" }, { quality: "invalid" }]) assert.throws(() => cleanContext(context));
});
test("collector persists concurrent additions, locks its directory and resumes without duplicates", async (t) => {
  const directory = await temporary(t); const collection = await openCollection(directory);
  await assert.rejects(openCollection(directory), /已有收集器/);
  try {
    await Promise.all([collection.add(magnet("a"), { title: "样例" }), collection.add(magnet("b"), { title: "样例" }), collection.add(magnet("A"), { title: "样例" })]);
    assert.equal(collection.records.length, 2);
    const json = JSON.parse(await readFile(path.join(directory, "collection.json"), "utf8")); assert.equal(json.records.length, 2);
    assert.equal((await readFile(path.join(directory, "magnets.txt"), "utf8")).trim().split("\n").length, 2);
    assert.equal(JSON.parse(await readFile(path.join(directory, "library-import.json"), "utf8"))[0].resources.length, 2);
  } finally { await collection.close(); }
  const resumed = await openCollection(directory);
  try { assert.equal((await resumed.add(magnet("A"), {})).length, 0); await resumed.export(); }
  finally { await resumed.close(); }
  assert.ok((await readdir(directory)).every((name) => !name.endsWith(".tmp") && name !== ".collector.lock"));
});
test("collector refuses corrupt existing data without overwriting it or leaving a lock", async (t) => {
  const directory = await temporary(t); const file = path.join(directory, "collection.json");
  await writeFile(file, '{"schemaVersion":2,"records":[]}');
  await assert.rejects(openCollection(directory));
  assert.equal(await readFile(file, "utf8"), '{"schemaVersion":2,"records":[]}');
  assert.equal((await readdir(directory)).includes(".collector.lock"), false);
});
test("collector imports local TXT without starting a clipboard reader", async (t) => {
  const directory = await temporary(t); const input = path.join(directory, "input.txt"); const output = path.join(directory, "out");
  await writeFile(input, `ordinary text\n${magnet("a")}\n${magnet("b")}\n${magnet("A")}`);
  await main(["--input", input, "--output", output, "--title", "TXT样例", "--year", "2026"]);
  assert.equal(JSON.parse(await readFile(path.join(output, "collection.json"), "utf8")).records.length, 2);
  assert.equal(JSON.parse(await readFile(path.join(output, "library-import.json"), "utf8"))[0].title, "TXT样例");
  assert.ok(optionsFrom(["--help"]).help);
  for (const args of [["--unknown"], ["--title"], ["--duration", "-1"], ["--year", "bad"]]) assert.throws(() => optionsFrom(args));
});
test("Windows clipboard helper self-test is ASCII, filtered and does not read the real clipboard", { skip: process.platform !== "win32" }, () => {
  const executable = path.join(process.env.SystemRoot || "C:\\Windows", "System32/WindowsPowerShell/v1.0/powershell.exe");
  const helper = fileURLToPath(new URL("../scripts/115-collector/watch-clipboard.ps1", import.meta.url));
  const result = spawnSync(executable, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-STA", "-File", helper, "-SelfTest"], { windowsHide: true, encoding: "utf8", timeout: 15000 });
  assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout.trim()).ok, true);
});

test("metadata is parsed from torrent bytes and must match the requested hash", async () => {
  for (const [name, quality] of [["Sample.2160p.BluRay.REMUX.mkv", "4K蓝光原盘"], ["Sample.2160p.BluRay.mkv", "4K蓝光"], ["Sample.2160p.WEB-DL.mkv", "WEB-4K"]]) {
    const fixture = await torrentFixture(name);
    const result = await inspectMetadata(fixture.magnet, fixture.bytes);
    assert.equal(result.name, name); assert.equal(result.qualityLabel, quality); assert.equal(result.size, "1.00 GB");
    await assert.rejects(inspectMetadata(magnet("a"), fixture.bytes));
  }
  await assert.rejects(inspectMetadata(magnet("a"), Buffer.alloc(2097153)));
  await assert.rejects(inspectMetadata(magnet("a"), Buffer.from("not a torrent")));
});

test("verifier only permits fresh hash-matched metadata; timeouts and cancellation are not uploaded", async () => {
  const fixture = await torrentFixture();
  const record = { hash: fixture.hash, magnet: fixture.magnet + "&xs=http://127.0.0.1/secret&tr=http://127.0.0.1/announce" };
  let scratch;
  const result = await verifyMagnet(record, { seconds: 5, run: async (_exe, args) => {
    assert.equal(args.at(-1), fixture.magnet); assert.ok(args.includes("--bt-metadata-only=true")); assert.ok(args.includes("--no-conf=true"));
    scratch = args.find((value) => value.startsWith("--dir=")).slice(6);
    assert.ok(!args.some((value) => value.includes("127.0.0.1")));
    await writeFile(path.join(scratch, `${fixture.hash}.torrent`), fixture.bytes); return 0;
  } });
  assert.equal(result.status, "verified"); assert.equal(result.metadata.hash, fixture.hash);
  await assert.rejects(readdir(scratch));
  assert.equal((await verifyMagnet(record, { seconds: 5, run: async () => 1 })).status, "unknown");
  assert.equal((await verifyMagnet({ ...record, hash: "b".repeat(40) })).status, "invalid");
  const controller = new AbortController(); controller.abort();
  assert.equal((await verifyMagnet(record, { signal: controller.signal, run: async () => 0 })).status, "unknown");
  assert.throws(() => ariaArguments("invalid", "x", 5));
  await assert.rejects(runAria("alum4k-no-such-aria2-executable", [], 20));
});

test("upload queue skips unknown, invalid and missing identity, serializes work and resumes", async (t) => {
  const directory = await temporary(t); const fixture = await torrentFixture();
  const base = { ...addMagnets([], fixture.magnet, { title: "Sample", year: 2024 }).records[0] };
  let uploaded = 0; let checked = 0;
  const config = { preflight: false, session: { site: "https://site.invalid", token: "test-only" }, log: () => {},
    verify: async (record) => { checked++; return record.title === "Unknown" ? { status: "unknown", reason: "no peers" } : record.title === "Invalid" ? { status: "invalid", reason: "mismatch" } : { status: "verified", torrent: fixture.bytes.toString("base64"), checkedAt: new Date().toISOString() }; },
    request: async (_site, endpoint, options) => { uploaded++; assert.equal(endpoint, "/api/admin/collector/import"); assert.equal(options.body.torrent, fixture.bytes.toString("base64")); return { mediaId: "sample", added: true }; }
  };
  const uploader = await createUploader(directory, config);
  await Promise.all([uploader.enqueue([base, { ...base, title: "Unknown" }, { ...base, title: "Invalid" }, { ...base, title: "" }]), uploader.enqueue([base])]);
  await uploader.close(); assert.equal(uploaded, 1); assert.equal(checked, 3);
  const report = JSON.parse(await readFile(path.join(directory, "upload-report.json"), "utf8"));
  assert.deepEqual(Object.values(report).map((item) => item.status).sort(), ["invalid", "pending", "unknown", "uploaded"]);
  assert.ok(!JSON.stringify(report).includes("test-only")); assert.ok(!JSON.stringify(report).includes("torrent"));
  const resumed = await createUploader(directory, config); await resumed.enqueue([base]); await resumed.close(); assert.equal(uploaded, 1);
  await atomicJson(path.join(directory, "upload-report.json"), []);
  await assert.rejects(createUploader(directory, config), /损坏/);
});

test("site client refuses remote HTTP and never forwards administrator sessions across redirects", async () => {
  assert.equal(siteOrigin("https://www.alum4k.com/"), "https://www.alum4k.com");
  for (const value of ["http://site.invalid", "https://user:pass@site.invalid", "https://site.invalid/admin", "https://site.invalid/?token=secret", "file:///x"]) assert.throws(() => siteOrigin(value));
  await siteRequest("http://127.0.0.1:1234", "/api/auth/me", { token: "test-token", fetcher: async (_url, options) => {
    assert.equal(options.redirect, "error"); assert.equal(options.headers.authorization, "Bearer test-token"); return new Response('{"user":{"role":"admin"}}');
  } });
  await assert.rejects(siteRequest("https://site.invalid", "/api/auth/me", { fetcher: async () => new Response("secret-bearing server error", { status: 401 }) }), (error) => !error.message.includes("secret-bearing"));
});
