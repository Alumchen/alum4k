import parseTorrent from "parse-torrent";
import { magnetLinks } from "./core.mjs";

export const maximumMetadataBytes = 2 * 1024 * 1024;
export async function inspectMetadata(magnet, bytes) {
  const links = magnetLinks(magnet);
  if (links.length !== 1 || links[0].magnet !== magnet || !Buffer.isBuffer(bytes) || !bytes.length || bytes.length > maximumMetadataBytes) throw new Error("Invalid magnet or metadata size.");
  let torrent;
  try { torrent = await parseTorrent(bytes); } catch { throw new Error("Invalid torrent metadata."); }
  if (torrent.infoHash !== links[0].hash || !Number.isSafeInteger(torrent.length) || torrent.length <= 0 || !Array.isArray(torrent.files) || !torrent.files.length || torrent.files.length > 20000 || torrent.files.some((file) => !Number.isSafeInteger(file.length) || file.length < 0)) throw new Error("Metadata hash or file lengths do not match.");
  if (!Number.isSafeInteger(torrent.pieceLength) || torrent.pieceLength <= 0 || !Array.isArray(torrent.pieces) || torrent.pieces.length !== Math.ceil(torrent.length / torrent.pieceLength)) throw new Error("Invalid torrent piece count.");
  const name = String(torrent.name || "").replace(/[\x00-\x1f]/g, "").slice(0, 160);
  const resolution = /2160|\b4k\b|\bUHD\b/i.test(name) ? "2160p / 4K" : /1080/.test(name) ? "1080p" : /720/.test(name) ? "720p" : "";
  const qualityLabel = resolution === "2160p / 4K" ? /REMUX|BDMV/i.test(name) ? "4K蓝光原盘" : /BluRay|Blu[ .-]?Ray/i.test(name) ? "4K蓝光" : /WEB/i.test(name) ? "WEB-4K" : resolution : resolution;
  return { hash: links[0].hash, name, size: `${(torrent.length / 1e9).toFixed(2)} GB`, resolution, qualityLabel };
}
