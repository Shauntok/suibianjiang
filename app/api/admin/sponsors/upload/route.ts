import { NextResponse } from "next/server";

import {
  canManageSponsors,
  getAdminActor,
} from "@/lib/admin/authorization";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  isSameOriginRequest,
  SPONSOR_ADMIN_NO_STORE_HEADERS,
} from "@/lib/sponsors/admin-service";
import {
  createSponsorImagePath,
  isSponsorUploadFile,
  readBoundedMultipart,
  SponsorImagePolicyError,
  validateSponsorImage,
  validateSponsorUploadFields,
} from "@/lib/sponsors/image-policy";

export const dynamic = "force-dynamic";

const allowedFormFields = new Set(["campaignId", "placement", "file"]);

export async function POST(request: Request) {
  try {
    if (!isSameOriginRequest(request)) {
      return json({ error: "Forbidden" }, 403);
    }

    const actor = await getAdminActor();

    if (!actor) {
      return json({ error: "Unauthorized" }, 401);
    }

    if (!canManageSponsors(actor.role)) {
      return json({ error: "Forbidden" }, 403);
    }

    const formData = await readBoundedMultipart(request);
    const { campaignId, placement, file } = readUploadForm(formData);
    const validatedImage = await validateSponsorImage(file);
    const path = createSponsorImagePath(
      campaignId,
      placement,
      validatedImage.extension
    );
    const bucket = supabaseAdmin.storage.from("images");
    const { error: uploadError } = await bucket.upload(path, file, {
      contentType: validatedImage.mediaType,
      upsert: false,
    });

    if (uploadError) {
      throw new Error("Sponsor image storage upload failed.");
    }

    try {
      const {
        data: { publicUrl },
      } = bucket.getPublicUrl(path);

      if (typeof publicUrl !== "string" || !publicUrl) {
        throw new Error("Sponsor image public URL was unavailable.");
      }

      return json({ path, publicUrl }, 201);
    } catch (error) {
      await removeUploadedObject(bucket, path);
      throw error;
    }
  } catch (error) {
    if (error instanceof SponsorImagePolicyError) {
      return json({ error: error.message }, error.status);
    }

    console.error("sponsor image upload failed", error);
    return json({ error: "Unable to upload sponsor image." }, 500);
  }
}

function readUploadForm(formData: FormData) {
  for (const key of formData.keys()) {
    if (!allowedFormFields.has(key)) {
      throw invalidUploadForm();
    }
  }

  const campaignIds = formData.getAll("campaignId");
  const placements = formData.getAll("placement");
  const files = formData.getAll("file");

  if (
    campaignIds.length !== 1 ||
    placements.length !== 1 ||
    files.length !== 1
  ) {
    throw invalidUploadForm();
  }

  const fields = validateSponsorUploadFields(campaignIds[0], placements[0]);
  const file = files[0];

  if (!isSponsorUploadFile(file)) {
    throw invalidUploadForm();
  }

  return { ...fields, file };
}

async function removeUploadedObject(
  bucket: ReturnType<typeof supabaseAdmin.storage.from>,
  path: string
): Promise<void> {
  try {
    const { error } = await bucket.remove([path]);

    if (error) {
      console.error("sponsor image cleanup failed");
    }
  } catch {
    console.error("sponsor image cleanup failed");
  }
}

function invalidUploadForm(): SponsorImagePolicyError {
  return new SponsorImagePolicyError(400, "Invalid sponsor image upload.");
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: SPONSOR_ADMIN_NO_STORE_HEADERS,
  });
}
