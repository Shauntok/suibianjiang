import { createSupabaseServerClient } from "@/lib/supabase-server";

export type AdminActor = {
  id: string;
  role: string | null;
};

export function canManageSponsors(role: unknown): boolean {
  return role === "owner" || role === "admin";
}

export async function getAdminActor(): Promise<AdminActor | null> {
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
