export function validateImage(input: unknown, label = "图片", maxBytes = 1024 * 1024) {
  if (input === "") return "";
  if (typeof input !== "string" || input.length > Math.ceil(maxBytes * 4 / 3) + 100) throw new Error(`${label}超过大小限制。`);
  const match = input.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) throw new Error(`${label}只支持 PNG、JPEG 或 WebP，不支持 SVG 或外部链接。`);
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > maxBytes || bytes.toString("base64") !== match[2]) throw new Error(`${label}格式或大小不正确。`);
  const valid = match[1] === "png" ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : match[1] === "jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!valid) throw new Error(`${label}内容与图片类型不符。`);
  return input;
}
