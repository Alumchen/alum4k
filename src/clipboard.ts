export async function copyText(value: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.style.position = "fixed";
  input.style.opacity = "0";
  const focused = document.activeElement as HTMLElement | null;
  document.body.appendChild(input);
  input.select();
  let copied = false;
  try { copied = document.execCommand("copy"); }
  finally { input.remove(); focused?.focus(); }
  if (!copied) throw new Error("复制失败，请选中链接手动复制。");
}
