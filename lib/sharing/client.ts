export type ShareOutcome = "shared" | "cancelled" | "unsupported" | "failed";

export async function copyShareText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand("copy");
  } finally {
    textarea.remove();
  }
}

export async function shareLink({
  title,
  url,
}: {
  title: string;
  url: string;
}): Promise<ShareOutcome> {
  if (!navigator.share) return "unsupported";

  try {
    await navigator.share({
      title,
      text: `在小时代读到：${title}`,
      url,
    });
    return "shared";
  } catch (error) {
    return isShareCancellation(error) ? "cancelled" : "failed";
  }
}

export async function loadStoryFile(url: string, filename: string, signal?: AbortSignal) {
  const response = await (signal ? fetch(url, { signal }) : fetch(url));
  if (!response.ok) throw new Error("share-card-unavailable");

  return new File([await response.blob()], filename, { type: "image/png" });
}

export async function shareStoryFile({
  file,
  title,
  url,
}: {
  file: File;
  title: string;
  url: string;
}): Promise<ShareOutcome> {
  if (!navigator.share || !navigator.canShare?.({ files: [file] })) {
    return "unsupported";
  }

  try {
    await navigator.share({
      files: [file],
      title,
      text: `在小时代读到：${title}\n${url}`,
    });
    return "shared";
  } catch (error) {
    return isShareCancellation(error) ? "cancelled" : "failed";
  }
}

export function downloadStoryFile(file: File) {
  const href = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = file.name;
  document.body.appendChild(anchor);

  try {
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(href);
  }
}

function isShareCancellation(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}
