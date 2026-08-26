import { isSharePostType } from "@/lib/sharing/model";
import { loadPublicShareCardData } from "@/lib/server/share-card";
import { renderShareCardImage } from "@/lib/server/share-card-image";

type RouteContext = {
  params: Promise<{ type: string; id: string }>;
};

const CACHE_CONTROL =
  "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800";

function notFound() {
  return new Response(null, { status: 404 });
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
