export async function readSmallImage(file: File, avatar = false) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
    throw new Error("请选择 5 MB 以内的 PNG、JPEG 或 WebP 图片。");
  }
  const bitmap = await createImageBitmap(file);
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 32_000_000) throw new Error("图片尺寸过大。");
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    canvas.width = avatar ? 192 : Math.round(bitmap.width * scale);
    canvas.height = avatar ? 192 : Math.round(bitmap.height * scale);
    const painter = canvas.getContext("2d")!;
    if (avatar) {
      const size = Math.min(bitmap.width, bitmap.height);
      painter.drawImage(bitmap, (bitmap.width - size) / 2, (bitmap.height - size) / 2, size, size, 0, 0, 192, 192);
    } else painter.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL("image/webp", 0.8);
    if (image.length > 350_000) throw new Error("图片过大，请选择较小图片。");
    return image;
  } finally { bitmap.close(); }
}
