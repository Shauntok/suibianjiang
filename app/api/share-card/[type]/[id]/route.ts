import { isSharePostType } from "@/lib/sharing/model";
import { loadPublicShareCardData } from "@/lib/server/share-card";
import { renderShareCardImage } from "@/lib/server/share-card-image";

type RouteContext = {
  params: Promise<{ type: string; id: string }>;
};

// Recheck visibility on every request, including when old share links are reused.
const CACHE_CONTROL = "private, no-store";

function notFound() {
  return new Response(null, {
    status: 404,
    headers: { "Cache-Control": CACHE_CONTROL },
  });
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { type, id: rawId } = await params;
  const id = Number(rawId);

  if (!isSharePostType(type) || !Number.isSafeInteger(id) || id < 1) {
    return notFound();
  }

  const data = await loadPublicShareCardData(type, id);
  if (!data) return notFound();

  const response = await renderShareCardImage(data);
  response.headers.set("Cache-Control", CACHE_CONTROL);
  return response;
}
