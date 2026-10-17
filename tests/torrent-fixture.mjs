import parseTorrent, { toTorrentFile } from "parse-torrent";

export async function torrentFixture(name = "Sample.2024.2160p.WEB-DL.mkv", length = 1000000000) {
  const bytes = Buffer.from(toTorrentFile({ info: { name: Buffer.from(name), length, "piece length": 16777216, pieces: Buffer.alloc(20 * Math.ceil(length / 16777216), 7) } }));
  const parsed = await parseTorrent(bytes);
  return { bytes, hash: parsed.infoHash, magnet: `magnet:?xt=urn:btih:${parsed.infoHash}` };
}
