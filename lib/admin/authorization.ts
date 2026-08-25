import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type AdminActor = {
  id: string;
  role: string | null;
};

export function canManageSponsors(role: unknown): boolean {
  return role === "owner" || role === "admin";
}

export function canManageFeedback(role: unknown): boolean {
  return role === "owner" || role === "admin";
}

export async function getAdminActor(
  request?: Request
): Promise<AdminActor | null> {
  const bearerToken = request ? readBearerToken(request) : null;

  if (bearerToken) {
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(bearerToken);

    if (authError || !user) return null;

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    return {
      id: user.id,
      role: typeof profile?.role === "string" ? profile.role : null,
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw profileError;
  }

  return {
    id: user.id,
    role: typeof profile?.role === "string" ? profile.role : null,
  };
}

function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization")?.trim();
  const match = authorization?.match(/^Bearer\s+([^\s]+)$/i);

  return match?.[1] || null;
}
