export function pickHash(slug) {
  return `#pick=${encodeURIComponent(slug)}`;
}

export function parsePickHash(hash) {
  const m = /^#pick=(.+)$/.exec(hash || "");
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

export function shareLink(slug) {
  return `${location.origin}${location.pathname}${pickHash(slug)}`;
}

// phones get the share sheet, desktops the clipboard
export async function copyOrShare(url, title) {
  try {
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      await navigator.share({ title, url });
      return "shared";
    }
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch (e) {
    return e?.name === "AbortError" ? "shared" : "failed";
  }
}
