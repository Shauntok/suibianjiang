import "server-only";

import { createClient } from "@supabase/supabase-js";

function requireServerEnvironmentVariable(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required to create the Supabase admin client`);
  }

  return value;
}

const supabaseUrl = requireServerEnvironmentVariable(
  "NEXT_PUBLIC_SUPABASE_URL"
);
const serviceRoleKey = requireServerEnvironmentVariable(
  "SUPABASE_SERVICE_ROLE_KEY"
);

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
